const sanitizeUser = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    name: row.name,
    email: row.email,
    email_verified: Number(row.email_verified || 0) === 1,
    phone: row.phone,
    phone_verified: Number(row.phone_verified || 0) === 1,
    address: row.address,
    profile_image: row.profile_image || null,
    must_change_password: Number(row.must_change_password || 0) === 1,
    credit_limit: row.credit_limit === null || row.credit_limit === undefined
      ? null
      : Number(row.credit_limit || 0),
    created_at: row.created_at,
  };
};

module.exports = { sanitizeUser };
