const { ApiError, sendOk } = require('../utils/ApiError');
const { asyncHandler } = require('../utils/asyncHandler');
const { logger } = require('../config/logger');
const { publicUser } = require('../services/auth.service');
const { releaseUploadBuffers } = require('../middleware/upload');
const media = require('../services/media.service');

const uploadSareeImages = asyncHandler(async (req, res) => {
  const files = req.files || [];
  if (!files.length) throw new ApiError(400, 'BAD_IMAGE', 'Choose at least one image.');
  const stored = [];
  try {
    for (const file of files) {
      const saved = await media.uploadFile(file.buffer, file.originalname, '/sarees', ['saree']);
      file.buffer = null;
      stored.push(saved);
    }
    return sendOk(res, { images: stored }, { status: 201 });
  } catch (error) {
    await Promise.all(stored.map((item) => media.deleteFile(item.fileId).catch(() => null)));
    throw error;
  } finally {
    releaseUploadBuffers(req);
  }
});

const LIBRARY_FOLDERS = {
  sarees: '/sarees',
  hero: '/hero',
  categories: '/categories',
  avatars: '/avatars',
  'try-on': '/try-on',
  brand: '/brand',
};

const uploadLibraryImage = asyncHandler(async (req, res) => {
  const folder = LIBRARY_FOLDERS[String(req.query.folder || '')];
  if (!folder) throw new ApiError(400, 'BAD_FOLDER', 'Choose a saree, hero, category, avatar, try-on, or brand image.');
  if (!req.file) throw new ApiError(400, 'BAD_IMAGE', 'Choose an image to upload.');
  try {
    const stored = await media.uploadFile(req.file.buffer, req.file.originalname, folder, [String(req.query.folder)]);
    req.file.buffer = null;
    return sendOk(res, stored, { status: 201 });
  } finally {
    releaseUploadBuffers(req);
  }
});

const uploadHeroVideo = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'BAD_IMAGE', 'Choose a video to upload.');
  try {
    const stored = await media.uploadAsset(
      req.file.buffer,
      req.file.originalname,
      '/hero',
      ['hero', 'video'],
      'video',
    );
    req.file.buffer = null;
    return sendOk(res, stored, { status: 201 });
  } finally {
    releaseUploadBuffers(req);
  }
});

const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'BAD_IMAGE', 'Choose a photo to upload.');
  const previousId = req.user.avatarFileId || '';
  let stored = null;
  try {
    stored = await media.uploadFile(req.file.buffer, req.file.originalname, '/avatars', ['avatar']);
    req.file.buffer = null;
    req.user.avatarUrl = stored.url;
    req.user.avatarFileId = stored.fileId;
    await req.user.save();
  } catch (error) {
    if (stored?.fileId) await media.deleteFile(stored.fileId).catch(() => null);
    throw error;
  } finally {
    releaseUploadBuffers(req);
  }
  if (previousId && previousId !== stored.fileId) {
    await media.deleteFile(previousId).catch((error) => {
      logger.warn('old avatar delete skipped', { message: error.message });
    });
  }
  return sendOk(res, {
    url: stored.url,
    fileId: stored.fileId,
    name: stored.name,
    thumbnailUrl: stored.thumbnailUrl,
    avatarUrl: stored.url,
    user: publicUser(req.user),
  }, { status: 201 });
});

const authenticationParameters = asyncHandler(async (_req, res) => {
  sendOk(res, media.clientAuthentication());
});

module.exports = {
  uploadSareeImages,
  uploadLibraryImage,
  uploadHeroVideo,
  uploadAvatar,
  authenticationParameters,
};
