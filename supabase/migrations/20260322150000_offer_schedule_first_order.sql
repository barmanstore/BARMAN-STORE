ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ;

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS first_order_only BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_offers_active_schedule
  ON offers(status, start_at, end_at, start_date, end_date);
