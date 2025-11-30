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
import { QueueService } from '../queue/queue.service';
import { JobQueues } from 'src/common/enums';
import { Queue } from 'bullmq';

async function bootstrapWorker() {
  const logger = new Logger('WorkerBootstrap');
  logger.log('Starting worker Nest context...');

  // create Nest application context (no HTTP)
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  logger.log('Nest app context created. Trying to fetch QueueService...');

  // Obtain QueueService from DI
  let queueService: QueueService;
  try {
    queueService = app.get(QueueService);
  } catch (err) {
    logger.error(
      'QueueService not available from DI. Did you import QueueModule into AppModule used by worker?',
      err,
    );
    process.exit(1);
    return;
  }

  // Helper to attach listeners and log counts for a given Bull Queue
  const attachQueueDiagnostics = async (q: Queue | null, name: string) => {
    if (!q) {
      logger.warn(`Queue ${name} is not available (null)`);
      return;
    }

    logger.log(`Attached to queue: ${name}`);

    try {
      const counts = await q.getJobCounts();
      logger.log(`Initial job counts for ${name}: ${JSON.stringify(counts)}`);
    } catch (err) {
      logger.error(`Failed to get job counts for ${name}`, err);
    }

    // subscribe to simple events where supported
    // try {
    //   q.on('waiting', (jobId: string) =>
    //     logger.log(`[${name}] waiting job ${jobId}`),
    //   );
    //   q.on('active', (job, jobPromise) =>
    //     logger.log(`[${name}] active job ${job.id}`),
    //   );
    //   q.on('completed', (job, result) =>
    //     logger.log(`[${name}] completed job ${job.id}`),
    //   );
    //   q.on('failed', (job, err) =>
    //     logger.error(`[${name}] failed job ${job?.id}`, err),
    //   );
    //   q.on('error', (err) => logger.error(`[${name}] queue error`, err));
    // } catch (err) {
    //   // Some transports or versions may not emit all events; don't crash the worker for that.
    //   logger.warn(
    //     `Could not attach normal event listeners on queue ${name} — continuing.`,
    //     err?.message ?? err,
    //   );
    // }
  };

  // Grab queues from your QueueService (these return bull.Queue instances)
  const syncQ = queueService.getSyncQueue();
  const rawQ = queueService.getRawEventsQueue();
  const normalizeQ = queueService.getNormalizeQueue();

  // Attach diagnostics
  await attachQueueDiagnostics(syncQ, JobQueues.SYNC_QUEUE);
  await attachQueueDiagnostics(rawQ, JobQueues.RAW_EVENTS);
  await attachQueueDiagnostics(normalizeQ, JobQueues.NORMALIZE);

  // Periodically print queue counts so you see background activity
  const pollIntervalMs = Number(process.env.WORKER_POLL_MS ?? 10000);
  const poller = setInterval(async () => {
    try {
      const syncCounts = syncQ ? await syncQ.getJobCounts() : null;
      const rawCounts = rawQ ? await rawQ.getJobCounts() : null;
      const normCounts = normalizeQ ? await normalizeQ.getJobCounts() : null;
      logger.log(
        'Queue counts: ' +
          `sync=${JSON.stringify(syncCounts)} raw=${JSON.stringify(rawCounts)} normalize=${JSON.stringify(normCounts)}`,
      );
    } catch (err) {
      logger.warn('Error while polling queue counts', err?.message ?? err);
    }
  }, pollIntervalMs);

  // graceful shutdown
  const shutdown = async () => {
    logger.log('Shutting down worker context...');
    clearInterval(poller);
    try {
      await app.close();
      logger.log('Nest app context closed.');
    } catch (err) {
      logger.error('Error while closing app context', err);
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.log(
    'Worker bootstrap completed — listening for jobs and logging queue activity.',
  );
}

bootstrapWorker().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Worker bootstrap failed', err);
  process.exit(1);
});

// async function bootstrapWorker() {
//   const logger = new Logger('WorkerBootstrap');
//   logger.log('Starting worker Nest context...');

//   // Create an application context (no HTTP)
//   const app = await NestFactory.createApplicationContext(AppModule, {
//     logger: ['error', 'warn', 'log'],
//   });

//   logger.log('Worker context started. Bull processors should now be active.');
//   // Keep process alive; Nest app context runs until process exit
//   // Optionally hook signals to gracefully shutdown
//   const shutdown = async () => {
//     logger.log('Shutting down worker context...');
//     await app.close();
//     process.exit(0);
//   };

//   process.on('SIGINT', shutdown);
//   process.on('SIGTERM', shutdown);
// }

// bootstrapWorker().catch((err) => {
//   console.error('Worker bootstrap failed', err);
//   process.exit(1);
// });
