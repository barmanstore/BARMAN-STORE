const { resolveProfileTarget, ensureProfileAccess } = require('./profile/authorization');
const { loadUserForRead, loadUserById, loadUserForProfileImage } = require('./profile/profileLoaders');
const { validateProfileUpdateInputs } = require('./profile/profileValidation');
const { applyProfileUpdate } = require('./profile/profileUpdateFlow');
const { uploadProfileImage } = require('./profile/profileImageUpload');

const registerUserProfileRoutes = (deps) => {
  const {
    app,
    requireAuth,
    userHasCapability,
    dbGetAsync,
    dbRunAsync,
    normalizeEmail,
    parsePhoneInput,
    normalizePhone,
    sendEmailVerificationChallenge,
    sendPhoneVerificationChallenge,
    sanitizeUser,
    queuePhoneChangeRequest,
    getRequestIp,
    serializePhoneChangeRequest,
    notifyPhoneChangeSubmitted,
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
  } = deps;

  app.get('/api/users/:id', requireAuth, async (req, res) => {
    try {
      const targetUserId = Number(req.params.id);
      if (!targetUserId) return res.status(400).json({ error: 'Invalid user id' });
      const { isAdmin, isSelf } = resolveProfileTarget({ req, targetUserId, userHasCapability });
      ensureProfileAccess({ isAdmin, isSelf });
      const user = sanitizeUser(await loadUserForRead({ dbGetAsync, userId: targetUserId }));
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json(user);
    } catch (error) {
      const status = Number(error?.status || 0) || 500;
      return res.status(status).json({ error: error?.message || 'Failed to load user profile' });
    }
  });

  app.put('/api/users/:id', requireAuth, async (req, res) => {
    try {
      const targetUserId = Number(req.params.id);
      if (!targetUserId) return res.status(400).json({ error: 'Invalid user id' });
      const { isAdmin, isSelf } = resolveProfileTarget({ req, targetUserId, userHasCapability });
      ensureProfileAccess({ isAdmin, isSelf });

      const current = await loadUserById({ dbGetAsync, userId: targetUserId });
      const payload = await validateProfileUpdateInputs({
        current,
        input: req.body,
        normalizeEmail,
        normalizePhone,
        parsePhoneInput,
        dbGetAsync,
        isAdmin,
        isSelf,
        targetUserId,
      });
      payload.isAdmin = isAdmin;
      payload.isSelf = isSelf;

      const { updated, phoneChangeRequest } = await applyProfileUpdate({
        dbRunAsync,
        dbGetAsync,
        normalizeEmail,
        normalizePhone,
        parsePhoneInput,
        sendEmailVerificationChallenge,
        sendPhoneVerificationChallenge,
        queuePhoneChangeRequest,
        getRequestIp,
        serializePhoneChangeRequest,
        notifyPhoneChangeSubmitted,
        sanitizeUser,
        req,
        targetUserId,
        payload,
      });

      if (!phoneChangeRequest) return res.json(updated);
      return res.json({
        ...updated,
        phone_change_request: phoneChangeRequest,
        message: 'Phone update is pending. You will be notified once it is updated.',
      });
    } catch (error) {
      if (error?.status === 400) return res.status(400).json({ error: error.message });
      if (error?.status === 403) return res.status(403).json({ error: error.message });
      if (error?.status === 404) return res.status(404).json({ error: error.message });
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/users/:id/profile-image', requireAuth, async (req, res) => {
    try {
      const targetUserId = Number(req.params.id);
      if (!targetUserId) return res.status(400).json({ error: 'Invalid user id' });
      const { isAdmin, isSelf } = resolveProfileTarget({ req, targetUserId, userHasCapability });
      ensureProfileAccess({ isAdmin, isSelf });

      const result = await uploadProfileImage({
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
      });
      return res.json({ success: true, profile_image: result.profile_image, user: result.user });
    } catch (error) {
      if (error?.status === 400) return res.status(400).json({ error: error.message });
      if (error?.status === 403) return res.status(403).json({ error: error.message });
      if (error?.status === 404) return res.status(404).json({ error: error.message });
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerUserProfileRoutes };
