ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS delivered INTEGER NOT NULL DEFAULT 0;

UPDATE purchase_orders
SET delivered = 1
WHERE COALESCE(delivered, 0) = 0
  AND (
    received_at IS NOT NULL
    OR confirmed_at IS NOT NULL
    OR processed_at IS NOT NULL
    OR LOWER(COALESCE(po_status, status, '')) IN ('confirmed', 'processed', 'part_paid', 'partial_paid', 'fully_paid', 'paid', 'received', 'shipped')
  );
