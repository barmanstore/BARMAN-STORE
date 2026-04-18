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
    await dbRunAsync(
      'UPDATE phone_verification_tokens SET used = 1 WHERE user_id = ? AND phone = ? AND used = 0',
      [userId, phone]
    );
    const { code, expiresAt } = await createPhoneVerificationRecord({ userId, phone });
    const link = buildPhoneVerificationLink({ phone, code });
    const preparedWhatsApp = notificationService.prepareWhatsApp({
      type: 'phone_verification',
      to: phone,
      payload: { recipientName, code, link, expiresAt },
    });
    const requestedMode =
      String(deliveryModeOverride || WHATSAPP_DELIVERY_MODE)
        .trim()
        .toLowerCase() === 'auto'
        ? 'auto'
        : 'manual';
    const effectiveMode =
      requestedMode === 'auto' &&
      Boolean(whatsappProvider?.supportsSend) &&
      Boolean(whatsappProvider?.isReady)
        ? 'auto'
        : 'manual';
    const eventId = await createNotificationEvent({
      type: 'phone_verification',
      channel: 'whatsapp',
      recipient: phone,
      recipientUserId: userId,
      subject: 'Phone verification',
      body: preparedWhatsApp.text,
      metadata: {
        mode: effectiveMode,
        requested_mode: requestedMode,
        provider_supports_send: Boolean(whatsappProvider?.supportsSend),
        link,
        expires_at: expiresAt,
      },
      status: 'prepared',
      preparedBy: requestedBy,
    });

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

    if (!whatsappProvider?.isReady || !whatsappProvider?.supportsSend) {
      await updateNotificationEventStatus(eventId, {
        status: 'failed',
        errorMessage: 'WhatsApp provider cannot deliver messages',
      });
      return {
        queued: false,
        reason: 'provider_not_ready',
        mode: effectiveMode,
        event_id: eventId,
        missing: whatsappProvider?.missing || [],
      };
    }

    try {
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
    } catch (error) {
      await updateNotificationEventStatus(eventId, {
        status: 'failed',
        errorMessage: error?.message || String(error || 'WhatsApp send failed'),
      });
      const response = {
        queued: false,
        reason: 'send_failed',
        mode: effectiveMode,
        event_id: eventId,
        expiresAt,
        error: error?.message || String(error || 'WhatsApp send failed'),
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
  };

  return { sendPhoneVerificationChallenge };
};

module.exports = { createPhoneVerificationSender };
