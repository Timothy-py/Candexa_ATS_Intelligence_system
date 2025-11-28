import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { JOB_NAMES, JobQueues } from 'src/common/enums';
import { SyncProcessor } from '../processors/sync.processor';

@Processor(JobQueues.NORMALIZE)
export class NormalizeConsumer extends WorkerHost {
  private readonly logger = new Logger(NormalizeConsumer.name);

  constructor(private readonly processor: SyncProcessor) {
    super();
  }

  async process(job: Job, token?: string): Promise<any> {
    try {
      switch (job.name) {
        case JOB_NAMES.NORMALIZE_APPLICATION:
          await this.processor.handleNormalizeApplication(job.data);
          break;

        default:
          this.logger.warn(`Unknown job name: ${job.name}`);
          break;
      }
    } catch (error) {
      this.logger.error(`Error processing job ${job.id}`, error);
    }
  }
}
