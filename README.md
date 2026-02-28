# BARMAN STORE REACT

Full-stack store, billing, purchase, credit, and inventory management app built with React + Vite (frontend) and Node.js + Express + Supabase Postgres (backend).

## Tech Stack
- Frontend: React 18, React Router, Vite, Lucide React
- Backend: Node.js, Express, CORS, bcrypt
- Database: Supabase/Postgres via `pg` (legacy SQLite compatibility remains)

## Project Structure
- `src/` frontend source
- `server/index.js` API server and DB initialization
- `server/db/postgresScaffold.js` Supabase/Postgres connection scaffold
- `server/db/postgresBootstrap.js` Supabase/Postgres migrations/bootstrap helpers
- `supabase/migrations/` staged Supabase migration SQL
- `vite.config.js` Vite dev server config

## Prerequisites
- Node.js 18+
- npm

## Local Setup
1. Install dependencies
- `npm install`

2. Start backend (terminal 1)
- `npm run server`

3. Start frontend (terminal 2)
- `npm run dev`

4. Open app
- `http://localhost:3000/`

## LAN Setup
1. Start backend and frontend on the host machine.
2. Find host IP (Windows): `ipconfig`
3. Open from another device on same network:
- `http://<HOST_IP>/`
4. Allow firewall inbound ports:
- `3000` (frontend dev via Vite)
- `80` (frontend production via IIS/Nginx)
- `5000` (backend)

## Environment Variables
Supported by backend (`server/index.js`):

- `PORT`
  - Default: `5000`
  - Backend listen port
- `DB_EXECUTION_MODE`
  - Default: `postgres`
  - Database execution mode (`postgres`)
- `DB_CLIENT`
  - Default: `postgres`
  - Backward-compatible DB client selector (postgres aliases only)
- `SUPABASE_DB_URL`
  - Optional connection string for Supabase/Postgres
  - Used when `DB_EXECUTION_MODE=postgres`
- `SUPABASE_URL`
  - Supabase project URL (example: `https://<project-ref>.supabase.co`)
  - Required for Supabase Auth features
- `SUPABASE_ANON_KEY`
  - Supabase anon/public API key
  - Required for Supabase Auth client endpoints
- `SUPABASE_SERVICE_ROLE_KEY`
  - Optional Supabase service-role key for server-side admin auth operations
- `SUPABASE_AUTH_ENABLED`
  - Default: `false`
  - Enables Supabase OAuth/session integration when `true`
- `SUPABASE_AUTH_MODE`
  - Default: `hybrid`
  - `hybrid` or `strict` for Supabase-backed auth/session behavior
- `SUPABASE_EMAIL_VERIFY_REDIRECT`
  - Optional URL used by Supabase signup verification emails
- `POSTGRES_MIGRATIONS_DIR`
  - Default: `supabase/migrations`
  - Directory scanned for `.sql` migrations in Postgres mode
- `PG_SSL`
  - Default: `true` for Supabase connection strings
  - Enables TLS for Postgres connections
- `PG_SSL_REJECT_UNAUTHORIZED`
  - Default: `false`
  - TLS certificate verification switch for Postgres mode
- `PG_POOL_LIMIT`
  - Default: `10`
  - Connection pool size for Postgres mode
- `FRONTEND_ORIGIN`
  - Optional CORS allowlist, supports comma-separated origins
  - Example: `http://localhost:3000,http://127.0.0.1,http://192.168.1.20:3000`
- `BCRYPT_SALT_ROUNDS`
  - Default: `10`
  - Password hashing cost

Notes:
- Backend and DB helper scripts auto-load project env files (`.env`, `.env.local`, `.env.<NODE_ENV>`, `.env.<NODE_ENV>.local`).
- Shell-defined environment variables still take priority over file values.
- Secrets must never be committed. Keep real values only in deployment/runtime environment variables.

## Scripts
- `npm run dev` start Vite dev server
- `npm run server` start Express API server
- `npm run build` build frontend
- `npm run preview` preview frontend build
- `npm run db:supabase:check` verify Supabase/Postgres connectivity (reads `DB_EXECUTION_MODE` from env files)
- `npm run db:supabase:migrate` apply staged Supabase/Postgres SQL migrations (reads `DB_EXECUTION_MODE` from env files)
- `npm run hooks:install` configure git hooks at `.githooks/`
- `npm run secrets:scan:staged` scan staged files for secrets (used by pre-commit hook)
- `npm run secrets:scan` scan tracked repository files for secrets (used by pre-push + CI)
- `docs/SUPABASE_MIGRATION_START.md` Supabase migration runbook
- `docs/WINDOWS_BAT_WORKFLOWS.md` Windows `.bat` automation guide (git/health/deploy)

## Secret Protection Guardrails
- Local hooks are configured via `core.hooksPath=.githooks`.
- `pre-commit` blocks commits containing potential secrets.
- `pre-push` blocks pushes containing potential secrets.
- CI runs `.github/workflows/secret-scan.yml` using both Gitleaks and repo policy checks.

Recommended account settings:
- Enable GitHub Secret Scanning + Push Protection for this repository/org.
- Protect `main` branch and require status checks (including `Secret Scan`) before merge.

## Auth Model
- Password login and password reset are disabled.
- Supported sign-in methods:
  - OTP login (`email` only)
  - OAuth login (Supabase social providers when configured)

## API Reference
Base URL: `http://localhost:5000`

### System
- `GET /` API status
- `POST /api/notify-order/:orderId`

### Auth
- `POST /api/auth/otp/request`
- `POST /api/auth/otp/verify`
- `GET /api/auth/session`

### Users and Customers
- `GET /api/users`
- `GET /api/users/:id`
- `POST /api/users`
- `PUT /api/users/:id`
- `DELETE /api/users/:id`
- `GET /api/customers`
- `GET /api/customers/search`
- `GET /api/customers/:id/profile`

### Products and Categories
- `GET /api/products`
- `GET /api/products/:id`
- `GET /api/products/category/:category`
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`
- `GET /api/categories`
- `POST /api/categories`
- `PUT /api/categories/:id`
- `DELETE /api/categories/:id`

### Orders
- `GET /api/orders`
- `GET /api/orders/:id`
- `GET /api/orders/:id/history`
- `GET /api/orders/number/:orderNumber`
- `GET /api/users/:userId/orders`
- `POST /api/orders` (deprecated/disabled, returns `410`)
- `POST /api/orders/create-validated`
- `POST /api/orders/validate-customer`
- `PUT /api/orders/:id/status`

Order flow constraints:
- Only `ordered` -> `received` transitions are supported.
- Payment mode is cash-on-delivery (`cash`) with no online payment activity.
- Payment status is tracked as record state (`pending`/`paid`) only.

### Stats
- `GET /api/stats/orders`

### Credit
- `GET /api/users/:userId/credit-history`
- `GET /api/users/:userId/credit-balance`
- `POST /api/users/:userId/credit`
- `POST /api/credit/check-limit`
- `GET /api/credit/aging`

### Distributors
- `GET /api/distributors`
- `GET /api/distributors/:id`
- `POST /api/distributors`
- `PUT /api/distributors/:id`
- `DELETE /api/distributors/:id`

### Purchase Orders
- `GET /api/purchase-orders`
- `GET /api/purchase-orders/:id`
- `POST /api/purchase-orders`
- `PUT /api/purchase-orders/:id`
- `PUT /api/purchase-orders/:id/status`
- `POST /api/purchase-orders/:id/receive`
- `DELETE /api/purchase-orders/:id`

### Purchase Returns
- `GET /api/purchase-returns`
- `GET /api/purchase-returns/:id`
- `POST /api/purchase-returns`
- `PUT /api/purchase-returns/:id`
- `DELETE /api/purchase-returns/:id`

### Stock
- `GET /api/stock-ledger`
- `GET /api/stock-ledger/product/:productId`
- `GET /api/stock-ledger/batch/:batchNumber`
- `GET /api/stock-ledger/summary`
- `POST /api/stock/verify`

### Billing
- `GET /api/billing/customers/search`
- `GET /api/billing/products/search`
- `POST /api/bills/create`
- `GET /api/bills`
- `GET /api/bills/:id`
- `PUT /api/bills/:id/payment`
- `GET /api/bills/stats/summary`
- `GET /api/users/:userId/bills`
- `GET /api/users/:userId/bills/:identifier`

### Customer Requests
- `POST /api/product-recommendations`
- `GET /api/product-recommendations/mine`
- `GET /api/admin/product-recommendations`
- `PUT /api/admin/product-recommendations/:id`

### Credit Entry Issues
- `POST /api/users/:userId/credit-issues`
- `GET /api/users/:userId/credit-issues`
- `GET /api/admin/credit-issues`
- `PUT /api/admin/credit-issues/:id`

### Offers
- `GET /api/offers`
- `POST /api/offers`
- `PUT /api/offers/:id`
- `DELETE /api/offers/:id`

### Placeholder / Stub Endpoints
(Currently return empty/default responses in backend)
- `GET /api/product-versions/:internalId`
- `GET /api/product-versions/sku/:sku`
- `GET /api/uom-conversions/:productId`
- `POST /api/uom-conversions`
- `DELETE /api/uom-conversions/:id`
- `GET /api/batch-stock`
- `POST /api/batch-stock`

## Production Deployment

### Option 1: Same machine, static frontend + Node backend
1. Build frontend
- `npm run build`

2. Serve `dist/` with Nginx/IIS/Apache, or Vite preview (not recommended for production)
- `npm run preview`

3. Run backend on host
- `node server/index.js`

### Option 2: Ready config files in this repo
- IIS rewrite template: `public/web.config` (copied to `dist/web.config` on build)
- Nginx site config template: `nginx/barman-store.conf`

### Option 3: Windows Service (backend)
Use NSSM to run Node backend as service.

1. Install NSSM
2. Create service:
- Application: `node.exe`
- Arguments: `server/index.js`
- Startup dir: project root
3. Set environment variables (`PORT`, `DB_EXECUTION_MODE`, `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_AUTH_ENABLED`, `PG_SSL`, `PG_SSL_REJECT_UNAUTHORIZED`, `FRONTEND_ORIGIN`) in service config.
4. Start service and configure auto-start.

### Option 4: Windows Installer (`Setup.exe`) flow
Typical packaging flow:
1. Build frontend (`dist`)
2. Package backend runtime (plain Node app or bundled exe)
3. Use Inno Setup / NSIS / WiX to create installer
4. Installer should:
- copy app files
- configure/start backend service
- create shortcuts
- add uninstall entry

## Operational Notes
- Ensure Supabase/Postgres credentials and network access are configured for the backend runtime.
- Use regular Postgres dumps/restores for database backup and disaster recovery.
- If running over LAN, set `FRONTEND_ORIGIN` to allowed hosts for stricter CORS.
- Frontend routes include public pages and admin views; admin access is role-based.

## Security, Trust, and Liability Notes
- Keep all secrets only in environment variables (never in git), and rotate immediately if exposure is suspected.
- Keep GitHub secret scanning + push protection enabled to block accidental secret pushes server-side.
- Enforce TLS/HTTPS in production for all auth/session traffic.
- OTP delivery reliability depends on external provider configuration (Supabase + SMTP provider).
- Cash collection and credit entries are business records; provide clear correction workflow (customer issue report + admin resolution).
- Add/update your customer-facing privacy policy, refund policy, and terms of service to match your local legal requirements before production use.

