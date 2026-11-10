const request = require('supertest');
const { createApp } = require('../app');
const { createAdminSession, auth } = require('./helpers/authHelpers');
const { seedCategory, seedSaree, jpegBuffer } = require('./helpers/factories');
const { uploadLimits } = require('../middleware/upload');
const AuditLog = require('../models/AuditLog');

const app = createApp();
const photo = 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800';

function sareeBody(overrides = {}) {
  return {
    title: 'Test Kanchipuram',
    brand: 'Tripuraa',
    category: 'sarees',
    numericPrice: 25000,
    numericMrp: 30000,
    image: photo,
    ...overrides,
  };
}

describe('admin sarees', () => {
  afterEach(() => {
    uploadLimits.productMax = null;
  });

  test('creates, updates, duplicates, bulk-updates, and soft-deletes', async () => {
    await seedCategory();
    const admin = await createAdminSession(app);
    const created = await request(app).post('/api/v1/admin/sarees').set(auth(admin.token)).send(sareeBody());
    expect(created.status).toBe(201);
    expect(created.body.data.id).toMatch(/^saree-/);
    const id = created.body.data.id;

    const clash = await request(app).post('/api/v1/admin/sarees').set(auth(admin.token)).send(sareeBody({ slug: created.body.data.slug }));
    expect(clash.status).toBe(409);

    const updated = await request(app).put(`/api/v1/admin/sarees/${id}`).set(auth(admin.token)).send({
      title: 'Updated Kanchipuram',
      numericPrice: 26000,
      images: [{ id: 'img-1', url: photo, sortOrder: 0, isPrimary: true }],
      image: { url: photo },
      productCode: 'TSDBGBSR',
      codeParts: 'TS • DB • GB • SR',
      collectionLine: 'HERITAGE • ELEGANCE • HANDLOOM',
      body: 'Dark brown with large gold leaf / paisley buttas',
      border: 'Gap Border — thin elegant gold zari lines with gap',
      pallu: 'Rich gold geometric checks + gold border + black tassels',
      blouse: 'Dark brown with gold gap border',
      bookingTitle: 'Heritage Saree — Sangrahah Collection',
      codeLegend: 'Tripuraa Sangrahah • Dark Brown • Gap Border • Saree',
      footerLine: 'Tripuraa Sangrahah • Heritage Sarees • Custom Lehenga for Girls',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.title).toBe('Updated Kanchipuram');
    expect(updated.body.data.images[0].url).toBe(photo);
    expect(updated.body.data.productCode).toBe('TSDBGBSR');
    expect(updated.body.data.body).toBe('Dark brown with large gold leaf / paisley buttas');
    expect(updated.body.data.footerLine).toContain('Heritage Sarees');

    const copy = await request(app).post(`/api/v1/admin/sarees/${id}/duplicate`).set(auth(admin.token));
    expect(copy.status).toBe(201);
    expect(copy.body.data.isActive).toBe(false);

    const bulk = await request(app).post('/api/v1/admin/sarees/bulk').set(auth(admin.token)).send({ ids: [id], action: 'deactivate' });
    expect(bulk.status).toBe(200);
    const hidden = await request(app).get(`/api/v1/sarees/${id}`);
    expect(hidden.status).toBe(404);
    const visible = await request(app).get(`/api/v1/admin/sarees/${id}`).set(auth(admin.token));
    expect(visible.body.data.isActive).toBe(false);

    const removed = await request(app).delete(`/api/v1/admin/sarees/${id}`).set(auth(admin.token));
    expect(removed.status).toBe(200);
    expect(removed.body.data.deletedAt).toBeTruthy();
    expect(await AuditLog.countDocuments({ resource: 'saree' })).toBeGreaterThan(0);
  });

  test('rejects a spoofed or oversized image and reorders a real one', async () => {
    await seedCategory();
    await seedSaree();
    const admin = await createAdminSession(app);
    const spoofed = await request(app)
      .post('/api/v1/admin/sarees/saree-1/images')
      .set(auth(admin.token))
      .attach('images', Buffer.from('<?php echo 1;'), 'photo.jpg');
    expect(spoofed.status).toBe(400);

    uploadLimits.productMax = 50;
    const big = await jpegBuffer(80, 80);
    const oversize = await request(app)
      .post('/api/v1/admin/sarees/saree-1/images')
      .set(auth(admin.token))
      .attach('images', big, 'big.jpg');
    expect(oversize.status).toBe(413);

    uploadLimits.productMax = null;
    const added = await request(app)
      .post('/api/v1/admin/sarees/saree-1/images')
      .set(auth(admin.token))
      .attach('images', await jpegBuffer(120, 120), 'real.png');
    expect(added.status).toBe(200);
    const images = added.body.data.images;
    const order = await request(app).put('/api/v1/admin/sarees/saree-1/images/order').set(auth(admin.token)).send({
      order: images.map((image, index) => ({ id: image.id, sortOrder: images.length - index, isPrimary: index === images.length - 1 })),
    });
    expect(order.status).toBe(200);
    expect(order.body.data.images.find((image) => image.isPrimary).id).toBe(images[images.length - 1].id);
    const deleted = await request(app).delete(`/api/v1/admin/sarees/saree-1/images/${images[0].id}`).set(auth(admin.token));
    expect(deleted.status).toBe(200);

    const byUrl = await request(app)
      .post('/api/v1/admin/sarees/saree-1/images/urls')
      .set(auth(admin.token))
      .send({ urls: [photo, `${photo}&extra=1`] });
    expect(byUrl.status).toBe(200);
    expect(byUrl.body.data.images.some((image) => image.url === photo)).toBe(true);
  });
});
