/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { Injectable, Logger } from '@nestjs/common';
import { BamboohrService } from '../bamboohr/bamboohr.service';
import { prisma } from 'src/core/database/database.service';
import { QueueService } from 'src/core/queue/queue.service';

@Injectable()
export class ConnectorsService {
  private readonly logger = new Logger(ConnectorsService.name);
  private readonly prisma = prisma;

  constructor(
    private readonly bamboo: BamboohrService,
    private readonly queueService: QueueService,
  ) {}

  /**
   * FULL SYNC
   * enqueue background job by default
   * Performs full import of:
   *  - Jobs (ATS job openings)
   *  - Candidates (deduped applicants derived from applications)
   *  - Candidate Events (normalized)
   *
   */
  async fullSync(connectorId: string, runInline = false) {
    this.logger.log(
      `Starting FULL SYNC for connector: ${connectorId} (runInline=${runInline})`,
    );

    if (runInline) {
      // legacy inline behavior for debugging
      const start = Date.now();
      try {
        const jobs = await this.bamboo.syncJobs(connectorId);
        const candidates = await this.bamboo.syncCandidates(connectorId);
        const events = await this.bamboo.syncCandidateEvents(connectorId);

        await this.prisma.atsConnector.update({
          where: { id: connectorId },
          data: {
            lastFullSyncAt: new Date(),
            lastDeltaSyncAt: null,
            status: 'connected',
          },
        });

        this.logger.log(
          `FULL SYNC COMPLETE (inline) — Jobs: ${jobs}, Candidates: ${candidates}, Events: ${events}, Duration: ${Date.now() - start}ms`,
        );

        return { jobs, candidates, events };
      } catch (err) {
        this.logger.error(`FULL SYNC FAILED (inline)`, err);
        await this.prisma.atsConnector.update({
          where: { id: connectorId },
          data: { status: 'error' },
        });
        throw err;
      }
    }

    // Default behavior: enqueue a background sync job
    const job = await this.queueService.addSyncJob(connectorId, 'full', {
      attempts: 3,
    });
    this.logger.log(
      `Enqueued FULL SYNC job ${job.id} for connector ${connectorId}`,
    );
    return { queued: true, jobId: job.id };
  }

  /**
   * DELTA SYNC
   * Performs rapid incremental updates:
   *  - Fetches job updates (jobs rarely change, but safe to re-sync)
   *  - Fetches only *new or changed* applications (candidates)
   *  - Normalizes only *new or updated* application events
   *
   * If BambooHR adds `updatedSince` support we plug it in here.
   */
  async deltaSync(connectorId: string, enqueue = false) {
    this.logger.log(
      `Starting DELTA SYNC for ${connectorId} (enqueue=${enqueue})`,
    );

    if (enqueue) {
      const job = await this.queueService.addSyncJob(connectorId, 'delta', {
        attempts: 3,
      });
      this.logger.log(
        `Enqueued DELTA SYNC job ${job.id} for connector ${connectorId}`,
      );
      return { queued: true, jobId: job.id };
    }

    // inline delta sync
    const connector = await this.prisma.atsConnector.findUnique({
      where: { id: connectorId },
    });

    const since = connector?.lastDeltaSyncAt ?? connector?.lastFullSyncAt;

    try {
      const jobs = await this.bamboo.syncJobs(connectorId);
      const applicants = await this.bamboo.syncCandidates(connectorId);
      const events = await this.bamboo.syncCandidateEvents(connectorId);

      await this.prisma.atsConnector.update({
        where: { id: connectorId },
        data: { lastDeltaSyncAt: new Date(), status: 'connected' },
      });

      return { jobs, applicants, events };
    } catch (err) {
      await this.prisma.atsConnector.update({
        where: { id: connectorId },
        data: { status: 'error' },
      });

      throw err;
    }
  }
}
