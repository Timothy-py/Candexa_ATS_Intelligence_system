import { Injectable, Logger } from '@nestjs/common';
import { prisma } from 'src/core/database/database.service';

/**
 * StageDurationService
 *
 * Responsibilities:
 *  - Given an atsCandidateEvent id, compute time spent in previous stage (if any)
 *  - Update AtsStageMetric (candidateCount, totalDurationHours, avgDurationHours) incrementally
 *  - Ensure idempotency (don't double-apply same event)
 */
@Injectable()
export class StageDurationService {
  private readonly logger = new Logger(StageDurationService.name);
  private readonly prisma = prisma;

  /**
   * Compute duration for a given event and update stage metrics for the stageFrom (the stage left).
   * Returns { applied: boolean, durationHours?: number }
   */
  async computeDurationFromEvent(eventId: string) {
    if (!eventId) throw new Error('eventId required');

    const evt: any = await this.prisma.atsCandidateEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        candidateId: true,
        jobId: true,
        connectorId: true,
        stageFrom: true,
        stageTo: true,
        timestamp: true,
        providerEventId: true,
        normalized: true,
      },
    });

    if (!evt) {
      this.logger.warn(`StageDuration: event not found ${eventId}`);
      return { applied: false };
    }

    // Idempotency: if already marked computed, bail
    if (evt.normalized && (evt.normalized as any).stageDurationComputed) {
      this.logger.debug(`StageDuration: already computed for event ${eventId}`);
      return { applied: false };
    }

    // Find previous event for same candidate
    const prev = await this.prisma.atsCandidateEvent.findFirst({
      where: {
        candidateId: evt.candidateId,
        timestamp: { lt: evt.timestamp },
      },
      orderBy: { timestamp: 'desc' },
      take: 1,
    });

    if (!prev) {
      await this.markEventComputed(evt);
      this.logger.debug(`StageDuration: no previous event for ${eventId}`);
      return { applied: false };
    }

    const previousStageName = prev.stageTo ?? prev.stageFrom ?? null;
    if (!previousStageName) {
      await this.markEventComputed(evt);
      this.logger.debug(
        `StageDuration: previous event ${prev.id} has no stage name`,
      );
      return { applied: false };
    }

    const durationMs =
      new Date(evt.timestamp).getTime() - new Date(prev.timestamp).getTime();
    if (durationMs < 0) {
      this.logger.warn(
        `StageDuration: negative duration for event ${eventId} (timestamps out of order)`,
      );
      await this.markEventComputed(evt);
      return { applied: false };
    }

    const durationHours = durationMs / (1000 * 60 * 60);

    const jobId = evt.jobId;
    const connectorId = evt.connectorId;
    const stageName = previousStageName;

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.atsStageMetric.findFirst({
        where: { jobId: jobId!, connectorId, stageName },
      });

      if (!existing) {
        await tx.atsStageMetric.create({
          data: {
            connectorId,
            jobId: jobId!,
            stageName,
            candidateCount: 1,
            totalDurationHours: Number(durationHours.toFixed(6)),
            avgDurationHours: Number(durationHours.toFixed(3)),
            delaySeverity: null,
            computedAt: new Date(),
          },
        });
      } else {
        const n = existing.candidateCount ?? 0;
        const oldTotal = existing.totalDurationHours ?? 0;
        const newN = n + 1;
        const newTotal = oldTotal + durationHours;
        const newAvg = newTotal / newN;

        await tx.atsStageMetric.update({
          where: { id: existing.id },
          data: {
            candidateCount: newN,
            totalDurationHours: Number(newTotal.toFixed(6)),
            avgDurationHours: Number(newAvg.toFixed(3)),
            computedAt: new Date(),
          },
        });
      }

      // mark event as computed to keep idempotency
      await tx.atsCandidateEvent.update({
        where: { id: evt.id },
        data: {
          normalized: {
            ...(evt.normalized ?? {}),
            stageDurationComputed: true,
          },
        },
      });
    });

    this.logger.log(
      `StageDuration: applied duration ${durationHours.toFixed(
        2,
      )}h for job=${jobId} stage='${stageName}' (event=${eventId})`,
    );

    return { applied: true, durationHours };
  }

  /**
   * Full reconciliation for a job: recompute all stage durations from events.
   * Used by cron / JobAggregator to correct drift or after changing rules.
   */
  async reconcileJobMetrics(jobId: string, connectorId: string) {
    if (!jobId) throw new Error('jobId required');

    const events = await this.prisma.atsCandidateEvent.findMany({
      where: { jobId, connectorId },
      orderBy: [{ candidateId: 'asc' }, { timestamp: 'asc' }],
      select: {
        id: true,
        candidateId: true,
        stageFrom: true,
        stageTo: true,
        timestamp: true,
      },
    });

    if (!events || events.length === 0) return;

    // Compute durations per stage from scratch
    const stageDurations: Record<string, number[]> = {};
    const lastByCandidate: Record<string, (typeof events)[number]> = {};

    for (const e of events) {
      const c = e.candidateId;
      if (!lastByCandidate[c]) {
        lastByCandidate[c] = e;
        continue;
      }

      const prev = lastByCandidate[c];
      const prevStage = prev.stageTo ?? prev.stageFrom ?? null;

      if (prevStage) {
        const dMs =
          new Date(e.timestamp).getTime() - new Date(prev.timestamp).getTime();
        if (dMs >= 0) {
          const hours = dMs / (1000 * 60 * 60);
          if (!stageDurations[prevStage]) stageDurations[prevStage] = [];
          stageDurations[prevStage].push(hours);
        }
      }

      lastByCandidate[c] = e;
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [stage, durations] of Object.entries(stageDurations)) {
        const count = durations.length;
        const total = durations.reduce((a, b) => a + b, 0);
        const avg = total / Math.max(1, count);

        const existing = await tx.atsStageMetric.findFirst({
          where: { jobId, connectorId, stageName: stage },
        });

        if (!existing) {
          await tx.atsStageMetric.create({
            data: {
              connectorId,
              jobId,
              stageName: stage,
              candidateCount: count,
              totalDurationHours: Number(total.toFixed(6)),
              avgDurationHours: Number(avg.toFixed(3)),
              computedAt: new Date(),
            },
          });
        } else {
          await tx.atsStageMetric.update({
            where: { id: existing.id },
            data: {
              candidateCount: count,
              totalDurationHours: Number(total.toFixed(6)),
              avgDurationHours: Number(avg.toFixed(3)),
              computedAt: new Date(),
            },
          });
        }
      }
    });

    this.logger.log(`StageDuration: reconciled metrics for job ${jobId}`);
    return true;
  }

  private async markEventComputed(evt: {
    id: string;
    normalized: Record<string, any> | null;
  }) {
    await this.prisma.atsCandidateEvent.update({
      where: { id: evt.id },
      data: {
        normalized: {
          ...(evt.normalized ?? {}),
          stageDurationComputed: true,
        },
      },
    });
  }
}
