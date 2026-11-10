const request = require('supertest');
const { createApp } = require('../app');
const { seedCategory, seedSaree } = require('./helpers/factories');

const app = createApp();

describe('catalog', () => {
  test('filters, searches, sorts, paginates, and hides inactive or deleted sarees', async () => {
    await seedCategory();
    await seedCategory({ id: 'katan', label: 'Banarasi', sortOrder: 2 });
    await seedSaree();
    await seedSaree({
      id: 'saree-2',
      slug: 'emerald',
      title: 'Emerald Banarasi',
      category: 'katan',
      price: 38000,
      mrp: 44000,
      isFeatured: false,
    });
    await seedSaree({ id: 'saree-hidden', slug: 'hidden', title: 'Hidden Weave', isActive: false });
    await seedSaree({ id: 'saree-gone', slug: 'gone', title: 'Gone Weave', deletedAt: new Date(), isActive: false });

    const list = await request(app).get('/api/v1/sarees');
    expect(list.status).toBe(200);
    expect(list.body.data.items.map((item) => item.id).sort()).toEqual(['saree-1', 'saree-2']);
    expect(list.body.data.items[0].price).toMatch(/^₹/);
    expect(list.body.meta.total).toBe(2);

    const filtered = await request(app).get('/api/v1/sarees?category=katan');
    expect(filtered.body.data.items).toHaveLength(1);
    expect(filtered.body.data.items[0].id).toBe('saree-2');

    const search = await request(app).get('/api/v1/sarees?search=emerald');
    expect(search.body.data.items[0].title).toMatch(/Emerald/);

    const sorted = await request(app).get('/api/v1/sarees?sort=price_desc');
    expect(sorted.body.data.items[0].id).toBe('saree-2');

    const page = await request(app).get('/api/v1/sarees?page=1&limit=1');
    expect(page.body.data.items).toHaveLength(1);
    expect(page.body.data.totalPages).toBe(2);

    expect((await request(app).get('/api/v1/sarees?page=0')).status).toBe(400);
    expect((await request(app).get('/api/v1/sarees?limit=999')).status).toBe(400);
    expect((await request(app).get('/api/v1/sarees?page=abc')).status).toBe(400);

    const one = await request(app).get('/api/v1/sarees/saree-1');
    expect(one.status).toBe(200);
    expect(one.body.data.numericPrice).toBe(28500);
    expect((await request(app).get('/api/v1/sarees/saree-hidden')).status).toBe(404);
    expect((await request(app).get('/api/v1/sarees/missing')).status).toBe(404);

    const categories = await request(app).get('/api/v1/categories');
    expect(categories.body.data.map((item) => item.id)).toEqual(['sarees', 'katan']);
  });
});
