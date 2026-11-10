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

module.exports = { memoryUpload, preparePortrait, prepareProducts, uploadLimits };
