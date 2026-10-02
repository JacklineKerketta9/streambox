const env = require('./config/env');
const logger = require('./config/logger');
const prisma = require('./db/prisma');
const authService = require('./modules/auth/auth.service');
const { ensureBucket } = require('./storage/s3');
const { createApp } = require('./app');

async function main() {
  await prisma.$connect();
  logger.info('MySQL connected');

  ensureBucket()
    .then(() => logger.info('Object storage ready'))
    .catch((err) => logger.warn({ err }, 'Object storage not ready; uploads will fail until MinIO is up'));

  const server = createApp().listen(env.PORT, () => logger.info(`API listening on :${env.PORT}`));

  // Hourly cleanup of expired refresh tokens (later this can become a BullMQ repeatable job).
  const cleanup = setInterval(() => {
    authService
      .deleteExpiredRefreshTokens()
      .then((n) => n && logger.info(`Deleted ${n} expired refresh tokens`))
      .catch((err) => logger.error({ err }, 'Token cleanup failed'));
  }, 60 * 60 * 1000);
  cleanup.unref();

  // Graceful shutdown: stop accepting requests, finish in-flight ones, close DB.
  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start');
  process.exit(1);
});
