/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { prisma } from 'src/core/database/database.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

/**
 * CandidateSnapshotService
 *
 * Responsibilities:
 *  - Given an event id (ats_candidate_event), update the AtsCandidate.currentStage and lastEventAt
 *    atomically and idempotently (only update if incoming timestamp is newer).
 *  - Keep a tiny stage history in cache (optional) for fast heatmap-ish reads.
 *
 * Public API:
 *  - updateFromEvent(eventId: string): Promise<{ updated: boolean, candidateId?: string }>
 */
@Injectable()
export class CandidateSnapshotService {
  private readonly logger = new Logger(CandidateSnapshotService.name);
  private readonly prisma = prisma;
  //   private cache?: Keyv<any> | null;

  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  /**
   * Update candidate snapshot using the event row as the source of truth.
   * Ensures idempotency: only update candidate if event.timestamp > candidate.lastEventAt (or candidate.lastEventAt is null).
   *
   * Returns { updated: boolean, candidateId?: string }
   */
  async updateFromEvent(eventId: string) {
    if (!eventId) {
      throw new Error('eventId is required');
    }

    // Load event and join candidate info
    const evt = await this.prisma.atsCandidateEvent.findUnique({
      where: { id: eventId },
      include: {
        candidate: true, // may be null if candidate was missing at event creation
      },
    });

    if (!evt) {
      this.logger.warn(`Event not found: ${eventId}`);
      return { updated: false };
    }

    // Determine candidate id (preferred internal id). If not present, try to resolve by externalCandidateId in normalized payload.
    let candidateId = evt.candidateId;

    if (!candidateId) {
      // try normalized payload candidateExternalId
      const normalized: any = evt.normalized;
      const candidateExternalId = normalized?.candidateExternalId;

      if (candidateExternalId) {
        const candidate = await this.prisma.atsCandidate.findUnique({
          where: {
            externalCandidateId_connectorId: {
              externalCandidateId: String(candidateExternalId),
              connectorId: evt.connectorId,
            },
          },
        });
        if (candidate) candidateId = candidate.id;
      }
    }

    if (!candidateId) {
      this.logger.warn(
        `Cannot resolve candidate for event ${eventId} (providerEventId=${evt.providerEventId})`,
      );
      return { updated: false };
    }

    // Fetch current candidate snapshot
    const candidate = await this.prisma.atsCandidate.findUnique({
      where: { id: candidateId },
      select: { id: true, currentStage: true, lastEventAt: true },
    });

    if (!candidate) {
      this.logger.warn(
        `Candidate id ${candidateId} not found while updating snapshot for event ${eventId}`,
      );
      return { updated: false };
    }

    const incomingTs = new Date(evt.timestamp).getTime();
    const existingTs = candidate.lastEventAt
      ? new Date(candidate.lastEventAt).getTime()
      : 0;

    // Idempotency check — only update if incoming event is newer (or equal but we still allow update to ensure stage consistency)
    if (incomingTs < existingTs) {
      this.logger.debug(
        `Skipping snapshot update for candidate ${candidateId} — existing lastEventAt (${new Date(existingTs).toISOString()}) is newer than event ${evt.id} (${new Date(incomingTs).toISOString()})`,
      );
      return { updated: false, candidateId };
    }

    // Compose update payload
    const normalized: any = evt?.normalized;
    const newStage =
      evt.stageTo ??
      normalized?.metadata?.status?.label ??
      evt.stageFrom ??
      null;
    const updateData: any = {
      currentStage: newStage,
      lastEventAt: new Date(evt.timestamp),
      updatedAt: new Date(),
      raw: { ...(candidate as any)?.raw, lastSyncedEventId: evt.id }, // optional small audit
    };

    // Use transaction to avoid race conditions: check lastEventAt again and update only if incomingTs >= DB value
    // Prisma doesn't provide conditional update in single query easily; emulate with a transaction:
    const updated = await this.prisma.$transaction(async (tx) => {
      // re-fetch inside transaction with FOR UPDATE equivalent (Postgres doesn't have that via prisma)
      const candInTx = await tx.atsCandidate.findUnique({
        where: { id: candidateId },
        select: { lastEventAt: true },
      });

      const dbTs = candInTx?.lastEventAt
        ? new Date(candInTx.lastEventAt).getTime()
        : 0;
      if (incomingTs < dbTs) {
        // another newer event already updated the candidate
        return { ok: false };
      }

      const res = await tx.atsCandidate.update({
        where: { id: candidateId },
        data: updateData,
      });

      return { ok: true, res };
    });

    if (!updated.ok) {
      this.logger.debug(
        `Snapshot update aborted because DB has newer event for candidate ${candidateId}`,
      );
      return { updated: false, candidateId };
    }

    // Optionally push small stage history to cache
    try {
      const key = `candidate:${candidateId}:stages`;
      const maxLen = 10;
      const entry = {
        ts: new Date(evt.timestamp).toISOString(),
        stage: newStage,
        providerEventId: evt.providerEventId,
      };

      const prev: any = (await this.cache.get(key)) ?? [];
      const next = [entry, ...prev].slice(0, maxLen);
      await this.cache.set(key, next, 7 * 24 * 60 * 60 * 1000); // TTL 7 days
    } catch (err) {
      this.logger.debug(
        'Failed to write stage history to cache (non-fatal)',
        err?.message ?? err,
      );
    }

    this.logger.log(
      `Candidate snapshot updated for ${candidateId} -> stage='${newStage}''`,
    );
    return { updated: true, candidateId };
  }
}
