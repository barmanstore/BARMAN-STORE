const createVerificationRecords = (deps = {}) => {
  const {
    dbRunAsync,
    generateEmailVerificationToken,
    hashVerificationToken,
    generatePhoneVerificationCode,
    hashOpaqueToken,
    EMAIL_VERIFY_TTL_SECONDS,
    EMAIL_VERIFY_MAX_ATTEMPTS,
    PHONE_VERIFY_TTL_SECONDS,
    PHONE_VERIFY_MAX_ATTEMPTS,
  } = deps;

  const createEmailVerificationRecord = async ({ userId, email }) => {
    const token = generateEmailVerificationToken();
    const tokenHash = hashVerificationToken(token);
    const expiresAt = new Date(
      Date.now() + Number(EMAIL_VERIFY_TTL_SECONDS || 0) * 1000
    ).toISOString();
    await dbRunAsync(
      `INSERT INTO email_verification_tokens (user_id, email, token_hash, expires_at, attempts, max_attempts, used)
       VALUES (?, ?, ?, ?, 0, ?, 0)`,
      [userId, email, tokenHash, expiresAt, Number(EMAIL_VERIFY_MAX_ATTEMPTS || 0)]
    );
    return { token, expiresAt };
  };

  const createPhoneVerificationRecord = async ({ userId, phone }) => {
    const code = generatePhoneVerificationCode(6);
    const codeHash = hashOpaqueToken(code);
    const expiresAt = new Date(
      Date.now() + Number(PHONE_VERIFY_TTL_SECONDS || 0) * 1000
    ).toISOString();
    await dbRunAsync(
      `INSERT INTO phone_verification_tokens (user_id, phone, token_hash, expires_at, attempts, max_attempts, used)
       VALUES (?, ?, ?, ?, 0, ?, 0)`,
      [userId, phone, codeHash, expiresAt, Number(PHONE_VERIFY_MAX_ATTEMPTS || 0)]
    );
    return { code, expiresAt };
  };

  return {
    createEmailVerificationRecord,
    createPhoneVerificationRecord,
  };
};

module.exports = { createVerificationRecords };
