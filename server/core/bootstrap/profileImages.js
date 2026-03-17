const createProfileImageSupport = ({
  env,
  fs,
  path,
  createProfileImageUtils,
  createProfileImageStorage,
  profileUploadDir,
} = {}) => {
  const PROFILE_IMAGE_MAX_BYTES = Math.max(
    32 * 1024,
    Number(env.PROFILE_IMAGE_MAX_BYTES || 2 * 1024 * 1024)
  );

  const {
    mimeToExt,
    PROFILE_IMAGE_ALLOWED_MIME,
    parseDataUrlImage,
    buildProfileImagePath,
    deleteManagedProfileImage,
  } = createProfileImageUtils({
    fs,
    path,
    profileUploadDir,
  });

  const profileImageStorage = createProfileImageStorage({
    provider: env.PROFILE_IMAGE_STORAGE,
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: env.SUPABASE_STORAGE_BUCKET || env.PROFILE_IMAGE_BUCKET,
    profileUploadDir,
    fs,
    path,
    fetch,
  });

  const profileImagePublicBaseUrl = (() => {
    const base = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const bucket = String(env.SUPABASE_STORAGE_BUCKET || env.PROFILE_IMAGE_BUCKET || '').trim();
    if (!base || !bucket) return '';
    return `${base}/storage/v1/object/public/${bucket}`;
  })();

  return {
    PROFILE_IMAGE_MAX_BYTES,
    mimeToExt,
    PROFILE_IMAGE_ALLOWED_MIME,
    parseDataUrlImage,
    buildProfileImagePath,
    deleteManagedProfileImage,
    profileImageStorage,
    profileImagePublicBaseUrl,
  };
};

module.exports = { createProfileImageSupport };
