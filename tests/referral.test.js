const request = require('supertest');
const { createApp } = require('../app');
const { ApiError } = require('../utils/ApiError');
const User = require('../models/User');
const Referral = require('../models/Referral');
const email = require('../services/email.service');
const { createVerifiedUser, createAdminSession, registerUser, verifyUser, auth } = require('./helpers/authHelpers');
const { seedSaree } = require('./helpers/factories');

const app = createApp();

const address = {
  fullName: 'Priya Sharma',
  phone: '+91 9876543210',
  addressLine1: 'Plot No. 42, Road No. 10',
  addressLine2: '',
  city: 'Hyderabad',
  state: 'Telangana',
  postalCode: '500034',
};

async function place(token, extra = {}) {
  await request(app).post('/api/v1/cart/items').set(auth(token)).send({ productId: 'saree-1', quantity: 1 });
  return request(app).post('/api/v1/orders').set(auth(token)).send({
    paymentMethod: 'COD',
    shippingAddress: address,
    ...extra,
  });
}

describe('referral cash', () => {
  test('pays the new customer at signup and the referrer on the first order', async () => {
    const admin = await createAdminSession(app);
    const referrer = await createVerifiedUser(app, { fullName: 'Chaitanya Kumar' });
    const code = referrer.user.referralCode;
    expect(code).toMatch(/^CHAITAN\d{4,6}$/);

    const named = await request(app).get(`/api/v1/referrals/validate/${code}`);
    expect(named.status).toBe(200);
    expect(named.body.data).toMatchObject({
      valid: true,
      code,
      referrerName: 'Chaitanya K.',
      instantCash: 500,
    });

    const missing = await request(app).get('/api/v1/referrals/validate/NOPECODE');
    expect(missing.status).toBe(404);

    const pendingFriend = await registerUser(app, { fullName: 'Unverified Friend' });
    const pendingUser = await User.findOne({ email: pendingFriend.email });
    const tooSoon = await request(app).get(`/api/v1/referrals/validate/${pendingUser.referralCode}`);
    expect(tooSoon.status).toBe(404);

    const rejected = await registerUser(app, { fullName: 'Priya Sharma', referralCode: 'NOPECODE' });
    expect(rejected.response.status).toBe(400);
    expect(rejected.response.body.error.code).toBe('INVALID_REFERRAL');

    const registered = await registerUser(app, { fullName: 'Priya Sharma', referralCode: code });
    expect(registered.response.status).toBe(201);
    const waiting = await User.findOne({ email: registered.email });
    expect(waiting.walletBalance).toBe(0);
    expect(waiting.pendingReferralCode).toBe(code);
    expect(await Referral.countDocuments({ refereeId: waiting._id })).toBe(0);

    const verified = await verifyUser(app, registered.email, registered.code);
    expect(verified.status).toBe(200);
    expect(verified.body.data.user.walletBalance).toBe(500);
    expect(verified.body.data.user.referralCode).toMatch(/^PRIYASH\d{4,6}$/);
    const refereeToken = verified.body.data.accessToken;

    const pendingList = await request(app).get('/api/v1/referrals/me').set(auth(referrer.token));
    expect(pendingList.body.data.referralCode).toBe(code);
    expect(pendingList.body.data.totalRewards).toBe(0);
    expect(pendingList.body.data.referrals).toEqual([
      expect.objectContaining({ name: 'Priya S.', points: '+₹500', status: 'Pending', date: 'Today' }),
    ]);

    await seedSaree({ price: 1000, stockQuantity: 4 });
    const first = await place(refereeToken, { useWallet: true });
    expect(first.status).toBe(201);
    expect(first.body.data.subtotal).toBe(1000);
    expect(first.body.data.walletAmount).toBe(500);
    expect(first.body.data.totalAmount).toBe(500);

    const referrerAfter = await User.findById(referrer.user.id);
    const refereeAfter = await User.findById(verified.body.data.user.id);
    expect(referrerAfter.walletBalance).toBe(500);
    expect(refereeAfter.walletBalance).toBe(0);

    const completed = await request(app).get('/api/v1/referrals/me').set(auth(referrer.token));
    expect(completed.body.data.totalRewards).toBe(500);
    expect(completed.body.data.referrals[0].status).toBe('Completed');

    const second = await place(refereeToken);
    expect(second.status).toBe(201);
    expect((await User.findById(referrer.user.id)).walletBalance).toBe(500);

    const cancelSecond = await request(app).post(`/api/v1/orders/${second.body.data.id}/cancel`).set(auth(refereeToken));
    expect(cancelSecond.body.data.status).toBe('CANCELLED');
    expect((await User.findById(referrer.user.id)).walletBalance).toBe(500);

    const changed = await request(app).put('/api/v1/admin/referrals/settings').set(auth(admin.token)).send({
      enabled: true,
      refereeSignupBonus: 250,
      referrerOrderReward: 300,
    });
    expect(changed.body.data).toMatchObject({ refereeSignupBonus: 250, referrerOrderReward: 300, enabled: true });

    const cancelFirst = await request(app).post(`/api/v1/orders/${first.body.data.id}/cancel`).set(auth(refereeToken));
    expect(cancelFirst.body.data.status).toBe('CANCELLED');
    expect((await User.findById(referrer.user.id)).walletBalance).toBe(0);
    expect((await User.findById(verified.body.data.user.id)).walletBalance).toBe(500);
    const reopened = await request(app).get('/api/v1/referrals/me').set(auth(referrer.token));
    expect(reopened.body.data.referrals[0].status).toBe('Pending');

    const again = await place(refereeToken, { useWallet: true });
    expect(again.body.data.walletAmount).toBe(500);
    expect(again.body.data.totalAmount).toBe(500);
    expect((await User.findById(referrer.user.id)).walletBalance).toBe(500);

    const next = await createVerifiedUser(app, { fullName: 'Radhika V', referralCode: code });
    expect(next.user.walletBalance).toBe(250);
    const nextOrder = await place(next.token);
    expect(nextOrder.status).toBe(201);
    expect((await User.findById(referrer.user.id)).walletBalance).toBe(800);

    const adminRows = await request(app).get('/api/v1/admin/referrals?search=Priya').set(auth(admin.token));
    expect(adminRows.body.data.items.length).toBeGreaterThan(0);
    expect(adminRows.body.data.items[0].referrer.code).toBe(code);

    const paused = await request(app).put('/api/v1/admin/referrals/settings').set(auth(admin.token)).send({
      enabled: false,
      refereeSignupBonus: 250,
      referrerOrderReward: 300,
    });
    expect(paused.body.data.enabled).toBe(false);
    const blocked = await request(app).get(`/api/v1/referrals/validate/${code}`);
    expect(blocked.status).toBe(400);
    expect(blocked.body.error.code).toBe('REFERRAL_PAUSED');
  });

  test('a failed verification email does not leave a stuck account', async () => {
    const sendMail = jest.spyOn(email, 'sendMail').mockRejectedValueOnce(
      new ApiError(503, 'EMAIL_NOT_CONFIGURED', 'Email delivery is not configured.'),
    );
    const emailAddress = `retry${Date.now()}@example.com`;
    const phone = `+91 ${Math.floor(6000000000 + Math.random() * 100000000)}`;
    const first = await request(app).post('/api/v1/auth/register').send({
      fullName: 'Retry User',
      email: emailAddress,
      phone,
      password: 'Test@1234',
    });
    expect(first.status).toBe(503);
    expect(await User.countDocuments({ email: emailAddress })).toBe(0);

    sendMail.mockRestore();
    const second = await request(app).post('/api/v1/auth/register').send({
      fullName: 'Retry User',
      email: emailAddress,
      phone,
      password: 'Test@1234',
    });
    expect(second.status).toBe(201);
  });

  test('signing in again does not pay the signup cash twice', async () => {
    const referrer = await createVerifiedUser(app, { fullName: 'Chaitanya Kumar' });
    const friend = await createVerifiedUser(app, { fullName: 'Meera Nair', referralCode: referrer.user.referralCode });
    expect(friend.user.walletBalance).toBe(500);

    const again = await request(app).post('/api/v1/auth/login').send({
      email: friend.email,
      password: friend.password,
    });
    expect(again.status).toBe(200);
    expect(again.body.data.user.walletBalance).toBe(500);
    expect((await User.findById(friend.user.id)).walletBalance).toBe(500);
    expect(await Referral.countDocuments({ refereeId: friend.user.id })).toBe(1);
  });
});
