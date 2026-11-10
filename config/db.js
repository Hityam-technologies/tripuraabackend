const mongoose = require('mongoose');
const { getEnv } = require('./env');
const { logger } = require('./logger');

let connecting = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectDb({ retries = 5 } = {}) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connecting) return connecting;

  const uri = getEnv().MONGODB_URI;
  mongoose.set('strictQuery', true);

  connecting = (async () => {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        await mongoose.connect(uri, {
          serverSelectionTimeoutMS: 10000,
          maxPoolSize: 10,
          // Jest cannot dynamic-import('os'); without this the driver sends empty client metadata.
          runtimeAdapters: { os: require('os') },
        });
        logger.info('database connected');
        return mongoose.connection;
      } catch (error) {
        lastError = error;
        logger.error('database connection failed', { attempt, message: error.message });
        if (attempt < retries) await sleep(Math.min(5000, attempt * 1000));
      }
    }
    throw lastError;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

async function disconnectDb() {
  connecting = null;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

module.exports = { connectDb, disconnectDb };
