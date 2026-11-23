const crypto = require('crypto');
const sharp = require('sharp');
const { ApiError } = require('../utils/ApiError');
const { logger } = require('../config/logger');
const { getEnv } = require('../config/env');
const { getImageKit } = require('../config/imagekit');

const PRESETS = {
  thumbnail: [{ width: 400, height: 400, crop: 'at_max', quality: 70, format: 'webp' }],
  full: [{ width: 1600, crop: 'at_max', quality: 80, format: 'auto' }],
  webp: [{ format: 'webp', quality: 'auto' }],
};

function safeFileName(originalName) {
  const match = String(originalName || '').toLowerCase().match(/\.(jpe?g|png|webp|mp4|webm|mov)$/);
  const extension = !match ? '.jpg' : (match[1] === 'jpeg' ? '.jpg' : `.${match[1]}`);
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${extension.replace(/^\./, '')}`;
}

function cleanFolder(folder) {
  const value = String(folder || '').trim();
  if (!/^\/[a-z0-9/_-]{1,80}$/i.test(value) || value.includes('..')) {
    throw new ApiError(400, 'BAD_FOLDER', 'That image folder is not allowed.');
  }
  return value;
}

function cleanTags(tags) {
  const list = Array.isArray(tags) ? tags : (tags ? [tags] : []);
  return list
    .map((tag) => String(tag).trim().toLowerCase())
    .filter((tag) => /^[a-z0-9_-]{1,40}$/.test(tag))
    .slice(0, 10);
}

async function assertRealImage(fileBuffer) {
  try {
    const meta = await sharp(fileBuffer, { failOn: 'error' }).metadata();
    if (!meta.format || !['jpeg', 'png', 'webp'].includes(meta.format)) {
      throw new Error('unsupported format');
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'BAD_IMAGE', 'Only JPEG, PNG, and WebP images are allowed.');
  }
}

function presentUpload(uploaded, kind) {
  const url = uploaded?.url || '';
  const fileId = uploaded?.fileId || '';
  const name = uploaded?.name || '';
  const thumbnailUrl = uploaded?.thumbnailUrl
    || (kind === 'video' ? url : (url ? getOptimizedUrl(url, 'thumbnail') : ''));
  return {
    url,
    fileId,
    name,
    thumbnailUrl,
    key: fileId ? `imagekit:${fileId}` : '',
  };
}

async function placeInFolder(imagekit, uploaded, destination) {
  const filePath = String(uploaded?.filePath || '');
  if (!filePath || filePath.startsWith(`${destination}/`)) return uploaded;
  const sourceFilePath = filePath.startsWith('/') ? filePath : `/${filePath}`;
  const name = sourceFilePath.slice(sourceFilePath.lastIndexOf('/') + 1);
  await imagekit.moveFile({
    sourceFilePath,
    destinationPath: `${destination}/`,
  });
  const nextPath = `${destination}/${name}`;
  return {
    ...uploaded,
    filePath: nextPath,
    url: String(uploaded.url || '').split('?')[0].replace(sourceFilePath, nextPath),
  };
}

async function uploadAsset(fileBuffer, fileName, folder, tags, kind = 'image') {
  const video = kind === 'video';
  const limit = video ? 80 * 1024 * 1024 : 10 * 1024 * 1024;
  if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
    throw new ApiError(400, 'BAD_IMAGE', video ? 'Choose a video to upload.' : 'Choose an image to upload.');
  }
  if (fileBuffer.length > limit) {
    throw new ApiError(413, 'IMAGE_TOO_LARGE', video ? 'That video is too large.' : 'That image is too large.');
  }
  if (video) {
    const extension = String(fileName || '').toLowerCase().match(/\.(mp4|webm|mov)$/);
    if (!extension) throw new ApiError(400, 'BAD_IMAGE', 'Use an MP4, WebM, or MOV video.');
  } else {
    await assertRealImage(fileBuffer);
  }
  const imagekit = getImageKit();
  const destination = cleanFolder(folder);
  try {
    const uploaded = await imagekit.upload({
      file: fileBuffer,
      fileName: safeFileName(fileName),
      folder: destination,
      tags: cleanTags(tags),
      useUniqueFileName: true,
    });
    const placed = await placeInFolder(imagekit, uploaded, destination);
    return presentUpload(placed, video ? 'video' : 'image');
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('imagekit upload failed', { message: error.message });
    throw new ApiError(502, 'MEDIA_UPLOAD_FAILED', 'The image service could not store that file.');
  }
}

async function uploadFile(fileBuffer, fileName, folder, tags) {
  return uploadAsset(fileBuffer, fileName, folder, tags, 'image');
}

async function deleteFile(fileId) {
  const id = String(fileId || '').replace(/^imagekit:/, '').trim();
  if (!id) return false;
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(id)) {
    throw new ApiError(400, 'BAD_FILE', 'That image id is not valid.');
  }
  const imagekit = getImageKit();
  try {
    await imagekit.deleteFile(id);
    return true;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('imagekit delete failed', { message: error.message });
    throw new ApiError(502, 'MEDIA_DELETE_FAILED', 'The image service could not delete that file.');
  }
}

function getOptimizedUrl(pathOrUrl, transformations) {
  const value = String(pathOrUrl || '').trim();
  if (!value) throw new ApiError(400, 'BAD_IMAGE', 'Choose an image to resize.');
  const transformation = Array.isArray(transformations)
    ? transformations
    : (PRESETS[transformations] || PRESETS.webp);
  const imagekit = getImageKit();
  const absolute = /^https?:\/\//i.test(value);
  return imagekit.url({
    ...(absolute ? { src: value } : { path: value.startsWith('/') ? value : `/${value}` }),
    transformation,
  });
}

function clientAuthentication() {
  const imagekit = getImageKit();
  const env = getEnv();
  const params = imagekit.getAuthenticationParameters();
  return {
    token: params.token,
    expire: params.expire,
    signature: params.signature,
    publicKey: env.IMAGEKIT_PUBLIC_KEY,
    urlEndpoint: String(env.IMAGEKIT_URL_ENDPOINT || '').trim().replace(/\/?$/, '/'),
  };
}

module.exports = {
  uploadFile,
  uploadAsset,
  deleteFile,
  getOptimizedUrl,
  clientAuthentication,
};
