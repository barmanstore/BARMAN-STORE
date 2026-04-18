const uploadProfileImage = async ({
  req,
  targetUserId,
  dbGetAsync,
  dbRunAsync,
  sanitizeUser,
  parseDataUrlImage,
  PROFILE_IMAGE_ALLOWED_MIME,
  PROFILE_IMAGE_MAX_BYTES,
  mimeToExt,
  buildProfileImagePath,
  deleteManagedProfileImage,
  profileImageStorage,
  PROFILE_UPLOAD_DIR,
  crypto,
  path,
  fs,
} = {}) => {
  const user = await dbGetAsync('SELECT id, profile_image FROM users WHERE id = ?', [targetUserId]);
  if (!user) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  const parsed = parseDataUrlImage(req.body?.image_base64);
  if (!parsed) {
    const error = new Error('Valid image_base64 data URL is required');
    error.status = 400;
    throw error;
  }
  if (!PROFILE_IMAGE_ALLOWED_MIME.has(parsed.mimeType)) {
    const error = new Error('Allowed image types: jpeg, png, webp');
    error.status = 400;
    throw error;
  }

  const imageBuffer = Buffer.from(parsed.base64, 'base64');
  if (!imageBuffer || !imageBuffer.length) {
    const error = new Error('Invalid image payload');
    error.status = 400;
    throw error;
  }
  if (imageBuffer.length > PROFILE_IMAGE_MAX_BYTES) {
    const error = new Error('Image exceeds 2MB limit');
    error.status = 400;
    throw error;
  }

  const fileExt = mimeToExt(parsed.mimeType);
  const fileName = `user_${targetUserId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${fileExt}`;
  let nextPath = buildProfileImagePath(fileName);
  if (profileImageStorage?.uploadProfileImage) {
    const stored = await profileImageStorage.uploadProfileImage({
      fileName,
      buffer: imageBuffer,
      contentType: parsed.mimeType,
    });
    nextPath = stored?.url || nextPath;
  } else {
    const absPath = path.join(PROFILE_UPLOAD_DIR, fileName);
    fs.writeFileSync(absPath, imageBuffer);
  }

  await dbRunAsync('UPDATE users SET profile_image = ? WHERE id = ?', [nextPath, targetUserId]);
  if (user.profile_image && user.profile_image !== nextPath) {
    if (profileImageStorage?.deleteProfileImage) {
      await profileImageStorage.deleteProfileImage({ profileImage: user.profile_image });
    } else {
      deleteManagedProfileImage(user.profile_image);
    }
  }

  const updated = sanitizeUser(
    await dbGetAsync('SELECT * FROM users WHERE id = ?', [targetUserId])
  );
  return { profile_image: nextPath, user: updated };
};

module.exports = { uploadProfileImage };
