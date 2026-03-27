CREATE TABLE IF NOT EXISTS customer_credit_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  is_active INTEGER NOT NULL DEFAULT 1,
  grace_days INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_payment_periods (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  source_credit_entry_id BIGINT,
  period_start TIMESTAMPTZ NOT NULL,
  due_date DATE NOT NULL,
  grace_days INTEGER NOT NULL DEFAULT 60,
  expected_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  allocated_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  remaining_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_fully_settled INTEGER NOT NULL DEFAULT 0,
  settled_at TIMESTAMPTZ,
  source_type TEXT,
  source_id TEXT,
  source_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT customer_payment_periods_user_period_unique UNIQUE (user_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_customer_payment_periods_user_due
  ON customer_payment_periods (user_id, due_date, is_fully_settled);

CREATE INDEX IF NOT EXISTS idx_customer_payment_periods_user_source_entry
  ON customer_payment_periods (user_id, source_credit_entry_id);

CREATE TABLE IF NOT EXISTS customer_payment_score_snapshots (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  score_100 INTEGER,
  raw_score_70 NUMERIC(10,2) NOT NULL DEFAULT 0,
  badge_key TEXT,
  badge_label TEXT,
  badge_tone TEXT,
  status_tag TEXT,
  active_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  discipline_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  missed_penalty NUMERIC(10,2) NOT NULL DEFAULT 0,
  delay_penalty NUMERIC(10,2) NOT NULL DEFAULT 0,
  average_weight NUMERIC(10,3) NOT NULL DEFAULT 0,
  total_periods INTEGER NOT NULL DEFAULT 0,
  on_time_periods INTEGER NOT NULL DEFAULT 0,
  within_7d_periods INTEGER NOT NULL DEFAULT 0,
  within_30d_periods INTEGER NOT NULL DEFAULT 0,
  within_60d_periods INTEGER NOT NULL DEFAULT 0,
  late_periods INTEGER NOT NULL DEFAULT 0,
  missed_periods INTEGER NOT NULL DEFAULT 0,
  average_delay_days NUMERIC(10,2) NOT NULL DEFAULT 0,
  oldest_overdue_days INTEGER NOT NULL DEFAULT 0,
  current_outstanding NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_defaulter INTEGER NOT NULL DEFAULT 0,
  customer_tag TEXT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_payment_score_snapshots_badge
  ON customer_payment_score_snapshots (badge_key, score_100);
