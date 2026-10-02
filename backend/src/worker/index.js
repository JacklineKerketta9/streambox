const { Worker } = require('bullmq');
const env = require('../config/env');
const logger = require('../config/logger');
const prisma = require('../db/prisma');
const { ensureBucket } = require('../storage/s3');
const { createConnection } = require('../queue/connection');
const { QUEUE_NAME } = require('../queue/transcodeQueue');
const { processTranscode, handleFailure } = require('./transcode');
const { flushProgress } = require('../modules/playback/progress');

async function main() {
  await prisma.$connect();
  await ensureBucket();

  const worker = new Worker(QUEUE_NAME, processTranscode, {
    connection: createConnection(),
    concurrency: env.TRANSCODE_CONCURRENCY, // parallel FFmpeg jobs per worker process
  });
  worker.on('failed', handleFailure);
  worker.on('error', (err) => logger.error({ err }, 'Worker error'));
  const progressTimer = setInterval(() => {
    flushProgress().catch((err) => logger.error({ err }, 'Progress flush failed; buffered entries remain in Redis'));
  }, 10000);
  progressTimer.unref();
  logger.info(`Transcode worker ready (concurrency ${env.TRANSCODE_CONCURRENCY})`);

  // finish the current job on shutdown; if we get killed instead, BullMQ re-queues the stalled job
  const shutdown = async (signal) => {
    logger.info(`${signal} received, closing worker`);
    clearInterval(progressTimer);
    await flushProgress().catch((err) => logger.error({ err }, 'Final progress flush failed'));
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Worker failed to start');
  process.exit(1);
});
