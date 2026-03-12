CREATE TABLE IF NOT EXISTS purchase_analytics_snapshots (
  id BIGSERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  distributor_id BIGINT NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_analytics_snapshots_unique
  ON purchase_analytics_snapshots (snapshot_date, distributor_id);

CREATE INDEX IF NOT EXISTS idx_purchase_analytics_snapshots_distributor
  ON purchase_analytics_snapshots (distributor_id, snapshot_date DESC);
