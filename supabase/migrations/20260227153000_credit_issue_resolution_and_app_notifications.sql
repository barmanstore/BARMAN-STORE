DO $$
BEGIN
  -- Allow upgraded credit issue lifecycle status values.
  ALTER TABLE credit_entry_issues DROP CONSTRAINT IF EXISTS credit_entry_issues_status_check;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;

UPDATE credit_entry_issues
SET status = CASE
  WHEN LOWER(COALESCE(status, '')) = 'reviewed' THEN 'in_review'
  WHEN LOWER(COALESCE(status, '')) = 'resolved' THEN 'corrected'
  WHEN LOWER(COALESCE(status, '')) IN ('open', 'in_review', 'corrected', 'rejected') THEN LOWER(COALESCE(status, ''))
  ELSE 'open'
END;

DO $$
BEGIN
  ALTER TABLE credit_entry_issues
    ADD CONSTRAINT credit_entry_issues_status_check
    CHECK (status IN ('open', 'in_review', 'corrected', 'rejected'));
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
  WHEN undefined_table THEN
    NULL;
END $$;

ALTER TABLE credit_entry_issues
  ADD COLUMN IF NOT EXISTS admin_reason TEXT,
  ADD COLUMN IF NOT EXISTS correction_entry_id BIGINT,
  ADD COLUMN IF NOT EXISTS customer_response_status TEXT,
  ADD COLUMN IF NOT EXISTS customer_response_note TEXT,
  ADD COLUMN IF NOT EXISTS customer_response_at TIMESTAMPTZ;

UPDATE credit_entry_issues
SET customer_response_status = CASE
  WHEN status IN ('corrected', 'rejected') THEN COALESCE(NULLIF(customer_response_status, ''), 'pending')
  ELSE NULL
END;

CREATE TABLE IF NOT EXISTS app_notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'success', 'warning', 'error')),
  entity_type TEXT,
  entity_id BIGINT,
  issue_id BIGINT,
  is_read INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_app_notifications_user_created
  ON app_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_notifications_user_unread_created
  ON app_notifications(user_id, is_read, created_at DESC);
