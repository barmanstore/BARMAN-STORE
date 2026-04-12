ALTER TABLE bulk_job_items
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE bulk_job_items
  ADD COLUMN IF NOT EXISTS row_action TEXT NOT NULL DEFAULT 'bulk_update';

ALTER TABLE bulk_job_items
  ADD COLUMN IF NOT EXISTS source_row_id INTEGER;

ALTER TABLE bulk_job_items
  ADD COLUMN IF NOT EXISTS raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE bulk_job_items
  ADD COLUMN IF NOT EXISTS normalized_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_bulk_job_items_job_source_row
  ON bulk_job_items (job_id, source_row_id);
