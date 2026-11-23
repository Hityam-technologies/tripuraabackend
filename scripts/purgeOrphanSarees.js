const { connectDb, disconnectDb } = require('../config/db');
const { removeSareesWithoutCategory } = require('../services/catalog.service');

async function main() {
  await connectDb({ retries: 2 });
  const removed = await removeSareesWithoutCategory();
  console.log(`removed ${removed} saree records whose category no longer exists`);
  await disconnectDb();
}

main().catch(async (error) => {
  console.error(error.message);
  await disconnectDb();
  process.exit(1);
});
