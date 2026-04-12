ALTER TABLE bulk_job_items
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE bulk_job_items
  ADD COLUMN IF NOT EXISTS row_action TEXT NOT NULL DEFAULT 'bulk_update',
  ADD COLUMN IF NOT EXISTS source_row_id INTEGER,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS normalized_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bulk_job_items_job_source_row_id
  ON bulk_job_items (job_id, source_row_id)
  WHERE source_row_id IS NOT NULL;

UPDATE bulk_job_items
SET row_action = COALESCE(row_action, 'bulk_update'),
    raw_payload = COALESCE(raw_payload, '{}'::jsonb),
    normalized_payload = COALESCE(normalized_payload, '{}'::jsonb)
WHERE row_action IS NULL
   OR raw_payload IS NULL
   OR normalized_payload IS NULL;
