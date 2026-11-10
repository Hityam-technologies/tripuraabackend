const { connectDb, disconnectDb } = require('../config/db');
const { hashPassword } = require('../services/auth.service');
const { revokeAll } = require('../services/token.service');
const Admin = require('../models/Admin');

async function createAdminAccount({ email, password, name = 'Tripuraa Admin', resetPassword = false } = {}) {
  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required.');
  }
  const existing = await Admin.findOne({ singleton: 'admin' });
  if (existing && !resetPassword) {
    return { created: false, id: String(existing._id), message: 'An admin already exists. Refusing to create a second admin.' };
  }
  if (existing && resetPassword) {
    existing.email = email;
    existing.passwordHash = await hashPassword(password);
    existing.name = name || existing.name;
    existing.failedLoginCount = 0;
    existing.lockedUntil = null;
    await existing.save();
    await revokeAll(existing._id, 'admin');
    return { created: false, reset: true, id: String(existing._id) };
  }
  const admin = await Admin.create({
    singleton: 'admin',
    email,
    passwordHash: await hashPassword(password),
    name,
  });
  return { created: true, id: String(admin._id) };
}

async function main() {
  const { loadEnv, getEnv } = require('../config/env');
  loadEnv();
  await connectDb();
  const resetPassword = process.argv.includes('--reset-password');
  const env = getEnv();
  let email = env.ADMIN_EMAIL;
  let password = env.ADMIN_PASSWORD;
  if (!email || !password) {
    if (!process.stdin.isTTY) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD.');
    const readline = require('readline/promises');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    email = email || await rl.question('Admin email: ');
    password = password || await rl.question('Admin password: ');
    rl.close();
  }
  const result = await createAdminAccount({ email: email.trim().toLowerCase(), password, resetPassword });
  console.log(result.message || (result.reset ? 'Admin password reset.' : 'Admin created.'));
  await disconnectDb();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { createAdminAccount };
