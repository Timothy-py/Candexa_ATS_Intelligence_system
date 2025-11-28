import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncProcessor } from './processors/sync.processor';

@Module({
  providers: [SyncService, SyncProcessor],
})
export class SyncModule {}
