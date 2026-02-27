UPDATE orders
SET status = CASE
  WHEN LOWER(COALESCE(status, '')) IN ('received', 'confirmed', 'delivered', 'processing', 'shipped') THEN 'received'
  ELSE 'ordered'
END
WHERE LOWER(COALESCE(status, '')) NOT IN ('ordered', 'received');

UPDATE orders
SET payment_method = 'cash'
WHERE LOWER(COALESCE(payment_method, '')) <> 'cash';

UPDATE orders
SET payment_status = CASE
  WHEN LOWER(COALESCE(status, '')) = 'received' THEN 'paid'
  ELSE 'pending'
END;

UPDATE order_status_history
SET status = CASE
  WHEN LOWER(COALESCE(status, '')) IN ('received', 'confirmed', 'delivered', 'processing', 'shipped') THEN 'received'
  ELSE 'ordered'
END
WHERE LOWER(COALESCE(status, '')) NOT IN ('ordered', 'received');

CREATE TABLE IF NOT EXISTS product_recommendations (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  requested_name TEXT NOT NULL,
  notes TEXT,
  contact_phone TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'fulfilled', 'rejected')),
  admin_note TEXT,
  resolved_by BIGINT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_recommendations_user_created
  ON product_recommendations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_recommendations_status_created
  ON product_recommendations(status, created_at DESC);

CREATE TABLE IF NOT EXISTS credit_entry_issues (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  credit_entry_id BIGINT,
  issue_type TEXT NOT NULL DEFAULT 'wrong_entry',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'resolved', 'rejected')),
  entry_snapshot TEXT,
  reported_by BIGINT NOT NULL,
  resolution_note TEXT,
  resolved_by BIGINT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_credit_entry_issues_user_created
  ON credit_entry_issues(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_entry_issues_status_created
  ON credit_entry_issues(status, created_at DESC);

