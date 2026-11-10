const { loadEnv, getEnv } = require('./config/env');
const { connectDb, disconnectDb } = require('./config/db');
const { logger } = require('./config/logger');
const { createApp } = require('./app');

let server;

async function start() {
  loadEnv();
  await connectDb();
  const { purgeExpiredRenders } = require('./services/tryon/tryOn.service');
  await purgeExpiredRenders().catch((error) => logger.warn('render retention skipped', { message: error.message }));
  const app = createApp();
  const env = getEnv();
  server = app.listen(env.PORT, () => {
    logger.info('server listening', { port: env.PORT });
  });

  const shutdown = async (signal) => {
    logger.info('shutdown started', { signal });
    const runner = app.get('jobRunner');
    if (runner) await runner.stop();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDb();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  start().catch((error) => {
    logger.error('server failed to start', { message: error.message });
    process.exit(1);
  });
}

module.exports = { start };
