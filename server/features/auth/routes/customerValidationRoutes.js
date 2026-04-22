const registerCustomerValidationRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    requireAuth,
    dbGetAsync,
    dbRunAsync,
    dbAllAsync,
    normalizeEmail,
    parsePhoneInput,
    normalizePhone,
    parseBooleanEnv,
    runCustomerRequestPurge,
    processPendingPhoneChangeRequests,
    getPhoneMergeImpactSummary,
    serializePhoneChangeRequest,
    PHONE_CHANGE_STATUS_PENDING,
    PHONE_CHANGE_STATUS_APPROVED,
    PHONE_CHANGE_STATUS_REJECTED,
    normalizePhoneChangeRequestStatus,
    approvePhoneChangeRequest,
    PHONE_CHANGE_DECISION_ADMIN,
    notifyPhoneChangeApproved,
    notifyPhoneChangeSubmitted,
    logAdminAuditAsync,
    rejectPhoneChangeRequest,
    notifyPhoneChangeRejected,
    normalizeContactVerificationRequestType,
    completeContactVerificationRequests,
    sendEmailVerificationChallenge,
    markContactVerificationRequestSent,
    sendPhoneVerificationChallenge,
    rejectContactVerificationRequest,
    createNotificationEvent,
    sanitizeUser,
    generateTemporaryPassword,
    hashPassword,
    queuePhoneChangeRequest,
    getRequestIp,
    parseDataUrlImage,
    PROFILE_IMAGE_ALLOWED_MIME,
    PROFILE_IMAGE_MAX_BYTES,
    mimeToExt,
    buildProfileImagePath,
    deleteManagedProfileImage,
    PROFILE_UPLOAD_DIR,
    crypto,
    path,
    fs,
    validateCustomerProfile,
  } = deps;

  app.post('/api/orders/validate-customer', requireAuth, async (req, res) => {
    try {
      const userId = Number(req.body?.user_id || 0);
      if (!userId)
        return res
          .status(400)
          .json({ error: 'MISSING_CUSTOMER', message: 'Customer ID is required' });
      if (req.authUser.role !== 'admin' && Number(req.authUser.id) !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const user = await dbGetAsync(
        `SELECT id, name, email, email_verified, phone, phone_verified, address, role FROM users WHERE id = ?`,
        [userId]
      );
      if (!user)
        return res.status(404).json({ error: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
      let address = {};
      if (user.address) {
        try {
          address = JSON.parse(user.address);
        } catch (_) {
          address = { street: user.address };
        }
      }
      const validation = validateCustomerProfile(user, address);
      return res.json({
        valid: validation.complete,
        isAdmin: user.role === 'admin',
        profile: {
          id: user.id,
          name: user.name,
          email: user.email,
          email_verified: Number(user.email_verified || 0) === 1,
          phone: user.phone,
          phone_verified: Number(user.phone_verified || 0) === 1,
          address,
        },
        validation,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerCustomerValidationRoutes };
