ALTER TABLE distributors
  ADD COLUMN IF NOT EXISTS visit_day TEXT,
  ADD COLUMN IF NOT EXISTS order_cutoff_time TEXT,
  ADD COLUMN IF NOT EXISTS preferred_whatsapp_time TEXT,
  ADD COLUMN IF NOT EXISTS payment_cycle_type TEXT NOT NULL DEFAULT 'net',
  ADD COLUMN IF NOT EXISTS payment_due_days INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS inactive_reason TEXT,
  ADD COLUMN IF NOT EXISTS auto_suggest_items BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS auto_reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE distributors
SET visit_day = COALESCE(NULLIF(TRIM(visit_day), ''), NULLIF(TRIM(order_day), ''))
WHERE visit_day IS NULL OR TRIM(visit_day) = '';

UPDATE distributors
SET payment_cycle_type = CASE
  WHEN LOWER(COALESCE(payment_terms, '')) LIKE '%cash%' THEN 'cod'
  ELSE 'net'
END
WHERE payment_cycle_type IS NULL OR TRIM(payment_cycle_type) = '';

UPDATE distributors
SET payment_due_days = CASE
  WHEN LOWER(COALESCE(payment_terms, '')) LIKE '%cash%' THEN 0
  WHEN COALESCE(NULLIF(regexp_replace(COALESCE(payment_terms, ''), '[^0-9]', '', 'g'), ''), '') <> ''
    THEN CAST(regexp_replace(COALESCE(payment_terms, ''), '[^0-9]', '', 'g') AS INTEGER)
  ELSE COALESCE(payment_due_days, 30)
END
WHERE payment_due_days IS NULL OR payment_due_days < 0;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS planned_order_date DATE,
  ADD COLUMN IF NOT EXISTS payment_due_date DATE,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revision_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicate_key TEXT,
  ADD COLUMN IF NOT EXISTS next_action TEXT,
  ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;

UPDATE purchase_orders
SET planned_order_date = COALESCE(planned_order_date, expected_delivery, CAST(created_at AS DATE));

UPDATE purchase_orders
SET po_status = CASE
  WHEN LOWER(COALESCE(po_status, status, '')) IN ('cancelled', 'canceled') THEN 'cancelled'
  WHEN LOWER(COALESCE(po_status, status, '')) IN ('closed') THEN 'closed'
  WHEN LOWER(COALESCE(po_status, status, '')) IN ('paid', 'full_paid', 'fully_paid') THEN 'fully_paid'
  WHEN LOWER(COALESCE(po_status, status, '')) IN ('part_paid', 'partial', 'partial_paid') THEN 'part_paid'
  WHEN LOWER(COALESCE(po_status, status, '')) IN ('processed', 'confirmed', 'received', 'shipped') THEN 'confirmed'
  WHEN LOWER(COALESCE(po_status, status, '')) IN ('sent') THEN 'sent'
  WHEN LOWER(COALESCE(po_status, status, '')) IN ('revised', 'edited') THEN 'revised'
  ELSE 'prepared'
END
WHERE po_status IS NULL
   OR TRIM(po_status) = ''
   OR LOWER(COALESCE(po_status, status, '')) IN ('registered', 'pending', 'draft', 'processed', 'confirmed', 'received', 'shipped');

CREATE TABLE IF NOT EXISTS purchase_order_status_history (
  id BIGSERIAL PRIMARY KEY,
  purchase_order_id BIGINT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT,
  bill_number TEXT,
  payment_status TEXT,
  balance_due NUMERIC(12,2),
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_status_history_order
  ON purchase_order_status_history (purchase_order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS distributor_purchase_reminders (
  id BIGSERIAL PRIMARY KEY,
  distributor_id BIGINT NOT NULL,
  purchase_order_id BIGINT,
  reminder_type TEXT NOT NULL,
  scheduled_for DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  title TEXT,
  message TEXT,
  whatsapp_url TEXT,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_distributor_purchase_reminders_unique
  ON distributor_purchase_reminders (distributor_id, COALESCE(purchase_order_id, 0), reminder_type, scheduled_for);

ALTER TABLE purchase_order_payments
  ADD COLUMN IF NOT EXISTS client_request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_order_payments_client_request_id
  ON purchase_order_payments (client_request_id)
  WHERE client_request_id IS NOT NULL AND TRIM(client_request_id) <> '';
