import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { BullModule } from '@nestjs/bullmq';
import { JobQueues } from 'src/common/enums';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

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
    BullBoardModule.forFeature(
      {
        name: JobQueues.SYNC_QUEUE,
        adapter: BullMQAdapter,
      },
      {
        name: JobQueues.RAW_EVENTS,
        adapter: BullMQAdapter,
      },
      {
        name: JobQueues.NORMALIZE,
        adapter: BullMQAdapter,
      },
    ),
  ],
  providers: [QueueService],
})
export class QueueModule {}
