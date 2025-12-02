/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger } from '@nestjs/common';
import { prisma } from 'src/core/database/database.service';
import { QueueService } from 'src/core/queue/queue.service';
import { mapApplicationToEvent } from 'src/resources/bamboohr/bamboohr.mapper';
import { EventNormalizerService } from 'src/resources/event/event.normalizer';
import { CandidateSnapshotService } from 'src/resources/event/candidate-snapshot.service';
import { BamboohrService } from 'src/resources/bamboohr/bamboohr.service';
import { StageDurationService } from 'src/resources/analytics/stage-duration.service';
import { JobAggregatorService } from 'src/resources/analytics/job-aggregator.service';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly prisma = prisma;

  constructor(
    private readonly bamboo: BamboohrService,
    private readonly queueService: QueueService,
    private readonly eventNormalizer: EventNormalizerService,
    private readonly snapshotService: CandidateSnapshotService,
    private readonly stageDuration: StageDurationService,
    private readonly jobAggregator: JobAggregatorService,
  ) {}

  async handleFullSync(data: any) {
    try {
      const connectorId = data?.connectorId;
      // const type = data?.type ?? 'full';
      this.logger.log(`Processing full-sync job for connector ${connectorId}`);

      const start = Date.now();
      const jobs = await this.bamboo.syncJobs(connectorId);
      const candidates = await this.bamboo.syncCandidates(connectorId);
      const events = await this.bamboo.syncCandidateEvents(connectorId);

      // Update connector status / lastFullSyncAt
      await this.prisma.atsConnector.update({
        where: { id: connectorId },
        data: {
          lastFullSyncAt: new Date(),
          lastDeltaSyncAt: null,
          status: 'connected',
        },
      });

      const duration = Date.now() - start;
      this.logger.log(
        `Full sync completed for ${connectorId} -- jobs:${jobs} candidates:${candidates} events:${events} duration:${duration}ms`,
      );
      return { jobs, candidates, events, duration };
    } catch (err) {
      this.logger.error('Full sync failed', err);
      // mark connector as error
      try {
        await this.prisma.atsConnector.update({
          where: { id: data.connectorId },
          data: { status: 'error' },
        });
      } catch (e) {
        this.logger.error(
          'Failed to update connector status after sync failure',
          e,
        );
      }
      throw err;
    }
  }

  async handleDeltaSync(data: any) {
    const connectorId = data?.connectorId;
    this.logger.log(`Processing delta-sync job  for connector ${connectorId}`);

    const start = Date.now();
    try {
      const jobs = await this.bamboo.syncJobs(connectorId);
      const candidates = await this.bamboo.syncCandidates(connectorId);
      const events = await this.bamboo.syncCandidateEvents(connectorId);

      await this.prisma.atsConnector.update({
        where: { id: connectorId },
        data: { lastDeltaSyncAt: new Date(), status: 'connected' },
      });

      const duration = Date.now() - start;
      this.logger.log(
        `Delta sync completed for ${connectorId} -- jobs:${jobs} candidates:${candidates} events:${events} duration:${duration}ms`,
      );
      return { jobs, candidates, events, duration };
    } catch (err) {
      this.logger.error('Delta sync failed', err);
      try {
        await this.prisma.atsConnector.update({
          where: { id: data.connectorId },
          data: { status: 'error' },
        });
      } catch (e) {
        this.logger.error(
          'Failed to update connector status after delta failure',
          e,
        );
      }
      throw err;
    }
  }

  async handleRawPage(data: any) {
    const { connectorId, page, rawApplications } = data;
    this.logger.log(
      `Processing raw page job, connector=${connectorId} page=${page} count=${rawApplications?.length ?? 0}`,
    );

    // Fan out individual normalization jobs
    let enqueued = 0;
    for (const application of rawApplications ?? []) {
      await this.queueService.addNormalizeApplication(connectorId, application);
      enqueued++;
    }

    this.logger.log(
      `Fan-out complete for job enqueued ${enqueued} normalize jobs`,
    );
    return { enqueued };
  }

  async handleNormalizeApplication(data: any) {
    const { connectorId, application } = data;
    try {
      const normalized = mapApplicationToEvent(application, connectorId);
      const result = await this.eventNormalizer.normalizeAndPersist(normalized);

      if (result.eventId) {
        // Update candidate snapshot atomically and idempotently
        try {
          const snap = await this.snapshotService.updateFromEvent(
            result.eventId,
          );
          await this.queueService.addComputeStageMetrics(
            connectorId,
            result.eventId,
            /* jobId */
            /* candidateId */
          );

          if (snap.updated) {
            this.logger.debug(
              `Snapshot updated for candidate ${snap.candidateId} from event ${result.eventId}`,
            );
          } else {
            this.logger.debug(
              `Snapshot not updated for event ${result.eventId} (maybe older)`,
            );
          }
        } catch (err) {
          this.logger.error('Snapshot update failed', {
            eventId: result.eventId,
            err: err?.message ?? err,
          });
          // Do not throw — we don't want snapshot failures to kill normalization jobs.
        }
      }

      if (result.created) {
        this.logger.log(
          `Normalized event persisted for providerEventId=${normalized.providerEventId}`,
        );
      } else {
        this.logger.debug(
          `Normalized event skipped/updated for providerEventId=${normalized.providerEventId}: ${result.reason}`,
        );
      }

      return result;
    } catch (err: any) {
      this.logger.error('Normalization failed', {
        connectorId,
        err: err?.message ?? err,
      });
      throw err;
    }
  }

  async handleComputeMetrics(data: any) {
    const { connectorId, eventId, jobId, candidateId } = data;
    this.logger.log(
      `MetricsProcessor: compute job connector=${connectorId} job=${jobId} candidate=${candidateId} event=${eventId}`,
    );

    try {
      if (eventId) {
        // compute duration for the event (incremental)
        await this.stageDuration.computeDurationFromEvent(eventId);
      } else if (candidateId && jobId) {
        // recompute metrics for candidate's job (re-scan events for this candidate)
        // We'll simply reconcile job-level for now
        await this.jobAggregator.computeJobHeatmap(jobId, connectorId);
      } else if (jobId) {
        // full job-level reconcile
        await this.stageDuration.reconcileJobMetrics(jobId, connectorId);
        await this.jobAggregator.computeJobHeatmap(jobId, connectorId);
      } else {
        // nothing specified — do nothing
        this.logger.debug(
          'MetricsProcessor: no jobId/eventId provided; skipping',
        );
      }
      return { ok: true };
    } catch (err) {
      this.logger.error('MetricsProcessor: error', err);
      throw err;
    }
  }
}
