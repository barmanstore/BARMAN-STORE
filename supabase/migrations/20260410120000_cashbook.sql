CREATE TABLE IF NOT EXISTS cashbook_opening_balances (
  balance_date DATE PRIMARY KEY,
  opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  note TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cashbook_entries (
  id BIGSERIAL PRIMARY KEY,
  entry_date DATE NOT NULL,
  entry_time TIME NOT NULL DEFAULT CURRENT_TIME,
  type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  note TEXT,
  source_id BIGINT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  client_request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (TRIM(type) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbook_entries_client_request_id
  ON cashbook_entries (client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cashbook_entries_entry_date_time
  ON cashbook_entries (entry_date DESC, entry_time DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cashbook_entries_type
  ON cashbook_entries (type);
