import { Module } from '@nestjs/common';
import { ConnectorsService } from './connectors.service';
import { ConnectorsController } from './connectors.controller';
import { BamboohrService } from '../bamboohr/bamboohr.service';
import { EventNormalizerService } from '../event/event.normalizer';

@Module({
  providers: [ConnectorsService, BamboohrService, EventNormalizerService],
  controllers: [ConnectorsController],
})
export class ConnectorsModule {}
