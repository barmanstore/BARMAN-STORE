const { buildMessagePreview } = require('../../../../../shared/textPreview.cjs');

const registerCreditLedgerWhatsAppLogRoutes = (deps) => {
  const { app, requireAuth, logAdminAuditAsync } = deps;

  app.post('/api/credit/whatsapp/launch-log', requireAuth, async (req, res) => {
    try {
      const {
        customer_id: customerId,
        type,
        status,
        message_preview: messagePreview,
        phone,
        context_type: contextType,
        context_id: contextId,
        trigger_source: triggerSource,
      } = req.body || {};

      const normalizedCustomerId = Number(customerId || 0);
      if (!normalizedCustomerId) {
        return res.status(400).json({ error: 'customer_id is required' });
      }
      const normalizedType = String(type || '')
        .trim()
        .toLowerCase();
      if (!normalizedType) {
        return res.status(400).json({ error: 'type is required' });
      }
      const normalizedStatus = String(status || '').trim();
      if (!normalizedStatus) {
        return res.status(400).json({ error: 'status is required' });
      }

      const preview = buildMessagePreview(messagePreview, 500) || null;
      const normalizedPhone = String(phone || '').trim() || null;

      await logAdminAuditAsync(req, {
        action: 'credit_whatsapp_launch',
        entityType: 'credit_whatsapp',
        entityId: String(normalizedCustomerId),
        details: {
          customer_id: normalizedCustomerId,
          type: normalizedType,
          status: normalizedStatus,
          phone: normalizedPhone,
          message_preview: preview,
          context_type: contextType ? String(contextType).trim() : null,
          context_id:
            contextId !== undefined && contextId !== null ? String(contextId).trim() : null,
          trigger_source: triggerSource ? String(triggerSource).trim() : null,
        },
      });

      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: error?.message || 'Failed to log WhatsApp launch' });
    }
  });
};

module.exports = { registerCreditLedgerWhatsAppLogRoutes };
