const normalizeMode = (value) => String(value || '').trim().toLowerCase();

const hasConfig = (value) => String(value || '').trim().length > 0;

const createStubProvider = () => ({
  mode: 'stub',
  isReady: true,
  missing: [],
  async sendVerification({ to, token, link }) {
    console.log(`[EMAIL_VERIFY][STUB] to=${to} token=${token} link=${link}`);
    return { delivered: true, provider: 'stub' };
  },
});

const createProviderMode = (config = {}) => {
  const missing = [];
  if (!hasConfig(config.EMAIL_API_KEY)) missing.push('EMAIL_API_KEY');
  if (!hasConfig(config.EMAIL_API_SECRET)) missing.push('EMAIL_API_SECRET');
  if (!hasConfig(config.EMAIL_FROM)) missing.push('EMAIL_FROM');
  return {
    mode: 'provider',
    isReady: missing.length === 0,
    missing,
    async sendVerification() {
      throw new Error('Email provider integration is not implemented yet.');
    },
  };
};

const createEmailVerificationProvider = (config = {}) => {
  const mode = normalizeMode(config.EMAIL_VERIFICATION_MODE || 'stub');
  if (mode === 'provider') return createProviderMode(config);
  return createStubProvider();
};

module.exports = {
  createEmailVerificationProvider,
};
