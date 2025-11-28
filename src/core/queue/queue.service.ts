/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { JOB_NAMES, JobQueues } from 'src/common/enums';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(JobQueues.SYNC_QUEUE) private readonly syncQueue: Queue,
    @InjectQueue(JobQueues.RAW_EVENTS) private readonly rawEventsQueue: Queue,
    @InjectQueue(JobQueues.NORMALIZE) private readonly normalizeQueue: Queue,
  ) {}

  async addSyncJob(connectorId: string, type: 'full' | 'delta', opts?: any) {
    const job = await this.syncQueue.add(
      JOB_NAMES.FULL_SYNC,
      { connectorId, type },
      {
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        ...opts,
      },
    );
    this.logger.log(
      `Enqueued sync job ${job.id} type=${type} connector=${connectorId}`,
    );
    return job;
  }

  async addRawEventsPage(
    connectorId: string,
    page: number,
    rawApplications: any[],
    opts?: any,
  ) {
    const job = await this.rawEventsQueue.add(
      JOB_NAMES.RAW_APP_PAGE,
      { connectorId, page, rawApplications },
      {
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        ...opts,
      },
    );
    this.logger.log(
      `Enqueued raw-events page job ${job.id} connector=${connectorId} page=${page} count=${rawApplications?.length ?? 0}`,
    );
    return job;
  }

  async addNormalizeApplication(
    connectorId: string,
    application: any,
    opts?: any,
  ) {
    const job = await this.normalizeQueue.add(
      JOB_NAMES.NORMALIZE_APPLICATION,
      { connectorId, application },
      {
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        ...opts,
      },
    );
    return job;
  }

  // Expose queue instances if needed for advanced ops (rate limiting, job inspection)
  getSyncQueue() {
    return this.syncQueue;
  }
  getRawEventsQueue() {
    return this.rawEventsQueue;
  }
  getNormalizeQueue() {
    return this.normalizeQueue;
  }
}
