const multer = require('multer');
const { ApiError } = require('../utils/ApiError');
const { getEnv } = require('../config/env');
const { reencodePortrait, reencodeProduct } = require('../utils/image');

const uploadLimits = {
  portraitMax: null,
  productMax: null,
};

function memoryUpload(field, maxCount = 1) {
  const uploader = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 9 * 1024 * 1024, files: maxCount },
  });
  return maxCount > 1 ? uploader.array(field, maxCount) : uploader.single(field);
}

function assertSize(file, max) {
  if (file.size > max || file.buffer.length > max) {
    throw new ApiError(413, 'IMAGE_TOO_LARGE', 'That image is too large.');
  }
}

async function preparePortrait(req, _res, next) {
  try {
    if (!req.file) throw new ApiError(400, 'BAD_IMAGE', 'Choose a photo to upload.');
    const max = uploadLimits.portraitMax || getEnv().PORTRAIT_MAX_BYTES;
    assertSize(req.file, max);
    req.preparedImage = await reencodePortrait(req.file.buffer);
    return next();
  } catch (error) {
    return next(error);
  }
}

async function prepareProducts(req, _res, next) {
  try {
    const files = req.files || [];
    if (!files.length) throw new ApiError(400, 'BAD_IMAGE', 'Choose at least one image.');
    const max = uploadLimits.productMax || getEnv().PRODUCT_MAX_BYTES;
    req.preparedImages = [];
    for (const file of files) {
      assertSize(file, max);
      req.preparedImages.push(await reencodeProduct(file.buffer));
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

const IMAGE_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp']);

function imageFileFilter(_req, file, cb) {
  const mime = String(file.mimetype || '').toLowerCase();
  const extension = String(file.originalname || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
  const extensionOk = !extension || IMAGE_EXT.has(extension);
  if (!IMAGE_MIME.has(mime) || !extensionOk) {
    cb(new ApiError(400, 'BAD_IMAGE', 'Only JPEG, PNG, and WebP images are allowed.'));
    return;
  }
  cb(null, true);
}

function imageKitUpload(field, maxCount) {
  const uploader = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: maxCount },
    fileFilter: imageFileFilter,
  });
  return maxCount > 1 ? uploader.array(field, maxCount) : uploader.single(field);
}

function releaseUploadBuffers(req) {
  const files = [];
  if (req?.file) files.push(req.file);
  if (Array.isArray(req?.files)) files.push(...req.files);
  for (const file of files) file.buffer = null;
}

const VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov']);

function videoFileFilter(_req, file, cb) {
  const mime = String(file.mimetype || '').toLowerCase();
  const extension = String(file.originalname || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
  if (!VIDEO_MIME.has(mime) || !VIDEO_EXT.has(extension)) {
    cb(new ApiError(400, 'BAD_IMAGE', 'Use an MP4, WebM, or MOV video.'));
    return;
  }
  cb(null, true);
}

const uploadHeroVideo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024, files: 1 },
  fileFilter: videoFileFilter,
}).single('video');

const uploadSareeImages = imageKitUpload('images', 5);
const uploadAvatarImage = imageKitUpload('avatar', 1);
const uploadLibraryImage = imageKitUpload('image', 1);

module.exports = {
  memoryUpload,
  preparePortrait,
  prepareProducts,
  uploadLimits,
  uploadSareeImages,
  uploadAvatarImage,
  uploadLibraryImage,
  uploadHeroVideo,
  releaseUploadBuffers,
};
