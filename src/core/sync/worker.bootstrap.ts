/**
 * Standalone worker bootstrap.
 * Run this as a separate process (ts-node in dev or compiled JS in prod).
 *
 * It creates a Nest application context (no HTTP) and starts all registered Bull processors.
 * Ensure your AppModule imports QueueModule so processors and BullModule are registered.
 *
 * Example npm script (dev):
 *   "start:worker": "ts-node -r tsconfig-paths/register src/core/sync/worker.bootstrap.ts"
 *
 * In production run built JS:
 *   node dist/core/sync/worker.bootstrap.js
 */

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from 'src/app.module';

async function bootstrapWorker() {
  const logger = new Logger('WorkerBootstrap');
  logger.log('Starting worker Nest context...');

  // Create an application context (no HTTP)
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  logger.log('Worker context started. Bull processors should now be active.');
  // Keep process alive; Nest app context runs until process exit
  // Optionally hook signals to gracefully shutdown
  const shutdown = async () => {
    logger.log('Shutting down worker context...');
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrapWorker().catch((err) => {
  console.error('Worker bootstrap failed', err);
  process.exit(1);
});
