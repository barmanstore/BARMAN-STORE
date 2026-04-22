const registerAuthResetModeRoutes = (deps) => {
  const {
    app,
    AUTH_FLOW_MODE,
    EMAIL_DELIVERY_MODE,
    emailVerificationProvider,
    supabaseAuthProvider,
    EMAIL_VERIFICATION_MODE,
    SUPABASE_AUTH_MODE,
    WHATSAPP_DELIVERY_MODE,
    whatsappProvider,
    OTP_PROVIDER,
    OTP_DELIVERY_MODE,
    OTP_VERIFY_SESSION_TTL_SECONDS,
    PHONE_VERIFICATION_REQUIRED,
    WHATSAPP_PROVIDER,
    SUPABASE_EMAIL_VERIFY_REDIRECT,
  } = deps;

  app.get('/api/auth/reset-mode', (_, res) => {
    try {
      const whatsappProviderSupportsSend = Boolean(whatsappProvider?.supportsSend);
      const whatsappProviderReady =
        whatsappProviderSupportsSend && Boolean(whatsappProvider?.isReady);
      return res.json({
        auth_flow_mode: AUTH_FLOW_MODE,
        mode: 'otp_login_only',
        auth_methods: {
          otp: true,
          oauth: Boolean(supabaseAuthProvider?.shouldUseOAuth?.()),
          password: false,
        },
        otp_provider: OTP_PROVIDER,
        otp_delivery_mode: OTP_DELIVERY_MODE,
        otp_ready: true,
        otp_verify_session_ttl_seconds: OTP_VERIFY_SESSION_TTL_SECONDS,
        phone_verification_required: PHONE_VERIFICATION_REQUIRED,
        whatsapp_delivery_mode: WHATSAPP_DELIVERY_MODE,
        whatsapp_delivery_scope: whatsappProviderSupportsSend ? 'provider_send' : 'manual_prepare',
        whatsapp_provider: WHATSAPP_PROVIDER,
        whatsapp_provider_supports_send: whatsappProviderSupportsSend,
        whatsapp_provider_ready: whatsappProviderReady,
        email_verification_mode: EMAIL_VERIFICATION_MODE,
        email_delivery_mode: EMAIL_DELIVERY_MODE,
        email_provider_ready: Boolean(emailVerificationProvider?.isReady),
        supabase_auth_enabled: Boolean(supabaseAuthProvider?.isEnabled),
        supabase_auth_mode: SUPABASE_AUTH_MODE,
        supabase_client_ready: Boolean(supabaseAuthProvider?.clientReady),
        supabase_oauth_ready: Boolean(supabaseAuthProvider?.oauthReady),
        supabase_admin_ready: Boolean(supabaseAuthProvider?.adminReady),
        supabase_url: supabaseAuthProvider?.baseUrl || null,
        supabase_email_verify_redirect: SUPABASE_EMAIL_VERIFY_REDIRECT || null,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to load auth reset mode' });
    }
  });
};

module.exports = { registerAuthResetModeRoutes };
