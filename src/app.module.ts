import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/env.configuration';
import { validate } from './common/env.validation';
import { BamboohrModule } from './resources/bamboohr/bamboohr.module';
import { ConnectorsModule } from './resources/connectors/connectors.module';
import { EventModule } from './resources/event/event.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      cache: true,
      validate: validate,
    }),
    BamboohrModule,
    ConnectorsModule,
    EventModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
