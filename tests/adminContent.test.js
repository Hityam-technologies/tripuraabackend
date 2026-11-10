const request = require('supertest');
const { createApp } = require('../app');
const { createAdminSession, auth } = require('./helpers/authHelpers');

const app = createApp();

describe('admin content', () => {
  test('updates hero, store, faq, and legal pages the public app reads', async () => {
    const admin = await createAdminSession(app);
    const hero = await request(app).put('/api/v1/admin/content/hero').set(auth(admin.token)).send({
      title: 'Loom House',
      subtitle: 'Handloom edit',
    });
    expect(hero.status).toBe(200);
    const store = await request(app).put('/api/v1/admin/content/store').set(auth(admin.token)).send({
      name: 'Jubilee Hills Atelier',
      addressLine1: 'Road No. 36',
    });
    expect(store.status).toBe(200);
    const faq = await request(app).put('/api/v1/admin/content/faq').set(auth(admin.token)).send({
      items: [{ id: '1', question: 'Silk mark?', answer: 'Yes.' }],
    });
    expect(faq.status).toBe(200);
    const legal = await request(app).put('/api/v1/admin/content/legal/policy').set(auth(admin.token)).send({
      title: 'Privacy',
      sections: [{ title: 'Photos', content: 'Private.' }],
    });
    expect(legal.status).toBe(200);

    expect((await request(app).get('/api/v1/content/hero')).body.data.title).toBe('Loom House');
    expect((await request(app).get('/api/v1/content/store-address')).body.data.name).toBe('Jubilee Hills Atelier');
    expect((await request(app).get('/api/v1/content/faq')).body.data[0].question).toBe('Silk mark?');
    expect((await request(app).get('/api/v1/legal/policy')).body.data.title).toBe('Privacy');
    expect((await request(app).get('/api/v1/legal/nope')).status).toBe(404);
  });
});
