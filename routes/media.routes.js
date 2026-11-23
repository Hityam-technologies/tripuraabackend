const { Router } = require('express');
const { authUser } = require('../middleware/authUser');
const { requireAdmin } = require('../middleware/requireAdmin');
const { requireUserOrAdmin } = require('../middleware/requireUserOrAdmin');
const { mediaUploadLimiter } = require('../middleware/rateLimit');
const { uploadSareeImages, uploadAvatarImage, uploadLibraryImage, uploadHeroVideo } = require('../middleware/upload');
const media = require('../controllers/media.controller');

const router = Router();

router.post('/upload/saree', requireAdmin, mediaUploadLimiter, uploadSareeImages, media.uploadSareeImages);
router.post('/upload/image', requireAdmin, mediaUploadLimiter, uploadLibraryImage, media.uploadLibraryImage);
router.post('/upload/hero-video', requireAdmin, mediaUploadLimiter, uploadHeroVideo, media.uploadHeroVideo);
router.post('/upload/avatar', authUser, mediaUploadLimiter, uploadAvatarImage, media.uploadAvatar);
router.get('/auth', requireUserOrAdmin, media.authenticationParameters);

module.exports = router;
