const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { resetEnvCache } = require('../config/env');
const { connectDb, disconnectDb } = require('../config/db');

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create({
    binary: { version: '7.0.14' },
  });
  process.env.MONGODB_URI = mongod.getUri();
  resetEnvCache();
  await connectDb({ retries: 1 });
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const collection of Object.values(collections)) {
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  await disconnectDb();
  if (mongod) await mongod.stop();
});
