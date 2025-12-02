import { Module } from '@nestjs/common';
import { NormalizeConsumer } from './consumers/normalize-app.consumer';
import { RawEventConsumer } from './consumers/raw-event.consumer';
import { SyncConsumer } from './consumers/sync.consumer';
import { BullModule } from '@nestjs/bullmq';
import { JobQueues } from 'src/common/enums';
import { SyncService } from './sync.service';
import { BamboohrService } from 'src/resources/bamboohr/bamboohr.service';
import { QueueService } from '../queue/queue.service';
import { EventNormalizerService } from 'src/resources/event/event.normalizer';
import { CandidateSnapshotService } from 'src/resources/event/candidate-snapshot.service';
import { StageDurationService } from 'src/resources/analytics/stage-duration.service';
import { JobAggregatorService } from 'src/resources/analytics/job-aggregator.service';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: JobQueues.SYNC_QUEUE },
      { name: JobQueues.RAW_EVENTS },
      { name: JobQueues.NORMALIZE },
    ),
  ],
  providers: [
    SyncService,
    BamboohrService,
    NormalizeConsumer,
    RawEventConsumer,
    SyncConsumer,
    QueueService,
    EventNormalizerService,
    CandidateSnapshotService,
    StageDurationService,
    JobAggregatorService,
  ],
})
export class SyncModule {}
