const createCreditEntryImageStorage = ({
  parseDataUrlImage,
  PROFILE_IMAGE_ALLOWED_MIME,
  PROFILE_IMAGE_MAX_BYTES,
  mimeToExt,
  profileImageStorage,
  deleteManagedProfileImage,
  crypto,
} = {}) => {
  const removeCreditEntryImage = async (imagePath) => {
    const current = String(imagePath || '').trim();
    if (!current) return;
    if (profileImageStorage?.deleteProfileImage) {
      await profileImageStorage.deleteProfileImage({ profileImage: current });
      return;
    }
    if (typeof deleteManagedProfileImage === 'function') {
      deleteManagedProfileImage(current);
    }
  };

  const storeCreditEntryImage = async ({
    imageBase64,
    existingImagePath = '',
    userId = null,
    entryId = null,
  } = {}) => {
    const raw = String(imageBase64 || '').trim();
    if (!raw) return String(existingImagePath || '').trim() || null;

    const parsed = parseDataUrlImage?.(raw);
    if (!parsed) {
      const error = new Error('Valid attachment image is required');
      error.status = 400;
      throw error;
    }
    if (!PROFILE_IMAGE_ALLOWED_MIME?.has(parsed.mimeType)) {
      const error = new Error('Allowed attachment types: jpeg, png, webp');
      error.status = 400;
      throw error;
    }

    const imageBuffer = Buffer.from(parsed.base64, 'base64');
    if (!imageBuffer?.length) {
      const error = new Error('Invalid attachment payload');
      error.status = 400;
      throw error;
    }
    if (imageBuffer.length > Number(PROFILE_IMAGE_MAX_BYTES || 0)) {
      const error = new Error('Attachment exceeds 2MB limit');
      error.status = 400;
      throw error;
    }

    const fileExt = mimeToExt?.(parsed.mimeType) || '.bin';
    const fileName = `credit_${Number(userId || 0) || 'user'}_${Number(entryId || 0) || 'entry'}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${fileExt}`;
    const stored = await profileImageStorage?.uploadProfileImage?.({
      fileName,
      buffer: imageBuffer,
      contentType: parsed.mimeType,
    });
    const nextImagePath = String(stored?.url || '').trim();
    if (!nextImagePath) {
      const error = new Error('Attachment storage is not available');
      error.status = 500;
      throw error;
    }

    const previous = String(existingImagePath || '').trim();
    if (previous && previous !== nextImagePath) {
      try {
        await removeCreditEntryImage(previous);
      } catch (_) {
        // Keep the entry flow resilient if old cleanup fails.
      }
    }

    return nextImagePath;
  };

  return {
    storeCreditEntryImage,
    removeCreditEntryImage,
  };
};

module.exports = { createCreditEntryImageStorage };
