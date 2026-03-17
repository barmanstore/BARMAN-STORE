const createEmailVerificationSender = (deps = {}) => {
  const {
    dbRunAsync,
    notificationService,
    createNotificationEvent,
    updateNotificationEventStatus,
    emailVerificationProvider,
    EMAIL_DELIVERY_MODE,
    createEmailVerificationRecord,
    buildEmailVerificationLink,
  } = deps;

  const sendEmailVerificationChallenge = async ({
    userId,
    email,
    recipientName = null,
    requestedBy = null,
    exposeTemplate = false,
    deliveryModeOverride = null,
  }) => {
    if (!email) return { queued: false, reason: 'missing_email' };
    await dbRunAsync('UPDATE email_verification_tokens SET used = 1 WHERE user_id = ? AND email = ? AND used = 0', [userId, email]);
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

  return { sendEmailVerificationChallenge };
};

module.exports = { createEmailVerificationSender };
