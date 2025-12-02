import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { StageDurationService } from './stage-duration.service';
import { JobAggregatorService } from './job-aggregator.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, StageDurationService, JobAggregatorService],
})
export class AnalyticsModule {}
