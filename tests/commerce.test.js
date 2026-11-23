const request = require('supertest');
const { createApp } = require('../app');
const { createVerifiedUser, createAdminSession, auth } = require('./helpers/authHelpers');
const { seedSaree } = require('./helpers/factories');
const Saree = require('../models/Saree');

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

async function bag(token, quantity = 1) {
  return request(app).post('/api/v1/cart/items').set(auth(token)).send({ productId: 'saree-1', quantity });
}

describe('shop orders', () => {
  test('bag quantity stays on the number the shopper chose', async () => {
    const customer = await createVerifiedUser(app);
    await seedSaree({ stockQuantity: 3, price: 10000 });
    await bag(customer.token, 1);

    const raised = await request(app).put('/api/v1/cart/items/saree-1').set(auth(customer.token)).send({ quantity: 3 });
    expect(raised.status).toBe(200);
    expect(raised.body.data.items[0].quantity).toBe(3);
    expect(raised.body.data.items[0].stockQuantity).toBe(3);

    const lowered = await request(app).put('/api/v1/cart/items/saree-1').set(auth(customer.token)).send({ quantity: 2 });
    expect(lowered.status).toBe(200);
    expect(lowered.body.data.items[0].quantity).toBe(2);

    const capped = await request(app).put('/api/v1/cart/items/saree-1').set(auth(customer.token)).send({ quantity: 9 });
    expect(capped.status).toBe(200);
    expect(capped.body.data.items[0].quantity).toBe(3);

    await Saree.updateOne({ id: 'saree-1' }, { stockQuantity: 1 });
    const stillLower = await request(app).put('/api/v1/cart/items/saree-1').set(auth(customer.token)).send({ quantity: 1 });
    expect(stillLower.status).toBe(200);
    expect(stillLower.body.data.items[0].quantity).toBe(1);
  });

  test('a cash order uses the catalog price, clears the bag, and can be cancelled', async () => {
    const customer = await createVerifiedUser(app);
    await seedSaree({ price: 49500, stockQuantity: 2 });
    const added = await bag(customer.token);
    expect(added.body.data.subtotal).toBe(49500);
    expect(added.body.data.items[0].price).toBe(49500);

    const priced = await request(app).post('/api/v1/promotions/validate').set(auth(customer.token)).send({ code: 'UTSAV10', subtotal: 1 });
    expect(priced.body.data.valid).toBe(true);
    expect(priced.body.data.discountAmount).toBe(4950);

    const placed = await request(app).post('/api/v1/orders').set(auth(customer.token)).send({
      paymentMethod: 'COD',
      promoCode: 'UTSAV10',
      shippingAddress: address,
      items: [{ productId: 'saree-1', price: 1, quantity: 1 }],
      totalAmount: 1,
    });
    expect(placed.status).toBe(201);
    expect(placed.body.data.subtotal).toBe(49500);
    expect(placed.body.data.discountAmount).toBe(4950);
    expect(placed.body.data.totalAmount).toBe(44550);
    expect(placed.body.data.shippingFee).toBe(0);
    expect(placed.body.data.paymentStatus).toBe('PAY_ON_DELIVERY');
    expect(placed.body.data.trackingSteps[2].current).toBe(true);
    expect(placed.body.data.orderNumber).toMatch(/^TS-/);

    const saree = await Saree.findOne({ id: 'saree-1' });
    expect(saree.stockQuantity).toBe(1);
    const emptied = await request(app).get('/api/v1/cart').set(auth(customer.token));
    expect(emptied.body.data.cartCount).toBe(0);

    const online = await request(app).post('/api/v1/orders').set(auth(customer.token)).send({ paymentMethod: 'ONLINE', shippingAddress: address });
    expect(online.status).toBe(503);

    const cancelled = await request(app).post(`/api/v1/orders/${placed.body.data.id}/cancel`).set(auth(customer.token));
    expect(cancelled.body.data.status).toBe('CANCELLED');
    const restored = await Saree.findOne({ id: 'saree-1' });
    expect(restored.stockQuantity).toBe(2);
  });

  test('the welcome coupon works once, and the admin moves the order forward', async () => {
    const customer = await createVerifiedUser(app);
    const admin = await createAdminSession(app);
    await seedSaree({ price: 28500, stockQuantity: 3 });
    await bag(customer.token);
    const first = await request(app).post('/api/v1/orders').set(auth(customer.token)).send({
      paymentMethod: 'COD',
      promoCode: 'WELCOME',
      shippingAddress: address,
    });
    expect(first.body.data.discountAmount).toBe(2000);

    await bag(customer.token);
    const second = await request(app).post('/api/v1/orders').set(auth(customer.token)).send({
      paymentMethod: 'COD',
      promoCode: 'WELCOME',
      shippingAddress: address,
    });
    expect(second.status).toBe(400);

    const moved = await request(app)
      .patch(`/api/v1/admin/orders/${first.body.data.id}/status`)
      .set(auth(admin.token))
      .send({ status: 'PROCESSING' });
    expect(moved.body.data.status).toBe('PROCESSING');
    expect(moved.body.data.trackingSteps[3].current).toBe(true);

    const mine = await request(app).get('/api/v1/orders').set(auth(customer.token));
    expect(mine.body.data[0].statusLabel).toBe('Packing');
  });
});
