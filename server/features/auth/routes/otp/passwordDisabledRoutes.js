const registerPasswordDisabledRoutes = (deps) => {
  const { app, authIpLimiter } = deps;

  const PASSWORD_AUTH_DISABLED_ERROR =
    'Password-based authentication is disabled. Use OTP or OAuth login.';
  const respondPasswordAuthDisabled = (_, res) =>
    res.status(410).json({ error: PASSWORD_AUTH_DISABLED_ERROR });

  [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/change-password',
    '/api/auth/request-password-reset',
    '/api/auth/password/recovery/complete',
    '/api/auth/reset-password/otp/verify',
    '/api/auth/reset-password/otp/complete',
  ].forEach((routePath) => {
    app.post(routePath, authIpLimiter, respondPasswordAuthDisabled);
  });
};

module.exports = { registerPasswordDisabledRoutes };
