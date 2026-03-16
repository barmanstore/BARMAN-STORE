const createAuthMiddleware = (deps) => {
  const {
    parsePhoneInput,
    normalizeEmail,
    dbGetAsync,
    dbRunAsync,
    hashPassword,
    generateTemporaryPassword,
    getBearerTokenFromRequest,
    verifyToken,
    sanitizeUser,
    supabaseAuthProvider,
    PHONE_CHANGE_CRON_SECRET,
    PHONE_CHANGE_CRON_ENABLED,
  } = deps;

  const isSupabaseEmailAuthUsable = () => (
    supabaseAuthProvider.shouldUseClientAuth()
    || supabaseAuthProvider.shouldUseAccessTokenDecodeFallback()
  );
  const isSupabaseAuthStrictMode = () => supabaseAuthProvider.isStrictMode();
  const isSupabaseEmailVerified = (user = null) => Boolean(user?.email_confirmed_at || user?.confirmed_at);
  const toSupabaseSessionPayload = (session = null) => {
    if (!session || typeof session !== 'object') return null;
    const accessToken = String(session.access_token || '').trim();
    if (!accessToken) return null;
    return {
      access_token: accessToken,
      refresh_token: String(session.refresh_token || '').trim() || null,
      token_type: String(session.token_type || '').trim() || 'bearer',
      expires_in: Number(session.expires_in || 0) || null,
    };
  };
  const getSupabaseUserMetadata = (user = null) => {
    const meta = user?.user_metadata;
    return meta && typeof meta === 'object' ? meta : {};
  };

  const getVerifiedPhoneFromMetadata = (metadata = {}) => {
    const candidate = metadata.phone || metadata.phone_number || null;
    const parsed = parsePhoneInput(candidate);
    return parsed.error ? null : parsed.value;
  };

  const syncLocalUserFromSupabaseAuth = async ({
    email,
    metadata = {},
    emailVerified = false,
    fallbackPassword = '',
  }) => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return null;

    let user = await dbGetAsync(`SELECT * FROM users WHERE email = ?`, [normalizedEmail]);
    const metadataName = String(metadata.full_name || metadata.name || '').trim();
    const metadataAddress = String(metadata.address || '').trim();
    const metadataPhone = getVerifiedPhoneFromMetadata(metadata);

    if (!user) {
      let phoneToInsert = metadataPhone;
      if (phoneToInsert) {
        const existingPhone = await dbGetAsync(`SELECT id FROM users WHERE phone = ? LIMIT 1`, [phoneToInsert]);
        if (existingPhone) phoneToInsert = null;
      }
      const result = await dbRunAsync(
        `INSERT INTO users (role, name, email, email_verified, phone, phone_verified, address, password_hash, must_change_password)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'customer',
          metadataName || normalizedEmail.split('@')[0] || 'Customer',
          normalizedEmail,
          emailVerified ? 1 : 0,
          phoneToInsert,
          0,
          metadataAddress || null,
          hashPassword(fallbackPassword || generateTemporaryPassword()),
          0,
        ]
      );
      user = await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [result.lastInsertRowid]);
      return user || null;
    }

    const nextEmailVerified = emailVerified || Number(user.email_verified || 0) === 1 ? 1 : 0;
    let nextPhone = user.phone || null;
    if (!nextPhone && metadataPhone) {
      const conflict = await dbGetAsync(`SELECT id FROM users WHERE phone = ? AND id <> ? LIMIT 1`, [metadataPhone, user.id]);
      if (!conflict) nextPhone = metadataPhone;
    }
    const nextName = String(user.name || '').trim() || metadataName || 'Customer';
    const nextAddress = user.address || metadataAddress || null;

    if (
      nextName !== String(user.name || '')
      || Number(user.email_verified || 0) !== nextEmailVerified
      || String(user.phone || '') !== String(nextPhone || '')
      || String(user.address || '') !== String(nextAddress || '')
    ) {
      await dbRunAsync(
        `UPDATE users
         SET name = ?, email_verified = ?, phone = ?, address = ?
         WHERE id = ?`,
        [nextName, nextEmailVerified, nextPhone, nextAddress, user.id]
      );
      user = await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [user.id]);
    }

    return user || null;
  };

  const syncLocalEmailVerifiedFromSupabase = async (email) => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return;
    await dbRunAsync(`UPDATE users SET email_verified = 1 WHERE email = ?`, [normalizedEmail]);
  };

  const getAuthUserFromRequest = async (req) => {
    const token = getBearerTokenFromRequest(req);
    if (!token) return null;
    const payload = verifyToken(token);
    if (payload) {
      const user = sanitizeUser(await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [payload.uid]));
      return user || null;
    }

    if (!isSupabaseEmailAuthUsable()) return null;
    if (!supabaseAuthProvider.shouldUseClientAuth() && supabaseAuthProvider.shouldUseAccessTokenDecodeFallback()) {
      const decoded = supabaseAuthProvider.decodeAccessTokenUnsafe({ accessToken: token });
      const normalizedEmail = normalizeEmail(decoded?.email);
      if (!normalizedEmail) return null;
      const synced = await syncLocalUserFromSupabaseAuth({
        email: normalizedEmail,
        metadata: decoded?.metadata || {},
        emailVerified: true,
      });
      return sanitizeUser(synced) || null;
    }
    try {
      const supabaseUser = await supabaseAuthProvider.getUser({ accessToken: token });
      const normalizedEmail = normalizeEmail(supabaseUser?.email);
      if (!normalizedEmail) return null;
      const synced = await syncLocalUserFromSupabaseAuth({
        email: normalizedEmail,
        metadata: getSupabaseUserMetadata(supabaseUser),
        emailVerified: isSupabaseEmailVerified(supabaseUser),
      });
      return sanitizeUser(synced);
    } catch (_) {
      return null;
    }
  };

  const requireAuth = async (req, res, next) => {
    try {
      const user = await getAuthUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      req.authUser = user;
      return next();
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Authentication failed' });
    }
  };

  const requireAdmin = async (req, res, next) => {
    try {
      const user = await getAuthUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
      req.authUser = user;
      return next();
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Admin authentication failed' });
    }
  };

  const requireCronSecret = (req, res, next) => {
    if (!PHONE_CHANGE_CRON_SECRET) {
      return res.status(503).json({ error: 'Cron secret is not configured' });
    }
    const headerSecret = String(req.headers['x-cron-secret'] || '').trim();
    const authHeader = String(req.headers.authorization || '').trim();
    const bearerSecret = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    const provided = headerSecret || bearerSecret;
    if (!provided || provided !== PHONE_CHANGE_CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized cron request' });
    }
    return next();
  };
  const requireInternalCron = (req, res, next) => {
    if (!PHONE_CHANGE_CRON_ENABLED) {
      return res.status(503).json({ error: 'Phone change cron processing is disabled' });
    }
    return requireCronSecret(req, res, next);
  };

  return {
    isSupabaseEmailAuthUsable,
    isSupabaseAuthStrictMode,
    isSupabaseEmailVerified,
    toSupabaseSessionPayload,
    getSupabaseUserMetadata,
    getVerifiedPhoneFromMetadata,
    syncLocalUserFromSupabaseAuth,
    syncLocalEmailVerifiedFromSupabase,
    getAuthUserFromRequest,
    requireAuth,
    requireAdmin,
    requireCronSecret,
    requireInternalCron,
  };
};

module.exports = { createAuthMiddleware };
