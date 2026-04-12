CREATE TABLE IF NOT EXISTS bulk_jobs (
  id BIGSERIAL PRIMARY KEY,
  operation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  total INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  succeeded INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  conflicts INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_hash TEXT NOT NULL,
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancel_requested_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  locked_by TEXT,
  error_message TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bulk_jobs_idempotency_key
  ON bulk_jobs (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_bulk_jobs_status_created_at
  ON bulk_jobs (status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_bulk_jobs_lease_expires_at
  ON bulk_jobs (lease_expires_at);

CREATE TABLE IF NOT EXISTS bulk_job_items (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES bulk_jobs(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bulk_job_items_job_product
  ON bulk_job_items (job_id, product_id);

CREATE INDEX IF NOT EXISTS idx_bulk_job_items_job_status_id
  ON bulk_job_items (job_id, status, id);

CREATE INDEX IF NOT EXISTS idx_bulk_job_items_product_id
  ON bulk_job_items (product_id);
