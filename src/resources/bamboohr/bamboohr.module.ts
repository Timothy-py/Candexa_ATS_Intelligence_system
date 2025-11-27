import { Module } from '@nestjs/common';
import { BamboohrService } from './bamboohr.service';
import { BamboohrController } from './bamboohr.controller';
import { EventNormalizerService } from '../event/event.normalizer';

@Module({
  controllers: [BamboohrController],
  providers: [BamboohrService, EventNormalizerService],
})
export class BamboohrModule {}
