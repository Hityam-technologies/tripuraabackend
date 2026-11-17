const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../app');
const { createVerifiedUser, createAdminSession, auth } = require('./helpers/authHelpers');
const User = require('../models/User');
const TryOnJob = require('../models/TryOnJob');
const TryOnLedger = require('../models/TryOnLedger');
const TryOnUserSummary = require('../models/TryOnUserSummary');
const usage = require('../services/tryon/usage.service');

const app = createApp();

function jobDoc(userId, extra = {}) {
  return {
    userId,
    sareeId: 'saree-1',
    drapeProfileId: new mongoose.Types.ObjectId(),
    requestHash: `hash-${new mongoose.Types.ObjectId()}`,
    status: 'completed',
    customerBucket: 'FREE',
    fashnCreditsUsed: 2,
    fashnCreditsKnown: true,
    ...extra,
  };
}

describe('try-on usage report', () => {
  test('table totals match the ledger, and a free user has a negative margin', async () => {
    const account = await createVerifiedUser(app);
    const user = await User.findOne({ email: account.email });
    await usage.updateSettings({ rupeesPerCredit: 2, reason: 'Set the test rate' }, { name: 'Admin' }, {});
    const reserved = await usage.reserve(user);
    const job = await TryOnJob.create(jobDoc(user._id, { customerBucket: reserved.bucket, fashnCreditsUsed: 4 }));
    await usage.consume(job);

    const ledgerCredits = await TryOnLedger.aggregate([
      { $match: { userId: user._id, type: 'consume' } },
      { $group: { _id: null, credits: { $sum: '$fashnCredits' } } },
    ]);
    const page = await usage.listUsers({ page: 1, limit: 20, search: account.email });
    expect(page.totals.fashnCreditsUsed).toBe(ledgerCredits[0].credits);
    expect(page.items[0].fashnCreditsUsed).toBe(4);
    expect(page.items[0].freeUsed).toBe(1);
    expect(page.items[0].moneyNetPaise).toBe(0);
    expect(page.items[0].netMarginPaise).toBe(-800);
    expect(page.items[0].marginNegative).toBe(true);
    expect(page.settings.rupeesPerCredit).toBe(2);
  });

  test('a failed job is released with zero FASHN credits', async () => {
    const account = await createVerifiedUser(app);
    const user = await User.findOne({ email: account.email });
    const reserved = await usage.reserve(user);
    const job = await TryOnJob.create(jobDoc(user._id, {
      status: 'processing',
      customerBucket: reserved.bucket,
      fashnCreditsUsed: null,
      fashnCreditsKnown: false,
    }));
    await usage.release(job);
    const summary = await TryOnUserSummary.findOne({ userId: user._id });
    const stored = await TryOnJob.findById(job._id);
    expect(summary.tryOnsFailed).toBe(1);
    expect(summary.freeUsed).toBe(0);
    expect(summary.freeRemaining).toBe(summary.freeGranted);
    expect(summary.fashnCreditsUsed).toBe(0);
    expect(stored.fashnCreditsUsed).toBe(0);
    expect(stored.fashnCreditsKnown).toBe(true);
  });

  test('a cache hit costs nothing and does not use a try-on', async () => {
    const account = await createVerifiedUser(app);
    const user = await User.findOne({ email: account.email });
    await usage.openWallet(user);
    const before = await TryOnUserSummary.findOne({ userId: user._id });
    const hit = await TryOnJob.create(jobDoc(user._id, {
      cacheHit: true,
      customerBucket: 'NONE',
      fashnCreditsUsed: 0,
      fashnCreditsKnown: true,
      usageSettled: true,
      status: 'completed',
    }));
    await usage.recordCacheHit({ user, job: hit });
    const summary = await TryOnUserSummary.findOne({ userId: user._id });
    expect(summary.cacheHits).toBe(1);
    expect(summary.freeUsed).toBe(before.freeUsed);
    expect(summary.freeRemaining).toBe(before.freeRemaining);
    expect(summary.fashnCreditsUsed).toBe(0);
  });

  test('a refund reduces the money and reverses the paid try-ons', async () => {
    const account = await createVerifiedUser(app);
    const user = await User.findOne({ email: account.email });
    await usage.recordPurchase({ userId: user._id, tryOns: 2, amountPaise: 4000, note: 'Two drapes' });
    const refunded = await usage.recordRefund({ userId: user._id, tryOns: 2, amountPaise: 4000, note: 'Returned' });
    expect(refunded.paidPurchased).toBe(0);
    expect(refunded.paidRemaining).toBe(0);
    expect(refunded.moneyPaidPaise).toBe(4000);
    expect(refunded.refundPaise).toBe(4000);
    expect(refunded.moneyNetPaise).toBe(0);
  });

  test('changing the rupee rate changes the cost and keeps the credit count', async () => {
    const account = await createVerifiedUser(app);
    const user = await User.findOne({ email: account.email });
    await usage.updateSettings({ rupeesPerCredit: 1, reason: 'Opening rate' }, { name: 'Admin' }, {});
    const reserved = await usage.reserve(user);
    const job = await TryOnJob.create(jobDoc(user._id, { customerBucket: reserved.bucket, fashnCreditsUsed: 3 }));
    await usage.consume(job);
    await usage.updateSettings({ rupeesPerCredit: 5, reason: 'FASHN price changed' }, { name: 'Admin' }, {});
    const summary = await TryOnUserSummary.findOne({ userId: user._id });
    expect(summary.fashnCreditsUsed).toBe(3);
    expect(summary.fashnCostPaise).toBe(1500);
    expect(summary.netMarginPaise).toBe(-1500);
  });

  test('reconciliation reports a corrupted summary', async () => {
    const account = await createVerifiedUser(app);
    const user = await User.findOne({ email: account.email });
    await TryOnUserSummary.updateOne({ userId: user._id }, { freeUsed: 99 });
    const report = await usage.reconcile({ repair: false });
    expect(report.mismatches.some((item) => item.userId === String(user._id) && item.field === 'freeUsed' && item.actual === 99)).toBe(true);
  });

  test('a customer cannot open the usage report', async () => {
    const customer = await createVerifiedUser(app);
    const response = await request(app).get('/api/v1/admin/try-on/users').set(auth(customer.token));
    expect(response.status).toBe(403);
    const admin = await createAdminSession(app);
    const allowed = await request(app).get('/api/v1/admin/try-on/settings').set(auth(admin.token));
    expect(allowed.status).toBe(200);
  });

  test('the first page of 50000 users stays under one second', async () => {
    const docs = [];
    for (let index = 0; index < 50000; index += 1) {
      docs.push({
        userId: new mongoose.Types.ObjectId(),
        name: `User ${index}`,
        phone: `90000${String(index).padStart(5, '0')}`,
        email: `user${index}@example.com`,
        joinedAt: new Date('2026-01-01'),
        tryOnsCompleted: index % 12,
        fashnCreditsUsed: index % 20,
        fashnCreditsFree: index % 20,
        moneyNetPaise: index,
        moneyPaidPaise: index,
        fashnCostPaise: (index % 20) * 100,
        netMarginPaise: index - (index % 20) * 100,
        lastTryOnAt: new Date('2026-06-01'),
      });
    }
    for (let offset = 0; offset < docs.length; offset += 5000) {
      await TryOnUserSummary.insertMany(docs.slice(offset, offset + 5000), { ordered: false });
    }
    const started = Date.now();
    const page = await usage.listUsers({ page: 1, limit: 20, sort: 'fashnCredits', direction: 'desc' });
    const elapsed = Date.now() - started;
    expect(page.items).toHaveLength(20);
    expect(elapsed).toBeLessThan(1000);
    const explained = await usage.explainList({ page: 1, limit: 20, sort: 'fashnCredits', direction: 'desc' });
    const plan = explained.queryPlanner?.winningPlan;
    const indexName = plan?.inputStage?.indexName || plan?.stage;
    // Reported with the test result. The page reads the summary index, not the job collection.
    expect(indexName).toBeTruthy();
    expect(explained.executionStats.executionTimeMillis).toBeLessThan(1000);
    process.stdout.write(`\nUSAGE_PAGE_MS ${elapsed} INDEX ${indexName} EXPLAIN_MS ${explained.executionStats.executionTimeMillis}\n`);
  }, 120000);
});
