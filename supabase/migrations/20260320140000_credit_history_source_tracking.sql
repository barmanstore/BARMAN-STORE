ALTER TABLE credit_history
  ADD COLUMN IF NOT EXISTS source_type TEXT;

ALTER TABLE credit_history
  ADD COLUMN IF NOT EXISTS source_id TEXT;

ALTER TABLE credit_history
  ADD COLUMN IF NOT EXISTS source_label TEXT;

ALTER TABLE credit_history
  ADD COLUMN IF NOT EXISTS reversed_entry_id BIGINT;

UPDATE credit_history
SET source_type = 'bill',
    source_label = COALESCE(NULLIF(source_label, ''), NULLIF(reference, '')),
    source_id = COALESCE(
      NULLIF(source_id, ''),
      (
        SELECT CAST(b.id AS TEXT)
        FROM bills b
        WHERE b.bill_number = credit_history.reference
        LIMIT 1
      )
    )
WHERE COALESCE(source_type, '') = ''
  AND LOWER(COALESCE(type, '')) = 'given'
  AND COALESCE(description, '') LIKE 'Bill credit |%'
  AND COALESCE(reference, '') <> '';

UPDATE credit_history
SET source_type = 'issue_correction',
    source_label = COALESCE(NULLIF(source_label, ''), NULLIF(reference, ''))
WHERE COALESCE(source_type, '') = ''
  AND COALESCE(reference, '') LIKE 'ISSUE-%';

UPDATE credit_history
SET source_type = 'adjustment',
    source_label = COALESCE(NULLIF(source_label, ''), NULLIF(reference, ''))
WHERE COALESCE(source_type, '') = '';

CREATE INDEX IF NOT EXISTS idx_credit_history_source
  ON credit_history (source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_credit_history_reversed_entry
  ON credit_history (reversed_entry_id);
