# Supabase Migration Start Guide

This repository now supports staged `DB_EXECUTION_MODE=postgres` for Supabase/Postgres.

## 1. Install dependency

```bash
npm install pg
```

## 2. Create Supabase project

Create a new Supabase project (staging first), then copy the direct database connection string.

Set env values:

```env
DB_CLIENT=postgres
DB_EXECUTION_MODE=postgres
SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
POSTGRES_FALLBACK_URL=postgresql://postgres:<local-password>@127.0.0.1:5432/barmanstore
POSTGRES_MIGRATIONS_DIR=supabase/migrations
PG_SSL=true
PG_SSL_REJECT_UNAUTHORIZED=false
PG_POOL_LIMIT=10
```

Notes:

- `SUPABASE_DB_URL` is preferred.
- `POSTGRES_FALLBACK_URL` is optional and lets local runtime startup fall back to a local Postgres database when the primary Supabase connection is unavailable.
- You can also use standard `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`.

## 3. Apply initial schema

Recommended (project script):

```bash
npm run db:supabase:migrate
```

Alternative using Supabase CLI:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

## 4. Validate DB connectivity

```bash
npm run db:supabase:check
```

Expected output:

```txt
[DB] Postgres/Supabase check passed (...)
```

## 5. Start API in postgres mode

```bash
npm run server
```

On startup you should see:

```txt
[DB] Postgres/Supabase connected (...)
[DB] Postgres migrations ... (applied or up-to-date)
[DB] Postgres schema/bootstrap completed
```

## 6. Staged rollout recommendation

1. Keep old production backend live.
2. Run Supabase backend in staging.
3. Compare API responses and business totals.
4. Switch frontend `VITE_API_BASE_URL` only after parity checks.
