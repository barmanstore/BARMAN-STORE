const normalizeProvider = (name) => String(name || '').trim().toLowerCase();

const requiredConfig = (config = {}, keys = []) => {
  const missing = keys.filter((key) => !String(config[key] || '').trim());
  return { ok: missing.length === 0, missing };
};

const createTwilioProvider = (config = {}) => {
  const check = requiredConfig(config, ['OTP_API_KEY', 'OTP_API_SECRET', 'OTP_SENDER_ID']);
  return {
    isReady: check.ok,
    missing: check.missing,
    async sendOtp() {
      throw new Error('Twilio OTP integration is not implemented yet.');
    },
  };
};

const createUnsupportedProvider = (providerName) => ({
  isReady: false,
  missing: ['OTP_PROVIDER'],
  async sendOtp() {
    throw new Error(`Unsupported OTP provider: ${providerName || 'unknown'}`);
  },
});

const createOtpProvider = (config = {}) => {
  const providerName = normalizeProvider(config.OTP_PROVIDER || 'twilio');
  if (providerName === 'twilio') return createTwilioProvider(config);
  return createUnsupportedProvider(providerName);
};

module.exports = {
  createOtpProvider,
};
