CREATE TABLE IF NOT EXISTS auth_login_otps (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  email TEXT,
  phone TEXT,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT auth_login_otps_identifier_check CHECK (
    (email IS NOT NULL AND BTRIM(email) <> '')
    OR (phone IS NOT NULL AND BTRIM(phone) <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_auth_login_otps_user_created
  ON auth_login_otps(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_login_otps_email_active
  ON auth_login_otps(email, used, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_login_otps_phone_active
  ON auth_login_otps(phone, used, created_at DESC);
