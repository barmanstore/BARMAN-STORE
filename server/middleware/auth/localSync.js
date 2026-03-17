const createLocalAuthSync = ({
  normalizeEmail,
  dbGetAsync,
  dbRunAsync,
  hashPassword,
  generateTemporaryPassword,
  getVerifiedPhoneFromMetadata,
} = {}) => {
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

  return {
    syncLocalUserFromSupabaseAuth,
    syncLocalEmailVerifiedFromSupabase,
  };
};

module.exports = { createLocalAuthSync };
