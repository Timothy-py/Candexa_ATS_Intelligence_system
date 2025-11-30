import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { JOB_NAMES, JobQueues } from 'src/common/enums';
import { SyncService } from '../sync.service';

@Processor(JobQueues.RAW_EVENTS)
export class RawEventConsumer extends WorkerHost {
  private readonly logger = new Logger(RawEventConsumer.name);

  constructor(private readonly processor: SyncService) {
    super();
  }

  async process(job: Job, token?: string): Promise<any> {
    try {
      switch (job.name) {
        case JOB_NAMES.RAW_APP_PAGE:
          await this.processor.handleRawPage(job.data);
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
