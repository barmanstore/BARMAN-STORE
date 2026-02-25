const { buildNotificationTemplate } = require('./notificationTemplates');

const encodeMailto = ({ to, subject, body }) => {
  const recipient = String(to || '').trim();
  const query = new URLSearchParams();
  if (subject) query.set('subject', String(subject));
  if (body) query.set('body', String(body));
  const suffix = query.toString();
  return `mailto:${encodeURIComponent(recipient)}${suffix ? `?${suffix}` : ''}`;
};

const createNotificationService = (config = {}) => {
  const businessName = String(config.businessName || '').trim() || 'BARMAN STORE';
  const defaultCountryCode = String(config.defaultCountryCode || '91').trim() || '91';

  const prepareEmail = ({ type, to, payload = {} }) => {
    const recipient = String(to || '').trim().toLowerCase();
    if (!recipient) {
      throw new Error('Recipient email is required');
    }
    const template = buildNotificationTemplate(type, {
      ...payload,
      businessName,
    });
    return {
      type: String(type || '').trim().toLowerCase(),
      to: recipient,
      subject: String(template.subject || '').trim(),
      body: String(template.body || ''),
      mailto_url: encodeMailto({
        to: recipient,
        subject: template.subject,
        body: template.body,
      }),
    };
  };

  const normalizePhoneForWhatsApp = (phone) => {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) return `${defaultCountryCode}${digits}`;
    if (digits.length > 10 && digits.startsWith(defaultCountryCode)) return digits;
    return digits;
  };

  const prepareWhatsApp = ({ type, to, payload = {} }) => {
    const normalizedPhone = normalizePhoneForWhatsApp(to);
    if (!normalizedPhone) {
      throw new Error('Recipient phone is required');
    }
    const template = buildNotificationTemplate(type, {
      ...payload,
      businessName,
    });
    const text = String(template.text || template.body || '').trim();
    if (!text) {
      throw new Error('WhatsApp template text is empty');
    }
    return {
      type: String(type || '').trim().toLowerCase(),
      to: normalizedPhone,
      text,
      whatsapp_url: `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(text)}`,
    };
  };

  return {
    prepareEmail,
    prepareWhatsApp,
  };
};

module.exports = {
  createNotificationService,
};
