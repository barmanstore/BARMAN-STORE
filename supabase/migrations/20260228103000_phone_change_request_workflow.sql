CREATE TABLE IF NOT EXISTS phone_change_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  old_phone TEXT,
  new_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_VALIDATION',
  requested_by BIGINT,
  requested_from_ip TEXT,
  needs_admin_review INTEGER NOT NULL DEFAULT 0,
  conflict_user_id BIGINT,
  auto_check_at TIMESTAMPTZ,
  final_due_at TIMESTAMPTZ,
  admin_notified_at TIMESTAMPTZ,
  decision_source TEXT,
  admin_note TEXT,
  rejection_reason TEXT,
  reviewed_by BIGINT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  ALTER TABLE phone_change_requests DROP CONSTRAINT IF EXISTS phone_change_requests_status_check;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE phone_change_requests
    ADD CONSTRAINT phone_change_requests_status_check
    CHECK (status IN ('PENDING_VALIDATION', 'APPROVED', 'REJECTED'));
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
  WHEN undefined_table THEN
    NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE phone_change_requests DROP CONSTRAINT IF EXISTS phone_change_requests_decision_source_check;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE phone_change_requests
    ADD CONSTRAINT phone_change_requests_decision_source_check
    CHECK (
      decision_source IS NULL
      OR decision_source IN ('AUTO', 'ADMIN')
    );
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
  WHEN undefined_table THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_phone_change_requests_status_created
  ON phone_change_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_phone_change_requests_user_created
  ON phone_change_requests(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_phone_change_requests_auto_check
  ON phone_change_requests(auto_check_at)
  WHERE status = 'PENDING_VALIDATION' AND COALESCE(needs_admin_review, 0) = 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_phone_change_requests_user_pending
  ON phone_change_requests(user_id)
  WHERE status = 'PENDING_VALIDATION';
