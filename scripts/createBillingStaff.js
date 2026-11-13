const { connectDb, disconnectDb } = require('../config/db');
const { createStaff } = require('../services/billing.service');

async function main() {
  const { loadEnv } = require('../config/env');
  loadEnv();
  const pin = process.env.BILLING_STAFF_PIN;
  const name = process.env.BILLING_STAFF_NAME;
  if (!pin || !name) {
    throw new Error('Set BILLING_STAFF_NAME and BILLING_STAFF_PIN before creating a cashier.');
  }
  await connectDb();
  const staff = await createStaff({
    name,
    pin,
    role: process.env.BILLING_STAFF_ROLE || 'Cashier',
    register: process.env.BILLING_STAFF_REGISTER || 'Counter 01',
    phone: process.env.BILLING_STAFF_PHONE || '',
  });
  console.log(`Cashier ready: ${staff.name} (${staff.id})`);
  await disconnectDb();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { main };
