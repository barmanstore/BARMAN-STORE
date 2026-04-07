# Database

See also: [../ARCHITECTURE.md](../ARCHITECTURE.md), [backend.md](backend.md), [validation.md](validation.md)

## Current Data Platform

- The backend is Postgres-only now.
- Connection and pool setup live in [server/db/postgresScaffold.js](../server/db/postgresScaffold.js).
- Unsupported execution modes are rejected by [server/db/executionAdapter.js](../server/db/executionAdapter.js).

## Schema Source Of Truth

- Schema changes are defined in [supabase/migrations](../supabase/migrations).
- The foundational schema starts in [supabase/migrations/20260224190000_init_barman_store.sql](../supabase/migrations/20260224190000_init_barman_store.sql).
- Recent migrations show current focus areas: auth OTP, order flow, credit issues, category tree, purchase operations, product insights, and offer scheduling.

## Credit Tables

- `credit_history` stores a required `due_date` per entry; historical rows are backfilled from `transaction_date` or `transaction_ts`.
- `customer_credit_profiles` stores the shared short-grace setting plus an optional `credit_terms_days` override. When that override is `0`, new credit entries default to the current payment-status window instead of a fixed manual term.
- `customer_payment_score_snapshots` tracks `unapplied_credit` so overpayments are stored without affecting scoring, and `model_version` so stale scoring models can be detected.
- `customer_credit_aging_snapshots` stores precomputed aging-report summaries for admin reads, and `model_version` so the admin report can reject stale snapshot rows after scoring changes.

## Admin Operations Tables

- `daily_cash_tallies` stores one admin-entered counted-cash record per date for the backoffice daily cash picture. It is intentionally separate from `bills` so unrecorded walk-in cash or short cash can be tracked without mutating bill history.

## Purchase Tables

- `purchase_order_items.row_source` persists whether a saved PO line came from the supplier-registry board (`supplier`) or from a manually added extra product (`manual`).
- `purchase_orders.planned_order_date` is the supplier-visit anchor used by the purchase routine board. Create flows may still backfill it during the rollout, but once stored it should remain the immutable visit day even if `expected_delivery` changes later.
- `suppliers` stores child supplier records under each distributor (`distributor_id`) with their own schedule (`schedule_type`, `schedule_day`), optional supplier-owned `products_supplied`, and `is_primary` for the default supplier per distributor. The supplier product-group column is backfilled from supplier-specific `supplier_products` rows plus PO history by [supabase/migrations/20260404235500_backfill_supplier_product_groups_from_learned_data.sql](../supabase/migrations/20260404235500_backfill_supplier_product_groups_from_learned_data.sql).
- `supplier_products` now includes `supplier_id` (required) so the supplier registry is scoped to the child supplier, not the distributor alone; it remains the learned metadata table for supplier-board rows even when board membership is sourced from `suppliers.products_supplied`. Admin supplier-group edits may flip `supplier_products.is_available` to `FALSE` for products that are no longer supplied, while later PO saves can reactivate those rows if the supplier delivers them again.
- `supplier_visits` stores one persisted supplier-day routine decision per `supplier_id + visit_date`. `visit_closed` is the only manual visit-completion flag, and the unique supplier-day key prevents duplicate close records across tabs or operators.
- `purchase_orders` includes `supplier_id` to track which supplier route the PO is tied to; list/detail reads return `supplier_name` alongside distributor fields.

## Query Compatibility

- Legacy SQLite-style `?` SQL placeholders are adapted to Postgres by [server/db/queryAdapter.js](../server/db/queryAdapter.js).
- Backend code should use async DB helpers only.

## Change Rules

- Add schema changes through a new migration, not ad hoc SQL in route files.
- If a migration changes API behavior or business rules, update [../ROUTES.md](../ROUTES.md) and [business-logic.md](business-logic.md) as needed.
