const request = require('supertest');
const { createApp } = require('../app');
const { createAdminSession, auth } = require('./helpers/authHelpers');
const { seedCategory, seedSaree } = require('./helpers/factories');
const { createStaff } = require('../services/billing.service');
const Saree = require('../models/Saree');

const app = createApp();

async function cashier(pin = '246810') {
  await createStaff({
    name: 'Counter Cashier',
    role: 'Cashier',
    register: 'Counter 01',
    phone: '9845011223',
    pin,
  });
  const response = await request(app).post('/api/v1/billing/auth/pin').send({ pin });
  return response.body.data;
}

function bill(token, body) {
  return request(app).post('/api/v1/billing/invoices').set(auth(token)).send(body);
}

describe('billing register', () => {
  test('keeps the billing PIN separate from the admin sign-in', async () => {
    const admin = await createAdminSession(app);
    const session = await cashier();
    expect(session.token).toBeTruthy();
    expect(session.staff.name).toBe('Counter Cashier');
    expect(session.staff.pin).toBeUndefined();

    const wrong = await request(app).post('/api/v1/billing/auth/pin').send({ pin: '000000' });
    expect(wrong.status).toBe(401);

    const adminOnRegister = await request(app).get('/api/v1/billing/settings').set(auth(admin.token));
    expect(adminOnRegister.status).toBe(403);

    const cashierOnAdmin = await request(app).get('/api/v1/admin/sarees').set(auth(session.token));
    expect(cashierOnAdmin.status).toBe(403);

    const locked = await request(app).post('/api/v1/billing/auth/logout').set(auth(session.token));
    expect(locked.status).toBe(200);
    const after = await request(app).get('/api/v1/billing/settings').set(auth(session.token));
    expect(after.status).toBe(401);
  });

  test('sells stock once, keeps the tax snapshot, and hides a sold-out saree', async () => {
    await seedCategory();
    await seedSaree({ stockQuantity: 1, price: 10500, mrp: 12000 });
    const admin = await createAdminSession(app);
    const raised = await request(app).put('/api/v1/admin/system-config').set(auth(admin.token)).send({ gstRate: 12 });
    expect(raised.body.data.gstRate).toBe(12);

    const session = await cashier('135790');
    const payload = {
      customer: { name: 'Ananya Deshmukh', phone: '9823456789', city: 'Hyderabad', isWalkIn: false },
      items: [{ sareeId: 'saree-1', quantity: 1 }],
      services: [{ id: 'srv-1' }],
      payment: { mode: 'upi', referenceId: 'UPI123456' },
      idempotencyKey: 'sale-key-0001',
    };
    const first = await bill(session.token, payload);
    expect(first.status).toBe(200);
    expect(first.body.data.invoice.pricing.gstRate).toBe(12);
    expect(first.body.data.invoice.pricing.grandTotal).toBe(10850);
    expect(first.body.data.invoice.items[0].price).toBe(10500);

    const repeat = await bill(session.token, payload);
    expect(repeat.body.data.invoice.invoiceNumber).toBe(first.body.data.invoice.invoiceNumber);
    const stock = await Saree.findOne({ id: 'saree-1' });
    expect(stock.stockQuantity).toBe(0);

    const hidden = await request(app).get('/api/v1/sarees');
    expect(hidden.body.data.items.find((item) => item.id === 'saree-1')).toBeUndefined();

    const lowered = await request(app).put('/api/v1/admin/system-config').set(auth(admin.token)).send({ gstRate: 5 });
    expect(lowered.body.data.gstRate).toBe(5);
    const stored = await request(app).get(`/api/v1/billing/invoices/${first.body.data.invoice.id}`).set(auth(session.token));
    expect(stored.body.data.invoice.pricing.gstRate).toBe(12);

    const oversell = await bill(session.token, { ...payload, idempotencyKey: 'sale-key-0002' });
    expect(oversell.status).toBe(409);

    const returned = await request(app)
      .post(`/api/v1/billing/invoices/${first.body.data.invoice.id}/return`)
      .set(auth(session.token))
      .send({ reason: 'Size exchange' });
    expect(returned.status).toBe(200);
    expect((await Saree.findOne({ id: 'saree-1' })).stockQuantity).toBe(1);
    const twice = await request(app)
      .post(`/api/v1/billing/invoices/${first.body.data.invoice.id}/return`)
      .set(auth(session.token))
      .send({ reason: 'Size exchange' });
    expect(twice.status).toBe(409);

    const visible = await request(app).get('/api/v1/sarees');
    expect(visible.body.data.items.map((item) => item.id)).toContain('saree-1');
  });

  test('rejects a short payment and an empty bill', async () => {
    await seedSaree({ stockQuantity: 2, price: 1000, mrp: 1000 });
    const session = await cashier('112233');
    const empty = await bill(session.token, {
      customer: { name: 'Walk-in Guest', isWalkIn: true },
      items: [],
      payment: { mode: 'cash', amountReceived: 1000 },
      idempotencyKey: 'empty-bill-01',
    });
    expect(empty.status).toBe(400);

    const short = await bill(session.token, {
      customer: { name: 'Walk-in Guest', isWalkIn: true },
      items: [{ sareeId: 'saree-1', quantity: 1 }],
      payment: { mode: 'cash', amountReceived: 10 },
      idempotencyKey: 'short-bill-01',
    });
    expect(short.status).toBe(400);
    expect((await Saree.findOne({ id: 'saree-1' })).stockQuantity).toBe(2);
  });
});
