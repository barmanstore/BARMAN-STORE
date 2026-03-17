const applyProfileUpdate = async ({
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
} = {}) => {
  if (payload.mode === 'admin-role-update') {
    await dbRunAsync('UPDATE users SET role = ? WHERE id = ?', [payload.nextRole, targetUserId]);
    const updated = sanitizeUser(await dbGetAsync('SELECT * FROM users WHERE id = ?', [targetUserId]));
    return { updated, phoneChangeRequest: null };
  }

  const {
    input,
    current,
    requestedPhone,
    currentEmail,
    currentPhone,
    emailValue,
    emailChanged,
    phoneChangedRequested,
    isAdmin,
    isSelf,
  } = payload;

  const { name, email, phone, address, profile_image } = input;
  const shouldQueuePhoneChangeRequest = isSelf && !isAdmin && phoneChangedRequested && Boolean(requestedPhone);
  const persistedPhone = shouldQueuePhoneChangeRequest ? currentPhone : requestedPhone;
  let emailVerifiedValue = Number(current.email_verified || 0) === 1 ? 1 : 0;
  let phoneVerifiedValue = Number(current.phone_verified || 0) === 1 ? 1 : 0;
  const phoneChangedPersisted = phone !== undefined && persistedPhone !== currentPhone;

  if (!emailValue) {
    emailVerifiedValue = 0;
  } else if (emailChanged) {
    emailVerifiedValue = isAdmin && Number(req.body?.email_verified || 0) === 1 ? 1 : 0;
  } else if (isAdmin && email !== undefined && req.body?.email_verified !== undefined) {
    emailVerifiedValue = Number(req.body?.email_verified || 0) === 1 ? 1 : 0;
  }
  if (!persistedPhone) {
    phoneVerifiedValue = 0;
  } else if (phoneChangedPersisted) {
    phoneVerifiedValue = isAdmin && Number(req.body?.phone_verified || 0) === 1 ? 1 : 0;
  } else if (isAdmin && phone !== undefined && req.body?.phone_verified !== undefined) {
    phoneVerifiedValue = Number(req.body?.phone_verified || 0) === 1 ? 1 : 0;
  }

  await dbRunAsync(
    'UPDATE users SET name = ?, email = ?, email_verified = ?, phone = ?, phone_verified = ?, address = ?, profile_image = ?, role = ? WHERE id = ?',
    [
      name !== undefined ? String(name).trim() : current.name,
      emailValue,
      emailVerifiedValue,
      persistedPhone,
      phoneVerifiedValue,
      address !== undefined ? address : current.address,
      profile_image !== undefined ? (String(profile_image || '').trim() || null) : current.profile_image,
      current.role,
      targetUserId,
    ]
  );
  const updated = sanitizeUser(await dbGetAsync('SELECT * FROM users WHERE id = ?', [targetUserId]));
  if (emailChanged && emailValue && emailVerifiedValue === 0) {
    sendEmailVerificationChallenge({
      userId: Number(targetUserId),
      email: emailValue,
      recipientName: name !== undefined ? String(name).trim() : current.name,
      requestedBy: Number(req.authUser?.id || 0) || null,
    }).catch(() => {});
  }
  if (phoneChangedPersisted && persistedPhone && phoneVerifiedValue === 0) {
    sendPhoneVerificationChallenge({
      userId: Number(targetUserId),
      phone: persistedPhone,
      recipientName: name !== undefined ? String(name).trim() : current.name,
      requestedBy: Number(req.authUser?.id || 0) || null,
    }).catch(() => {});
  }

  let phoneChangeRequest = null;
  if (shouldQueuePhoneChangeRequest) {
    const queued = await queuePhoneChangeRequest({
      userId: Number(targetUserId),
      oldPhone: currentPhone,
      newPhone: requestedPhone,
      requestedBy: Number(req.authUser?.id || 0) || null,
      requestedFromIp: getRequestIp(req),
    });
    if (queued) {
      phoneChangeRequest = serializePhoneChangeRequest(queued);
      await notifyPhoneChangeSubmitted({
        userId: Number(targetUserId),
      });
    }
  }

  return { updated, phoneChangeRequest };
};

module.exports = { applyProfileUpdate };
