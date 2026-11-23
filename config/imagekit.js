const ImageKit = require('imagekit');
const { getEnv } = require('./env');
const { ApiError } = require('../utils/ApiError');

let client = null;
let clientKey = '';

function imageKitConfig() {
  const env = getEnv();
  const urlEndpoint = String(env.IMAGEKIT_URL_ENDPOINT || '').trim().replace(/\/?$/, '/');
  return {
    publicKey: String(env.IMAGEKIT_PUBLIC_KEY || '').trim(),
    privateKey: String(env.IMAGEKIT_PRIVATE_KEY || '').trim(),
    urlEndpoint,
  };
}

function assertImageKitConfigured() {
  const config = imageKitConfig();
  if (!config.publicKey || !config.privateKey || config.urlEndpoint === '/') {
    throw new ApiError(503, 'IMAGEKIT_NOT_CONFIGURED', 'Image uploads are not configured yet.');
  }
  return config;
}

function getImageKit() {
  const config = assertImageKitConfigured();
  const fingerprint = `${config.publicKey}:${config.urlEndpoint}`;
  if (!client || clientKey !== fingerprint) {
    client = new ImageKit({
      publicKey: config.publicKey,
      privateKey: config.privateKey,
      urlEndpoint: config.urlEndpoint,
    });
    clientKey = fingerprint;
  }
  return client;
}

module.exports = { getImageKit, assertImageKitConfigured };
