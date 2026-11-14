const request = require('supertest');
const { createApp } = require('../app');
const { createVerifiedUser, createAdminSession, auth } = require('./helpers/authHelpers');

const app = createApp();
const id = '507f1f77bcf86cd799439011';

const protectedRoutes = [
  ['get', '/api/v1/admin/dashboard/stats'],
  ['get', '/api/v1/admin/sarees'],
  ['post', '/api/v1/admin/sarees'],
  ['get', `/api/v1/admin/sarees/${id}`],
  ['put', `/api/v1/admin/sarees/${id}`],
  ['delete', `/api/v1/admin/sarees/${id}`],
  ['post', '/api/v1/admin/sarees/bulk'],
  ['post', `/api/v1/admin/sarees/${id}/duplicate`],
  ['post', `/api/v1/admin/sarees/${id}/images`],
  ['put', `/api/v1/admin/sarees/${id}/images/order`],
  ['delete', `/api/v1/admin/sarees/${id}/images/${id}`],
  ['get', '/api/v1/admin/categories'],
  ['post', '/api/v1/admin/categories'],
  ['put', '/api/v1/admin/categories/reorder'],
  ['put', '/api/v1/admin/categories/sarees'],
  ['delete', '/api/v1/admin/categories/sarees'],
  ['get', '/api/v1/admin/enquiries'],
  ['get', '/api/v1/admin/enquiries/export'],
  ['get', `/api/v1/admin/enquiries/${id}`],
  ['put', `/api/v1/admin/enquiries/${id}/status`],
  ['post', `/api/v1/admin/enquiries/${id}/notes`],
  ['get', '/api/v1/admin/users'],
  ['get', `/api/v1/admin/users/${id}`],
  ['put', `/api/v1/admin/users/${id}/block`],
  ['patch', `/api/v1/admin/users/${id}/block`],
  ['patch', `/api/v1/admin/users/${id}/unblock`],
  ['get', '/api/v1/admin/looks'],
  ['patch', `/api/v1/admin/looks/${id}/flag`],
  ['delete', `/api/v1/admin/looks/${id}`],
  ['get', '/api/v1/admin/try-on/jobs'],
  ['get', '/api/v1/admin/try-on/credits'],
  ['get', '/api/v1/admin/content/hero'],
  ['put', '/api/v1/admin/content/hero'],
  ['get', '/api/v1/admin/content/store'],
  ['put', '/api/v1/admin/content/store'],
  ['get', '/api/v1/admin/content/support'],
  ['put', '/api/v1/admin/content/support'],
  ['get', '/api/v1/admin/content/faq'],
  ['put', '/api/v1/admin/content/faq'],
  ['get', '/api/v1/admin/content/legal/terms'],
  ['put', '/api/v1/admin/content/legal/terms'],
  ['get', '/api/v1/admin/system-config'],
  ['put', '/api/v1/admin/system-config'],
  ['get', '/api/v1/admin/audit-logs'],
  ['get', '/api/v1/admin/auth/me'],
  ['put', '/api/v1/admin/auth/change-password'],
];

const customerOnly = [
  ['get', '/api/v1/users/me'],
  ['put', '/api/v1/users/me'],
  ['delete', '/api/v1/users/me'],
  ['get', '/api/v1/users/me/wishlist'],
  ['post', '/api/v1/users/me/wishlist/saree-1'],
  ['delete', '/api/v1/users/me/wishlist/saree-1'],
  ['get', '/api/v1/users/me/drape-profiles'],
  ['get', '/api/v1/users/me/try-on-looks'],
  ['post', '/api/v1/users/me/try-on-looks'],
  ['get', '/api/v1/users/me/enquiries'],
  ['post', '/api/v1/orders/enquiry'],
  ['post', '/api/v1/try-on/generate-drape'],
  ['get', `/api/v1/try-on/jobs/${id}`],
];

describe('admin route guard', () => {
  test.each(protectedRoutes)('%s %s rejects missing and customer tokens', async (method, url) => {
    const open = await request(app)[method](url);
    expect(open.status).toBe(401);

    const customer = await createVerifiedUser(app);
    const asCustomer = await request(app)[method](url).set(auth(customer.token));
    expect([401, 403]).toContain(asCustomer.status);

    const admin = await createAdminSession(app);
    const asAdmin = await request(app)[method](url).set(auth(admin.token));
    expect(asAdmin.status).not.toBe(401);
    expect(asAdmin.status).not.toBe(403);
  });

  test.each(customerOnly)('admin token cannot call %s %s', async (method, url) => {
    const admin = await createAdminSession(app);
    const response = await request(app)[method](url).set(auth(admin.token));
    expect([401, 403]).toContain(response.status);
  });
});
