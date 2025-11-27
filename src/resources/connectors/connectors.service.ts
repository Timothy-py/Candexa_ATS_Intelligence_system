/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { Injectable, Logger } from '@nestjs/common';
import { BamboohrService } from '../bamboohr/bamboohr.service';
import { prisma } from 'src/core/database/database.service';

@Injectable()
export class ConnectorsService {
  private readonly logger = new Logger(ConnectorsService.name);
  private readonly prisma = prisma;

  constructor(private readonly bamboo: BamboohrService) {}

  /**
   * FULL SYNC
   * Performs full import of:
   *  - Jobs (ATS job openings)
   *  - Candidates (deduped applicants derived from applications)
   *  - Candidate Events (normalized)
   *
   * This is used on first connector setup or manual re-sync.
   */
  async fullSync(connectorId: string) {
    this.logger.log(`Starting FULL SYNC for connector: ${connectorId}`);

    const startedAt = Date.now();

    try {
      const jobs = await this.bamboo.syncJobs(connectorId);
      const candidates = await this.bamboo.syncCandidates(connectorId);
      const events = await this.bamboo.syncCandidateEvents(connectorId);

      await this.prisma.atsConnector.update({
        where: { id: connectorId },
        data: {
          lastFullSyncAt: new Date(),
          lastDeltaSyncAt: null, // reset delta pointer
          status: 'connected',
        },
      });

      const duration = Date.now() - startedAt;
      this.logger.log(
        `FULL SYNC COMPLETE — Jobs: ${jobs}, Candidates: ${candidates}, Events: ${events}, Duration: ${duration}ms`,
      );

      return { jobs, candidates, events, duration };
    } catch (error) {
      this.logger.error(`FULL SYNC FAILED for connector ${connectorId}`, error);

      await this.prisma.atsConnector.update({
        where: { id: connectorId },
        data: { status: 'error' },
      });

      throw error;
    }
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
  async deltaSync(connectorId: string) {
    this.logger.log(`Starting DELTA SYNC for connector: ${connectorId}`);

    const connector = await this.prisma.atsConnector.findUnique({
      where: { id: connectorId },
    });

    if (!connector) {
      throw new Error(`Connector not found: ${connectorId}`);
    }

    // Best available "since" cursor
    const since =
      connector.lastDeltaSyncAt ??
      connector.lastFullSyncAt ??
      new Date('1970-01-01');

    const startedAt = Date.now();

    try {
      // --- 1. Jobs (cheap) ---------------------------------------
      const jobs = await this.bamboo.syncJobs(connectorId);

      // --- 2. Candidates (new applicants or updated applicants) -----
      // Currently derived from full application pagination because BambooHR
      // may not support updatedSince. We will filter inside sync logic.
      const candidates = await this.bamboo.syncCandidates(connectorId);

      // --- 3. Events (only new providerEventIds will be inserted) ----
      const events = await this.bamboo.syncCandidateEvents(connectorId);

      // Update delta pointer
      await this.prisma.atsConnector.update({
        where: { id: connectorId },
        data: {
          lastDeltaSyncAt: new Date(),
          status: 'connected',
        },
      });

      const duration = Date.now() - startedAt;

      this.logger.log(
        `DELTA SYNC COMPLETE — Jobs: ${jobs}, Candidates: ${candidates}, Events: ${events}, Duration: ${duration}ms`,
      );

      return { jobs, candidates, events, duration, since };
    } catch (error) {
      this.logger.error(
        `DELTA SYNC FAILED for connector ${connectorId}`,
        error,
      );

      await this.prisma.atsConnector.update({
        where: { id: connectorId },
        data: { status: 'error' },
      });

      throw error;
    }
  }
}
