CREATE TABLE IF NOT EXISTS supplier_visits (
  id BIGSERIAL PRIMARY KEY,
  supplier_id BIGINT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL,
  visit_closed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_visits_supplier_date
  ON supplier_visits (supplier_id, visit_date);

CREATE INDEX IF NOT EXISTS idx_supplier_visits_visit_date
  ON supplier_visits (visit_date);
