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
- `customer_credit_profiles` includes `credit_terms_days` to compute default due dates for manual credits.
- `customer_payment_score_snapshots` tracks `unapplied_credit` so overpayments are stored without affecting scoring.

## Query Compatibility

- Legacy SQLite-style `?` SQL placeholders are adapted to Postgres by [server/db/queryAdapter.js](../server/db/queryAdapter.js).
- Backend code should use async DB helpers only.

## Change Rules

- Add schema changes through a new migration, not ad hoc SQL in route files.
- If a migration changes API behavior or business rules, update [../ROUTES.md](../ROUTES.md) and [business-logic.md](business-logic.md) as needed.
