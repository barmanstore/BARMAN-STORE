-- Enable Row Level Security (RLS) on all public tables flagged by Supabase lints.
-- The app reads/writes through the backend API using direct Postgres connections.
-- Client-facing PostgREST access should stay denied by default.

ALTER TABLE IF EXISTS public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.auth_login_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.batch_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contact_verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.credit_entry_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.credit_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.distributor_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.distributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.email_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notification_send_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.password_reset_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.password_reset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.password_reset_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.phone_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.phone_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.purchase_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.purchase_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.visitor_sessions ENABLE ROW LEVEL SECURITY;

-- Ensure API roles cannot directly read/write public tables or sequences.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Keep future objects private by default for API roles.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
