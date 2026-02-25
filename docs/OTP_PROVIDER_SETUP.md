# OTP Provider Setup

This project supports two password reset modes:

- `admin`: current mode. User submits reset request, admin sets a strong password.
- `otp`: future mode. User reset uses OTP provider integration.

## 1) Current safe mode (no OTP purchase required)

Set in `.env`:

```env
PASSWORD_RESET_MODE=admin
```

In this mode:

- `/api/auth/request-password-reset` creates admin review requests.
- OTP endpoints are disabled by design.

## 2) Prepare OTP config now

Add these keys in `.env` (keep empty until provider is purchased):

```env
OTP_PROVIDER=twilio
OTP_API_KEY=
OTP_API_SECRET=
OTP_SENDER_ID=
OTP_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=5
```

## 3) Switch to OTP mode later

When provider is available:

1. Fill OTP keys in `.env`.
2. Change:

```env
PASSWORD_RESET_MODE=otp
```

3. Restart backend.
4. Verify mode:
   - `GET /api/auth/reset-mode`
   - Expect `mode: "otp"` and `otp_ready: true`.

## 4) Current implementation status

- OTP table and mode toggle are in place.
- OTP provider abstraction exists in `server/otpProvider.js`.
- OTP send/verify/complete routes are scaffolded.
- Actual provider send/verify logic is intentionally not implemented yet.

## 5) Security defaults

- OTP TTL is controlled by `OTP_TTL_SECONDS`.
- Max attempts controlled by `OTP_MAX_ATTEMPTS`.
- Password reset requests are rate-limited by IP and identifier.
