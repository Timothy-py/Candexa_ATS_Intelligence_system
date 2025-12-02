// src/analytics/job-aggregator.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { prisma } from 'src/core/database/database.service';
import { StageDurationService } from './stage-duration.service';

@Injectable()
export class JobAggregatorService {
  private readonly logger = new Logger(JobAggregatorService.name);
  private readonly prisma = prisma;

  constructor(private readonly stageDuration: StageDurationService) {}

  /**
   * Compute stage-level aggregates for a single job from current candidate snapshots and stage metrics.
   */
  async computeJobHeatmap(jobId: string, connectorId: string) {
    // 1) Count candidates per stage (current snapshot)
    const stageCounts = await this.prisma.$queryRaw<
      Array<{ stageName: string; count: number }>
    >`SELECT "currentStage" as "stageName", COUNT(*) as count FROM "AtsCandidate" WHERE "jobId" = ${jobId} AND "connectorId" = ${connectorId} GROUP BY "currentStage"`;

    // 2) Load existing stage metrics (avg duration)
    const metrics = await this.prisma.atsStageMetric.findMany({
      where: { jobId, connectorId },
    });

    // 3) Combine into a structure for the frontend heatmap
    const result = stageCounts.map((r) => {
      const metric = metrics.find((m) => m.stageName === r.stageName);
      return {
        stageName: r.stageName,
        candidateCount: Number(r.count),
        avgDurationHours: metric?.avgDurationHours ?? null,
        delaySeverity: metric?.delaySeverity ?? null,
      };
    });

    // Persist or return. We persist stage metrics table is already used; but for convenience we create/update any missing rows with 0 counts
    await this.prisma.$transaction(async (tx) => {
      for (const item of result) {
        const exists = await tx.atsStageMetric.findFirst({
          where: { jobId, connectorId, stageName: item.stageName },
        });
        if (!exists) {
          await tx.atsStageMetric.create({
            data: {
              connectorId,
              jobId,
              stageName: item.stageName ?? 'Unknown',
              candidateCount: item.candidateCount ?? 0,
              totalDurationHours: 0,
              avgDurationHours: item.avgDurationHours ?? null,
              computedAt: new Date(),
            },
          });
        } else {
          await tx.atsStageMetric.update({
            where: { id: exists.id },
            data: {
              candidateCount: item.candidateCount ?? 0,
              avgDurationHours:
                item.avgDurationHours ?? exists.avgDurationHours,
              computedAt: new Date(),
            },
          });
        }
      }
    });

    this.logger.log(`JobAggregator: computed heatmap for job ${jobId}`);
    return result;
  }

  /**
   * Reconcile all jobs periodically (cron). This fixes any drift & handles retroactive changes.
   * Cron runs every 10 minutes by default (adjustable).
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcileAllJobs() {
    this.logger.log(
      'JobAggregator: running periodic reconciliation for all jobs',
    );
    const jobs = await this.prisma.atsJob.findMany({
      select: { id: true, connectorId: true },
    });

    for (const j of jobs) {
      try {
        // reconcile duration metrics by scanning events for the job
        await this.stageDuration.reconcileJobMetrics(j.id, j.connectorId);
        // regenerate the job-level heatmap counts
        await this.computeJobHeatmap(j.id, j.connectorId);
      } catch (err) {
        this.logger.error(
          `JobAggregator: error while reconciling job ${j.id}`,
          err,
        );
      }
    }

    this.logger.log('JobAggregator: reconciliation complete');
  }
}
