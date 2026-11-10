const sharp = require('sharp');
const { ApiError } = require('./ApiError');
const { sha256Buffer } = require('./tokens');

function detectImage(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

async function reencodePortrait(buffer, { minWidth = 256, minHeight = 256 } = {}) {
  const mime = detectImage(buffer);
  if (!mime || mime === 'image/webp') {
    throw new ApiError(400, 'BAD_IMAGE', 'Upload a JPEG or PNG photo.');
  }
  let pipeline;
  try {
    pipeline = sharp(buffer, { failOn: 'error' }).rotate();
    const meta = await pipeline.metadata();
    if ((meta.width || 0) < minWidth || (meta.height || 0) < minHeight) {
      throw new ApiError(400, 'IMAGE_TOO_SMALL', 'Use a clearer photo at least 256 by 256 pixels.');
    }
    const output = await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    return { buffer: output, mime: 'image/jpeg', hash: sha256Buffer(output) };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'BAD_IMAGE', 'That file is not a usable photo.');
  }
}

async function reencodeProduct(buffer) {
  const mime = detectImage(buffer);
  if (!mime) throw new ApiError(400, 'BAD_IMAGE', 'Upload a JPEG, PNG, or WebP image.');
  try {
    const pipeline = sharp(buffer, { failOn: 'error' }).rotate();
    const output = mime === 'image/webp'
      ? await pipeline.webp({ quality: 85 }).toBuffer()
      : await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    return {
      buffer: output,
      mime: mime === 'image/webp' ? 'image/webp' : 'image/jpeg',
      extension: mime === 'image/webp' ? 'webp' : 'jpg',
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'BAD_IMAGE', 'That file is not a usable image.');
  }
}

module.exports = { detectImage, reencodePortrait, reencodeProduct };
