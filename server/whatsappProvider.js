const normalizeProvider = (name) =>
  String(name || '')
    .trim()
    .toLowerCase();

const requiredConfig = (config = {}, keys = []) => {
  const missing = keys.filter((key) => !String(config[key] || '').trim());
  return { ok: missing.length === 0, missing };
};

const createManualOnlyProvider = ({
  providerName = 'meta',
  missing = [],
  reason = 'provider_send_not_implemented',
} = {}) => ({
  provider: providerName,
  deliveryScope: 'manual_prepare',
  supportsSend: false,
  isReady: false,
  missing,
  reason,
  async sendMessage() {
    throw new Error(
      'WhatsApp provider delivery is not implemented yet. Use the manual prepared-message flow.'
    );
  },
});

const createMetaProvider = (config = {}) => {
  const check = requiredConfig(config, ['WHATSAPP_API_KEY', 'WHATSAPP_PHONE_NUMBER_ID']);
  return createManualOnlyProvider({
    providerName: 'meta',
    missing: check.missing,
    reason: check.ok ? 'provider_send_not_implemented' : 'missing_required_config',
  });
};

const createUnsupportedProvider = (providerName) =>
  createManualOnlyProvider({
    providerName: normalizeProvider(providerName || 'unknown'),
    missing: ['WHATSAPP_PROVIDER'],
    reason: 'unsupported_provider',
  });

const createWhatsappProvider = (config = {}) => {
  const providerName = normalizeProvider(config.WHATSAPP_PROVIDER || 'meta');
  if (providerName === 'meta') return createMetaProvider(config);
  return createUnsupportedProvider(providerName);
};

module.exports = {
  createWhatsappProvider,
};
