-- Backfill supplier phone fields that were seeded from distributor contacts JSON.

UPDATE suppliers
SET
  phone = CASE
    WHEN phone IS NULL THEN NULL
    WHEN LEFT(BTRIM(phone), 1) = '{' THEN NULLIF(BTRIM(COALESCE(SUBSTRING(phone FROM '"phone"\s*:\s*"([^"]*)"'), '')), '')
    ELSE NULLIF(BTRIM(phone), '')
  END,
  alt_phone = CASE
    WHEN alt_phone IS NULL THEN NULL
    WHEN LEFT(BTRIM(alt_phone), 1) = '{' THEN NULLIF(BTRIM(COALESCE(SUBSTRING(alt_phone FROM '"phone"\s*:\s*"([^"]*)"'), '')), '')
    ELSE NULLIF(BTRIM(alt_phone), '')
  END,
  updated_at = CURRENT_TIMESTAMP
WHERE
  (phone IS NOT NULL AND LEFT(BTRIM(phone), 1) = '{')
  OR (alt_phone IS NOT NULL AND LEFT(BTRIM(alt_phone), 1) = '{');
