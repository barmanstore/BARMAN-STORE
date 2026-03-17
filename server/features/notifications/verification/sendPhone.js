const createPhoneVerificationSender = (deps = {}) => {
  const {
    dbRunAsync,
    notificationService,
    createNotificationEvent,
    updateNotificationEventStatus,
    whatsappProvider,
    WHATSAPP_DELIVERY_MODE,
    createPhoneVerificationRecord,
    buildPhoneVerificationLink,
  } = deps;

  const sendPhoneVerificationChallenge = async ({
    userId,
    phone,
    recipientName = null,
    requestedBy = null,
    exposeTemplate = false,
    deliveryModeOverride = null,
  }) => {
    if (!phone) return { queued: false, reason: 'missing_phone' };
    await dbRunAsync('UPDATE phone_verification_tokens SET used = 1 WHERE user_id = ? AND phone = ? AND used = 0', [userId, phone]);
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

  return { sendPhoneVerificationChallenge };
};

module.exports = { createPhoneVerificationSender };
