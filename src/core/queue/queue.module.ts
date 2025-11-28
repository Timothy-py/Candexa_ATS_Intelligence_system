import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { BullModule } from '@nestjs/bullmq';
import { JobQueues } from 'src/common/enums';

@Module({
  imports: [
    BullModule.registerQueueAsync(
      {
        name: JobQueues.SYNC_QUEUE,
      },
      {
        name: JobQueues.RAW_EVENTS,
      },
      {
        name: JobQueues.NORMALIZE,
      },
    ),
  ],
  providers: [QueueService],
})
export class QueueModule {}
