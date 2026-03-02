ALTER TABLE app_notifications
  ADD COLUMN IF NOT EXISTS client_request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_notifications_client_request_id_unique
  ON app_notifications(client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_app_notifications_created_at
  ON app_notifications(created_at);

CREATE TABLE IF NOT EXISTS notification_send_batches (
  id BIGSERIAL PRIMARY KEY,
  client_request_id TEXT NOT NULL UNIQUE,
  sender_user_id BIGINT NOT NULL,
  message TEXT NOT NULL,
  recipient_user_ids TEXT,
  recipient_names TEXT,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notification_send_batches_sender_created
  ON notification_send_batches(sender_user_id, created_at DESC);
