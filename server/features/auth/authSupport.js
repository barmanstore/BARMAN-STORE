const createAuthSupport = ({
  bcrypt,
  crypto,
  saltRounds = 10,
  authTokenSecret = '',
  tokenTtlMs = 7 * 24 * 60 * 60 * 1000,
} = {}) => {
  const sha256 = (password) => crypto.createHash('sha256').update(String(password || '')).digest('hex');

  const isSha256Hex = (value) => /^[a-f0-9]{64}$/i.test(String(value || ''));

  const hashPassword = (password) => bcrypt.hashSync(String(password || ''), saltRounds);

  const verifyPassword = (plain, user) => {
    if (!user) return false;
    const storedHash = user.password_hash;
    const legacy = user.password;

    if (storedHash) {
      if (isSha256Hex(storedHash)) {
        return sha256(plain) === String(storedHash).toLowerCase();
      }
      try {
        return bcrypt.compareSync(String(plain || ''), storedHash);
      } catch (_) {
        return false;
      }
    }

    if (legacy) {
      if (isSha256Hex(legacy)) {
        return sha256(plain) === String(legacy).toLowerCase();
      }
      return String(plain || '') === String(legacy);
    }

    return false;
  };

  const PHONE_POLICY_MESSAGE = 'Phone number must be 10 digits (India format, optional +91 prefix).';
  const parsePhoneInput = (phone, { required = false } = {}) => {
    const raw = String(phone ?? '').trim();
    if (!raw) {
      return required
        ? { value: null, error: 'Phone number is required' }
        : { value: null, error: null };
    }

    let digits = raw.replace(/\D/g, '');
    if (!digits) {
      return { value: null, error: PHONE_POLICY_MESSAGE };
    }

    if (digits.startsWith('00')) {
      digits = digits.slice(2);
    }

    if (digits.length === 12 && digits.startsWith('91')) {
      digits = digits.slice(2);
    } else if (digits.length === 11 && digits.startsWith('0')) {
      digits = digits.slice(1);
    }

    if (digits.length !== 10) {
      return { value: null, error: PHONE_POLICY_MESSAGE };
    }

    return { value: digits, error: null };
  };
  const normalizePhone = (phone) => parsePhoneInput(phone).value;
  const normalizeEmail = (email) => {
    const v = String(email || '').trim().toLowerCase();
    return v || null;
  };
  const isStrongPassword = (password) => {
    const value = String(password || '');
    if (value.length < 10) return false;
    if (!/[a-z]/.test(value)) return false;
    if (!/[A-Z]/.test(value)) return false;
    if (!/[0-9]/.test(value)) return false;
    if (!/[^A-Za-z0-9]/.test(value)) return false;
    return true;
  };
  const generateTemporaryPassword = (length = 14) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    let candidate = '';
    while (!isStrongPassword(candidate)) {
      candidate = '';
      for (let i = 0; i < length; i += 1) {
        candidate += chars[Math.floor(Math.random() * chars.length)];
      }
    }
    return candidate;
  };
  const generateOtpCode = (length = 6) => {
    const digits = '0123456789';
    let code = '';
    for (let i = 0; i < length; i += 1) {
      code += digits[Math.floor(Math.random() * digits.length)];
    }
    return code;
  };
  const generatePhoneVerificationCode = (length = 6) => {
    const digits = '0123456789';
    let code = '';
    for (let i = 0; i < length; i += 1) {
      code += digits[Math.floor(Math.random() * digits.length)];
    }
    return code;
  };
  const hashOpaqueToken = (value) =>
    crypto.createHash('sha256').update(String(value || '')).digest('hex');
  const generateEmailVerificationToken = () => crypto.randomBytes(24).toString('hex');
  const hashVerificationToken = (token) =>
    crypto.createHash('sha256').update(String(token || '')).digest('hex');

  const base64UrlEncode = (value) => Buffer.from(value).toString('base64url');
  const base64UrlDecode = (value) => Buffer.from(value, 'base64url').toString('utf8');
  const signTokenPayload = (payloadEncoded) =>
    crypto.createHmac('sha256', authTokenSecret).update(payloadEncoded).digest('base64url');

  const generateToken = (user = {}) => {
    const now = Date.now();
    const payload = {
      uid: Number(user.id || 0),
      role: String(user.role || 'customer'),
      iat: now,
      exp: now + tokenTtlMs,
    };
    const encoded = base64UrlEncode(JSON.stringify(payload));
    const signature = signTokenPayload(encoded);
    return `${encoded}.${signature}`;
  };

  const verifyToken = (token) => {
    if (!token || typeof token !== 'string') return null;
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return null;
    const expected = signTokenPayload(encoded);
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return null;
    }
    try {
      const payload = JSON.parse(base64UrlDecode(encoded));
      if (!payload || !Number(payload.uid)) return null;
      const now = Date.now();
      if (payload.exp) {
        if (now > Number(payload.exp)) return null;
      } else if (payload.iat) {
        if ((now - Number(payload.iat)) > tokenTtlMs) return null;
      } else {
        return null;
      }
      return payload;
    } catch (_) {
      return null;
    }
  };

  const getBearerTokenFromRequest = (req) => {
    const header = String(req?.headers?.authorization || '');
    if (!header.toLowerCase().startsWith('bearer ')) return '';
    return header.slice(7).trim();
  };

  return {
    PHONE_POLICY_MESSAGE,
    parsePhoneInput,
    normalizePhone,
    normalizeEmail,
    isStrongPassword,
    generateTemporaryPassword,
    generateOtpCode,
    generatePhoneVerificationCode,
    hashOpaqueToken,
    generateEmailVerificationToken,
    hashVerificationToken,
    hashPassword,
    verifyPassword,
    generateToken,
    verifyToken,
    getBearerTokenFromRequest,
  };
};

module.exports = { createAuthSupport };
