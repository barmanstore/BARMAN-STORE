CREATE TABLE IF NOT EXISTS daily_cash_tallies (
  tally_date DATE PRIMARY KEY,
  counted_cash_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (counted_cash_total >= 0),
  note TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
