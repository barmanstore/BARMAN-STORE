import { apiFetch } from './core';

// Auth API
export const authApi = {
  requestLoginOtp: (payload) =>
    apiFetch('/api/auth/otp/request', {
      method: 'POST',
      body: payload,
    }),
  verifyLoginOtp: (payload) =>
    apiFetch('/api/auth/otp/verify', {
      method: 'POST',
      body: payload,
    }),
  requestEmailVerification: (email) =>
    apiFetch('/api/auth/email/verification/request', {
      method: 'POST',
      body: { email },
    }),
  requestMyEmailVerification: () =>
    apiFetch('/api/auth/email/verification/request-self', {
      method: 'POST',
    }),
  confirmEmailVerification: (email, token, options = {}) =>
    apiFetch('/api/auth/email/verification/confirm', {
      method: 'POST',
      body: options?.tokenHash
        ? { email, token_hash: options.tokenHash }
        : { email, token },
    }),
  getEmailVerificationStatus: () => apiFetch('/api/auth/email/verification/status'),
  getMyPhoneChangeRequestStatus: () => apiFetch('/api/auth/phone-change-request/status'),
  cancelMyPhoneChangeRequest: (payload = {}) =>
    apiFetch('/api/auth/phone-change-request/cancel', {
      method: 'POST',
      body: payload,
    }),
  getMyContactVerificationRequestStatus: () => apiFetch('/api/auth/contact-verification/status'),
  getSession: () => apiFetch('/api/auth/session'),
  getSessionFromToken: (token) =>
    apiFetch('/api/auth/session', {
      headers: {
        Authorization: `Bearer ${String(token || '').trim()}`,
      },
    }),
  getResetMode: () => apiFetch('/api/auth/reset-mode'),
};
