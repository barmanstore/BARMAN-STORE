const createVerificationUtils = (deps = {}) => {
  const {
    dbRunAsync,
    notificationService,
    createNotificationEvent,
    updateNotificationEventStatus,
    emailVerificationProvider,
    whatsappProvider,
    generateEmailVerificationToken,
    hashVerificationToken,
    generatePhoneVerificationCode,
    hashOpaqueToken,
    EMAIL_VERIFY_TTL_SECONDS,
    EMAIL_VERIFY_MAX_ATTEMPTS,
    PHONE_VERIFY_TTL_SECONDS,
    PHONE_VERIFY_MAX_ATTEMPTS,
    EMAIL_DELIVERY_MODE,
    WHATSAPP_DELIVERY_MODE,
    EMAIL_VERIFY_BASE_URL,
    PHONE_VERIFY_BASE_URL,
  } = deps;

  const createEmailVerificationRecord = async ({ userId, email }) => {
    const token = generateEmailVerificationToken();
    const tokenHash = hashVerificationToken(token);
    const expiresAt = new Date(Date.now() + Number(EMAIL_VERIFY_TTL_SECONDS || 0) * 1000).toISOString();
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
    const expiresAt = new Date(Date.now() + Number(PHONE_VERIFY_TTL_SECONDS || 0) * 1000).toISOString();
    await dbRunAsync(
      `INSERT INTO phone_verification_tokens (user_id, phone, token_hash, expires_at, attempts, max_attempts, used)
       VALUES (?, ?, ?, ?, 0, ?, 0)`,
      [userId, phone, codeHash, expiresAt, Number(PHONE_VERIFY_MAX_ATTEMPTS || 0)]
    );
    return { code, expiresAt };
  };

  const buildEmailVerificationLink = ({ email, token }) => {
    const base = String(EMAIL_VERIFY_BASE_URL || 'http://localhost/login').trim();
    const hasQuery = base.includes('?');
    return `${base}${hasQuery ? '&' : '?'}email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
  };

  const buildPhoneVerificationLink = ({ phone, code }) => {
    const base = String(PHONE_VERIFY_BASE_URL || '').trim();
    const hasQuery = base.includes('?');
    return `${base}${hasQuery ? '&' : '?'}phone=${encodeURIComponent(phone)}&phoneToken=${encodeURIComponent(code)}`;
  };

  const sendPhoneVerificationChallenge = async ({
    userId,
    phone,
    recipientName = null,
    requestedBy = null,
    exposeTemplate = false,
    deliveryModeOverride = null,
  }) => {
    if (!phone) return { queued: false, reason: 'missing_phone' };
    await dbRunAsync(`UPDATE phone_verification_tokens SET used = 1 WHERE user_id = ? AND phone = ? AND used = 0`, [userId, phone]);
    const { code, expiresAt } = await createPhoneVerificationRecord({ userId, phone });
    const link = buildPhoneVerificationLink({ phone, code });
    const preparedWhatsApp = notificationService.prepareWhatsApp({
      type: 'phone_verification',
      to: phone,
      payload: { recipientName, code, link, expiresAt },
    });
    const eventId = await createNotificationEvent({
      type: 'phone_verification',
      channel: 'whatsapp',
      recipient: phone,
      recipientUserId: userId,
      subject: 'Phone verification',
      body: preparedWhatsApp.text,
      metadata: {
        mode: deliveryModeOverride || WHATSAPP_DELIVERY_MODE,
        link,
        expires_at: expiresAt,
      },
      status: 'prepared',
      preparedBy: requestedBy,
    });
    const effectiveMode = String(deliveryModeOverride || WHATSAPP_DELIVERY_MODE).trim().toLowerCase() === 'auto'
      ? 'auto'
      : 'manual';

    if (effectiveMode === 'manual') {
      const response = {
        queued: false,
        reason: 'manual_send_required',
        mode: effectiveMode,
        event_id: eventId,
        expiresAt,
      };
      if (exposeTemplate) {
        response.whatsapp = {
          to: preparedWhatsApp.to,
          text: preparedWhatsApp.text,
          whatsapp_url: preparedWhatsApp.whatsapp_url,
          link,
          code,
        };
      }
      return response;
    }

    if (!whatsappProvider?.isReady) {
      await updateNotificationEventStatus(eventId, {
        status: 'failed',
        errorMessage: 'WhatsApp provider is not configured',
      });
      return {
        queued: false,
        reason: 'provider_not_ready',
        mode: effectiveMode,
        event_id: eventId,
        missing: whatsappProvider?.missing || [],
      };
    }

    await whatsappProvider.sendMessage({
      to: preparedWhatsApp.to,
      text: preparedWhatsApp.text,
    });
    await updateNotificationEventStatus(eventId, { status: 'sent' });
    const response = {
      queued: true,
      mode: effectiveMode,
      event_id: eventId,
      expiresAt,
    };
    if (exposeTemplate) {
      response.whatsapp = {
        to: preparedWhatsApp.to,
        text: preparedWhatsApp.text,
        whatsapp_url: preparedWhatsApp.whatsapp_url,
        link,
        code,
      };
    }
    return response;
  };

  const sendEmailVerificationChallenge = async ({
    userId,
    email,
    recipientName = null,
    requestedBy = null,
    exposeTemplate = false,
    deliveryModeOverride = null,
  }) => {
    if (!email) return { queued: false, reason: 'missing_email' };
    await dbRunAsync(`UPDATE email_verification_tokens SET used = 1 WHERE user_id = ? AND email = ? AND used = 0`, [userId, email]);
    const { token, expiresAt } = await createEmailVerificationRecord({ userId, email });
    const link = buildEmailVerificationLink({ email, token });
    const preparedEmail = notificationService.prepareEmail({
      type: 'email_verification',
      to: email,
      payload: { recipientName, link, token, expiresAt },
    });
    const eventId = await createNotificationEvent({
      type: 'email_verification',
      channel: 'email',
      recipient: email,
      recipientUserId: userId,
      subject: preparedEmail.subject,
      body: preparedEmail.body,
      metadata: {
        mode: deliveryModeOverride || EMAIL_DELIVERY_MODE,
        link,
        expires_at: expiresAt,
      },
      status: 'prepared',
      preparedBy: requestedBy,
    });
    const effectiveMode = String(deliveryModeOverride || EMAIL_DELIVERY_MODE).trim().toLowerCase() === 'auto'
      ? 'auto'
      : 'manual';

    if (effectiveMode === 'manual') {
      const response = {
        queued: false,
        reason: 'manual_send_required',
        mode: effectiveMode,
        event_id: eventId,
        expiresAt,
      };
      if (exposeTemplate) {
        response.email = {
          to: preparedEmail.to,
          subject: preparedEmail.subject,
          body: preparedEmail.body,
          mailto_url: preparedEmail.mailto_url,
          link,
          token,
        };
      }
      return response;
    }

    if (!emailVerificationProvider?.isReady) {
      await updateNotificationEventStatus(eventId, {
        status: 'failed',
        errorMessage: 'Email provider is not configured',
      });
      return {
        queued: false,
        reason: 'provider_not_ready',
        mode: effectiveMode,
        event_id: eventId,
        missing: emailVerificationProvider?.missing || [],
      };
    }

    await emailVerificationProvider.sendMessage({
      to: preparedEmail.to,
      subject: preparedEmail.subject,
      body: preparedEmail.body,
    });
    await updateNotificationEventStatus(eventId, { status: 'sent' });
    const response = {
      queued: true,
      mode: effectiveMode,
      event_id: eventId,
      expiresAt,
    };
    if (exposeTemplate) {
      response.email = {
        to: preparedEmail.to,
        subject: preparedEmail.subject,
        body: preparedEmail.body,
        mailto_url: preparedEmail.mailto_url,
        link,
        token,
      };
    }
    return response;
  };

  return {
    createEmailVerificationRecord,
    createPhoneVerificationRecord,
    buildEmailVerificationLink,
    buildPhoneVerificationLink,
    sendPhoneVerificationChallenge,
    sendEmailVerificationChallenge,
  };
};

module.exports = { createVerificationUtils };
