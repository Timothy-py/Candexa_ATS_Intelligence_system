/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { Injectable, Logger } from '@nestjs/common';
import { AtsCandidateEvent } from 'generated/prisma/client';
import { prisma } from 'src/core/database/database.service';
import { NormalizedEvent } from 'src/resources/bamboohr/bamboohr.types';

@Injectable()
export class EventNormalizerService {
  private readonly logger = new Logger(EventNormalizerService.name);
  private readonly prisma = prisma;

  /**
   * Normalize + persist an event.
   * Returns { created: boolean, eventId?: string, reason?: string }
   */
  async normalizeAndPersist(event: NormalizedEvent) {
    // Basic validation
    if (!event.providerEventId || !event.connectorId) {
      const reason = 'Missing providerEventId or connectorId';
      this.logger.warn(reason, event);
      return { created: false, reason };
    }

    // Resolve candidate id (internal) by externalCandidateId if exists
    let candidate: any = null;
    if (event.candidateExternalId) {
      candidate = await this.prisma.atsCandidate.findUnique({
        where: {
          externalCandidateId_connectorId: {
            externalCandidateId: event.candidateExternalId,
            connectorId: event.connectorId,
          },
        },
        select: { id: true },
      });
    }

    // Resolve jobId if present
    let job: any = null;
    if (event.jobExternalId) {
      job = await this.prisma.atsJob.findUnique({
        where: {
          externalJobId_connectorId: {
            externalJobId: event.jobExternalId,
            connectorId: event.connectorId,
          },
        },
        select: { id: true },
      });
    }

    // Build create payload for AtsCandidateEvent
    const createPayload: any = {
      connectorId: event.connectorId,
      providerEventId: event.providerEventId,
      provider: event.provider,
      type: event.eventType,
      stageFrom: event.stageFrom ?? null,
      stageTo: event.stageTo ?? null,
      actor: event.actor ?? null,
      timestamp: new Date(event.timestamp),
      rawPayload: event.raw ?? null,
      normalized: {
        metadata: event.metadata ?? {},
        candidateExternalId: event.candidateExternalId ?? null,
        jobExternalId: event.jobExternalId ?? null,
      },
      candidateId: candidate ? candidate.id : undefined, // if undefined, we'll set to null and let later step resolve or link
      jobId: job ? job.id : undefined,
    };

    // If candidate is not found, we can attempt to skip persist (or persist with null candidateId)
    // We'll persist anyway (candidateId nullable) but ideally candidates were synced earlier.
    if (!createPayload.candidateId) createPayload.candidateId = null;
    if (!createPayload.jobId) createPayload.jobId = null;

    // Idempotent insert using unique (providerEventId, connectorId)
    try {
      const created = await this.prisma.atsCandidateEvent.create({
        data: createPayload,
      });

      this.logger.log(
        `Inserted candidate event ${created.id} (${event.providerEventId})`,
      );
      return { created: true, eventId: created.id };
    } catch (err: any) {
      // Handle unique constraint violation (duplicate)
      // Prisma P2002 is unique constraint error
      if (
        err.code === 'P2002' ||
        err?.meta?.target?.includes?.('providerEventId_connectorId')
      ) {
        // fetch existing
        const existing = (await this.prisma.atsCandidateEvent.findUnique({
          where: {
            providerEventId_connectorId: {
              providerEventId: event.providerEventId,
              connectorId: event.connectorId,
            },
          },
        })) as AtsCandidateEvent;

        if (existing) {
          // Optionally update normalized/raw payload if newer timestamp
          const incomingTs = new Date(event.timestamp).getTime();
          const existingTs = new Date(existing.timestamp).getTime();
          if (incomingTs > existingTs) {
            const existingNormized = existing.normalized as any;
            const updated = await this.prisma.atsCandidateEvent.update({
              where: {
                id: existing.id,
              },
              data: {
                stageTo: event.stageTo ?? existing.stageTo,
                stageFrom: event.stageFrom ?? existing.stageFrom,
                rawPayload: event.raw ?? existing.rawPayload,
                normalized: {
                  ...existingNormized,
                  metadata: {
                    ...(existingNormized.metadata ?? {}),
                    ...(event.metadata ?? {}),
                  },
                },
                timestamp: new Date(event.timestamp),
              },
            });

            this.logger.log(
              `Updated candidate event ${updated.id} with newer timestamp`,
            );
            return { created: false, eventId: updated.id, reason: 'updated' };
          }

          return { created: false, eventId: existing.id, reason: 'duplicate' };
        }

        // If we couldn't fetch, bubble up
        this.logger.warn(
          'Duplicate event encountered but unable to find existing record',
          { event },
        );
        return { created: false, reason: 'duplicate_unknown' };
      }

      // other errors
      this.logger.error('Failed to persist candidate event', err);
      throw err;
    }
  }
}
