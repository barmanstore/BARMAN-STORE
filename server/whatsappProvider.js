const normalizeProvider = (name) => String(name || '').trim().toLowerCase();

const requiredConfig = (config = {}, keys = []) => {
  const missing = keys.filter((key) => !String(config[key] || '').trim());
  return { ok: missing.length === 0, missing };
};

const createMetaProvider = (config = {}) => {
  const check = requiredConfig(config, ['WHATSAPP_API_KEY', 'WHATSAPP_PHONE_NUMBER_ID']);
  return {
    isReady: check.ok,
    missing: check.missing,
    async sendMessage() {
      throw new Error('WhatsApp provider integration is not implemented yet.');
    },
  };
};

const createUnsupportedProvider = (providerName) => ({
  isReady: false,
  missing: ['WHATSAPP_PROVIDER'],
  async sendMessage() {
    throw new Error(`Unsupported WhatsApp provider: ${providerName || 'unknown'}`);
  },
});

const createWhatsappProvider = (config = {}) => {
  const providerName = normalizeProvider(config.WHATSAPP_PROVIDER || 'meta');
  if (providerName === 'meta') return createMetaProvider(config);
  return createUnsupportedProvider(providerName);
};

module.exports = {
  createWhatsappProvider,
};
