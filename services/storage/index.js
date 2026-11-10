const { getEnv } = require('../../config/env');
const { LocalStorage } = require('./local.storage');
const { S3Storage } = require('./s3.storage');

let instance = null;

function storage() {
  if (!instance) {
    instance = getEnv().STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage();
  }
  return instance;
}

function resetStorage() {
  instance = null;
}

module.exports = { storage, resetStorage };
