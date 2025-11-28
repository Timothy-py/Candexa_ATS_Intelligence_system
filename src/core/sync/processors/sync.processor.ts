/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Logger } from '@nestjs/common';
import { BamboohrService } from 'src/resources/bamboohr/bamboohr.service';
import { prisma } from 'src/core/database/database.service';
import { QueueService } from 'src/core/queue/queue.service';
import { mapApplicationToEvent } from 'src/resources/bamboohr/bamboohr.mapper';
import { EventNormalizerService } from 'src/resources/event/event.normalizer';

export class SyncProcessor {
  private readonly logger = new Logger(SyncProcessor.name);
  private readonly prisma = prisma;

  constructor(
    private readonly bamboo: BamboohrService,
    private readonly queueService: QueueService,
    private readonly eventNormalizer: EventNormalizerService,
  ) {}

  async handleFullSync(data: any) {
    const connectorId = data?.connectorId;
    const type = data?.type ?? 'full';
    this.logger.log(
      `Processing full-sync job ${job.id} for connector ${connectorId}`,
    );

    const start = Date.now();
    try {
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
    this.logger.log(
      `Processing delta-sync job ${job.id} for connector ${connectorId}`,
    );

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
      `Fan-out complete for job ${job.id}: enqueued ${enqueued} normalize jobs`,
    );
    return { enqueued };
  }

  async handleNormalizeApplication(data: any) {
    const { connectorId, application } = data;
    try {
      const normalized = mapApplicationToEvent(application, connectorId);
      const result = await this.eventNormalizer.normalizeAndPersist(normalized);
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
}
