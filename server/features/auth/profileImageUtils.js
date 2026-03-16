const path = require('path');

const PROFILE_IMAGE_ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const mimeToExt = (mimeType) => {
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  return '';
};

const parseDataUrlImage = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^data:([a-zA-Z0-9+./-]+);base64,(.+)$/);
  if (!match) return null;
  const mimeType = String(match[1] || '').toLowerCase();
  const base64 = String(match[2] || '');
  if (!mimeType || !base64) return null;
  return { mimeType, base64 };
};

const buildProfileImagePath = (fileName) => `/uploads/profiles/${path.basename(String(fileName || ''))}`;

const createProfileImageUtils = ({
  fs,
  path,
  profileUploadDir,
} = {}) => {
  const deleteManagedProfileImage = (profileImage) => {
    const rel = String(profileImage || '').trim();
    if (!rel.startsWith('/uploads/profiles/')) return;
    const fileName = path.basename(rel);
    const filePath = path.join(profileUploadDir, fileName);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (_) {
        // ignore file delete errors
      }
    }
  };

  return {
    mimeToExt,
    PROFILE_IMAGE_ALLOWED_MIME,
    parseDataUrlImage,
    buildProfileImagePath,
    deleteManagedProfileImage,
  };
};

module.exports = {
  mimeToExt,
  PROFILE_IMAGE_ALLOWED_MIME,
  parseDataUrlImage,
  buildProfileImagePath,
  createProfileImageUtils,
};
