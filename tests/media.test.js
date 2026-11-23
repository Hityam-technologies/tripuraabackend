jest.mock('../config/imagekit', () => ({
  getImageKit: jest.fn(),
  assertImageKitConfigured: jest.fn(),
}));

process.env.IMAGEKIT_PUBLIC_KEY = 'public_test';
process.env.IMAGEKIT_PRIVATE_KEY = 'private_test';
process.env.IMAGEKIT_URL_ENDPOINT = 'https://ik.imagekit.io/test';

const request = require('supertest');
const { resetEnvCache } = require('../config/env');

resetEnvCache();

const { createApp } = require('../app');
const imagekit = require('../config/imagekit');
const User = require('../models/User');
const { createVerifiedUser, createAdminSession, auth } = require('./helpers/authHelpers');

const app = createApp();
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const upload = jest.fn();
const deleteFile = jest.fn();
const moveFile = jest.fn();
const url = jest.fn();
const getAuthenticationParameters = jest.fn();

describe('ImageKit media routes', () => {
  beforeEach(() => {
    let count = 0;
    upload.mockReset();
    upload.mockImplementation(async ({ fileName, folder }) => {
      count += 1;
      return {
        fileId: `fileid${String(count).padStart(4, '0')}`,
        name: fileName,
        url: `https://ik.imagekit.io/test${folder}/${fileName}`,
        thumbnailUrl: `https://ik.imagekit.io/test/thumb${folder}/${fileName}`,
      };
    });
    deleteFile.mockReset();
    deleteFile.mockResolvedValue({});
    moveFile.mockReset();
    moveFile.mockResolvedValue({});
    url.mockReset();
    url.mockImplementation(({ path, src, transformation }) => {
      const base = src || `https://ik.imagekit.io/test${path}`;
      return `${base}?tr=${transformation?.[0]?.width || 'auto'}`;
    });
    getAuthenticationParameters.mockReset();
    getAuthenticationParameters.mockReturnValue({ token: 'tok', expire: 123, signature: 'sig' });
    imagekit.getImageKit.mockReturnValue({
      upload,
      deleteFile,
      moveFile,
      url,
      getAuthenticationParameters,
    });
  });

  test('an admin can upload saree images and a customer cannot', async () => {
    const customer = await createVerifiedUser(app);
    const blocked = await request(app)
      .post('/api/v1/media/upload/saree')
      .set(auth(customer.token))
      .attach('images', png, 'saree.png');
    expect(blocked.status).toBe(403);

    const admin = await createAdminSession(app);
    const saved = await request(app)
      .post('/api/v1/media/upload/saree')
      .set(auth(admin.token))
      .attach('images', png, 'one.png')
      .attach('images', png, 'two.png');
    expect(saved.status).toBe(201);
    expect(saved.body.data.images).toHaveLength(2);
    expect(saved.body.data.images[0].url).toContain('/sarees/');
    expect(saved.body.data.images[0].key).toBe('imagekit:fileid0001');
    expect(upload.mock.calls[0][0].folder).toBe('/sarees');
    expect(upload.mock.calls[0][0].useUniqueFileName).toBe(true);

    const poster = await request(app)
      .post('/api/v1/media/upload/image')
      .query({ folder: 'hero' })
      .set(auth(admin.token))
      .attach('image', png, 'poster.png');
    expect(poster.status).toBe(201);
    expect(poster.body.data.url).toContain('/hero/');

    const clip = Buffer.from('00000018667479706d703432', 'hex');
    const video = await request(app)
      .post('/api/v1/media/upload/hero-video')
      .set(auth(admin.token))
      .attach('video', clip, 'home.mp4');
    expect(video.status).toBe(201);
    expect(upload.mock.calls.at(-1)[0].folder).toBe('/hero');
  });

  test('a signed-in customer can set an avatar and replace it once', async () => {
    const customer = await createVerifiedUser(app);
    const first = await request(app)
      .post('/api/v1/media/upload/avatar')
      .set(auth(customer.token))
      .attach('avatar', png, 'me.png');
    expect(first.status).toBe(201);
    expect(first.body.data.user.avatarUrl).toContain('/profile-pics/');

    const second = await request(app)
      .post('/api/v1/media/upload/avatar')
      .set(auth(customer.token))
      .attach('avatar', png, 'me2.png');
    expect(second.status).toBe(201);
    expect(deleteFile).toHaveBeenCalledWith('fileid0001');

    const fresh = await User.findById(customer.user.id);
    expect(fresh.avatarUrl).toContain('/profile-pics/');
    expect(fresh.avatarFileId).toBe('fileid0002');
  });

  test('a failed save removes the file that was just uploaded', async () => {
    const customer = await createVerifiedUser(app);
    const spy = jest.spyOn(User.prototype, 'save').mockRejectedValueOnce(new Error('db down'));
    try {
      const failed = await request(app)
        .post('/api/v1/media/upload/avatar')
        .set(auth(customer.token))
        .attach('avatar', png, 'me.png');
      expect(failed.status).toBe(500);
      expect(deleteFile).toHaveBeenCalledWith('fileid0001');
      const fresh = await User.findById(customer.user.id);
      expect(fresh.avatarUrl || '').toBe('');
    } finally {
      spy.mockRestore();
    }
  });

  test('rejects a file that is not a real image and a request with no token', async () => {
    const open = await request(app).post('/api/v1/media/upload/avatar').attach('avatar', png, 'me.png');
    expect(open.status).toBe(401);

    const customer = await createVerifiedUser(app);
    const fake = await request(app)
      .post('/api/v1/media/upload/avatar')
      .set(auth(customer.token))
      .attach('avatar', Buffer.from('not an image'), 'face.png');
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe('BAD_IMAGE');

    const text = await request(app)
      .post('/api/v1/media/upload/avatar')
      .set(auth(customer.token))
      .attach('avatar', Buffer.from('hello'), 'notes.txt');
    expect(text.status).toBe(400);
  });

  test('a file saved at the library root is moved into its folder', async () => {
    upload.mockImplementationOnce(async () => ({
      fileId: 'fileidroot1',
      name: 'photo.webp',
      filePath: '/photo.webp',
      url: 'https://ik.imagekit.io/test/photo.webp',
      thumbnailUrl: 'https://ik.imagekit.io/test/thumb/photo.webp',
    }));
    const admin = await createAdminSession(app);
    const saved = await request(app)
      .post('/api/v1/media/upload/image')
      .query({ folder: 'sarees' })
      .set(auth(admin.token))
      .attach('image', png, 'photo.png');
    expect(saved.status).toBe(201);
    expect(moveFile).toHaveBeenCalledWith({
      sourceFilePath: '/photo.webp',
      destinationPath: '/sarees/',
    });
    expect(saved.body.data.url).toBe('https://ik.imagekit.io/test/sarees/photo.webp');
  });

  test('a signed-in client can ask for upload signature without the private key', async () => {
    const customer = await createVerifiedUser(app);
    const response = await request(app).get('/api/v1/media/auth').set(auth(customer.token));
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      token: 'tok',
      expire: 123,
      signature: 'sig',
      publicKey: 'public_test',
    });
    expect(JSON.stringify(response.body)).not.toContain('private_test');
  });
});
