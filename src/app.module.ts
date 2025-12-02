import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/env.configuration';
import { validate } from './common/env.validation';
import { BamboohrModule } from './resources/bamboohr/bamboohr.module';
import { ConnectorsModule } from './resources/connectors/connectors.module';
import { EventModule } from './resources/event/event.module';
import { BullModule } from '@nestjs/bullmq';
import { createKeyv, Keyv } from '@keyv/redis';
import { CacheModule } from '@nestjs/cache-manager';
import { QueueModule } from './core/queue/queue.module';
import { SyncModule } from './core/sync/sync.module';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { AnalyticsModule } from './resources/analytics/analytics.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      cache: true,
      validate: validate,
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        return {
          ttl: configService.get<number>('redis.cacheTTL'),
          stores: [createKeyv(configService.get<string>('redis.url'))],
        };
      },
      inject: [ConfigService],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        return {
          connection: {
            url: configService.get<string>('redis.url'),
          },
        };
      },
      inject: [ConfigService],
    }),
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),
    BamboohrModule,
    ConnectorsModule,
    EventModule,
    QueueModule,
    SyncModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
