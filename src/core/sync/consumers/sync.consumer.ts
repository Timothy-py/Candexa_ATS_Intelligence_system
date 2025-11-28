import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { JOB_NAMES, JobQueues } from 'src/common/enums';
import { SyncProcessor } from '../processors/sync.processor';

@Processor(JobQueues.SYNC_QUEUE)
export class SyncConsumer extends WorkerHost {
  private readonly logger = new Logger(SyncConsumer.name);

  constructor(private readonly processor: SyncProcessor) {
    super();
  }

  async process(job: Job, token?: string): Promise<any> {
    try {
      switch (job.name) {
        case JOB_NAMES.FULL_SYNC:
          await this.processor.handleFullSync(job.data);
          break;
        case JOB_NAMES.DELTA_SYNC:
          await this.processor.handleDeltaSync(job.data);
          break;
        default:
          this.logger.warn(`Unknown job name: ${job.name}`);
          break;
      }
    } catch (error) {}
  }
}
