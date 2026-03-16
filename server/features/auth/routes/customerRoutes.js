const registerCustomerRoutes = (deps) => {
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

  app.get('/api/customers', requireAdmin, async (_, res) => {
    try {
      const customers = await dbAllAsync(`SELECT id, name, email, phone, address, profile_image, created_at FROM users WHERE role = 'customer' ORDER BY name ASC`);
      return res.json(customers);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.get('/api/customers/search', requireAdmin, async (req, res) => {
    try {
      const q = String(req.query.q || req.query.name || '').trim();
      const limit = Number(req.query.limit || 20);
      if (!q) {
        const rows = await dbAllAsync(`SELECT id, name, email, phone, address, profile_image, created_at FROM users WHERE role='customer' ORDER BY name LIMIT ?`, [limit]);
        return res.json(rows);
      }
      const like = `%${q}%`;
      const rows = await dbAllAsync(
        `SELECT id, name, email, phone, address, profile_image, created_at
         FROM users
         WHERE role='customer' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)
         ORDER BY name LIMIT ?`,
        [like, like, like, limit]
      );
      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.get('/api/customers/:id/profile', requireAuth, async (req, res) => {
    try {
      const targetUserId = Number(req.params.id);
      if (!targetUserId) return res.status(400).json({ error: 'Invalid customer id' });
      if (req.authUser.role !== 'admin' && Number(req.authUser.id) !== targetUserId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const user = await dbGetAsync(`SELECT id, name, email, email_verified, phone, phone_verified, address, profile_image, role FROM users WHERE id = ?`, [req.params.id]);
      if (!user) return res.status(404).json({ error: 'Customer not found' });
      let address = {};
      if (user.address) {
        try {
          address = JSON.parse(user.address);
        } catch (_) {
          address = { street: user.address };
        }
      }
      return res.json({
        ...user,
        address,
        profileComplete: validateCustomerProfile(user, address),
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
};

module.exports = { registerCustomerRoutes };
