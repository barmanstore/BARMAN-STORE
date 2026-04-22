-- Initial Postgres schema for staged Supabase migration.
-- Apply in a staging project first.

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'customer',
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  phone TEXT UNIQUE,
  phone_verified INTEGER NOT NULL DEFAULT 0,
  address TEXT,
  profile_image TEXT,
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  credit_limit NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  brand TEXT,
  sub_brand TEXT,
  content TEXT,
  color TEXT,
  price NUMERIC(12,2) NOT NULL,
  mrp NUMERIC(12,2),
  uom TEXT NOT NULL DEFAULT 'pcs',
  sku TEXT,
  barcode TEXT,
  image TEXT,
  stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  category TEXT NOT NULL,
  subcategory TEXT,
  expiry_date DATE,
  default_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_type TEXT NOT NULL DEFAULT 'fixed',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  order_number TEXT UNIQUE,
  user_id BIGINT,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  shipping_address TEXT,
  total_amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT NOT NULL DEFAULT 'cash',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  stock_applied INTEGER NOT NULL DEFAULT 0,
  credit_applied INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  total NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_history (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  description TEXT,
  reference TEXT,
  transaction_date DATE,
  created_by BIGINT,
  edited INTEGER NOT NULL DEFAULT 0,
  edited_at TIMESTAMPTZ,
  edited_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_ledger (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL,
  product_name TEXT,
  sku TEXT,
  transaction_type TEXT NOT NULL,
  quantity_change NUMERIC(12,3) NOT NULL,
  previous_balance NUMERIC(12,3) NOT NULL DEFAULT 0,
  new_balance NUMERIC(12,3) NOT NULL DEFAULT 0,
  reference_type TEXT,
  reference_id TEXT,
  user_id BIGINT,
  user_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS distributors (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  salesman_name TEXT,
  contacts TEXT,
  address TEXT,
  products_supplied TEXT,
  order_day TEXT,
  delivery_day TEXT,
  payment_terms TEXT NOT NULL DEFAULT 'Net 30',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS distributor_ledger (
  id BIGSERIAL PRIMARY KEY,
  distributor_id BIGINT NOT NULL,
  type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_mode TEXT,
  reference TEXT,
  bill_number TEXT,
  description TEXT,
  transaction_date DATE,
  source TEXT,
  source_id TEXT,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id BIGSERIAL PRIMARY KEY,
  po_number TEXT NOT NULL UNIQUE,
  distributor_id BIGINT NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  expected_delivery DATE,
  invoice_number TEXT,
  bill_number TEXT,
  stock_applied_on_confirm INTEGER NOT NULL DEFAULT 0,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  product_id BIGINT,
  product_name TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  received_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  uom TEXT NOT NULL DEFAULT 'pcs',
  unit_price NUMERIC(12,2) NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_type TEXT NOT NULL DEFAULT 'percent',
  discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  taxable_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id BIGSERIAL PRIMARY KEY,
  return_number TEXT NOT NULL UNIQUE,
  distributor_id BIGINT NOT NULL,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason TEXT,
  return_type TEXT NOT NULL DEFAULT 'return',
  reference_po TEXT,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id BIGSERIAL PRIMARY KEY,
  return_id BIGINT NOT NULL,
  product_id BIGINT,
  product_name TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  uom TEXT NOT NULL DEFAULT 'pcs',
  unit_price NUMERIC(12,2) NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS batch_stock (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL,
  batch_number TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  expiry_date DATE,
  unit_cost NUMERIC(12,2),
  received_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bills (
  id BIGSERIAL PRIMARY KEY,
  bill_number TEXT NOT NULL UNIQUE,
  customer_id BIGINT,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  credit_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  bill_type TEXT NOT NULL DEFAULT 'sales',
  notes TEXT,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bill_items (
  id BIGSERIAL PRIMARY KEY,
  bill_id BIGINT NOT NULL,
  product_id BIGINT,
  product_name TEXT NOT NULL,
  mrp NUMERIC(12,2) NOT NULL DEFAULT 0,
  qty NUMERIC(12,3) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pcs',
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  sender_id BIGINT NOT NULL,
  recipient_id BIGINT,
  subject TEXT,
  body TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT,
  email TEXT,
  phone TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  requested_from_ip TEXT,
  processed_by BIGINT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_otps (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT,
  phone TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  phone TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS phone_verification_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  phone TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contact_verification_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  request_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_from_ip TEXT,
  requested_by BIGINT,
  admin_note TEXT,
  prepared_event_id BIGINT,
  processed_by BIGINT,
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_events (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  recipient TEXT NOT NULL,
  recipient_user_id BIGINT,
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'prepared',
  error_message TEXT,
  metadata TEXT,
  prepared_by BIGINT,
  sent_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  status TEXT NOT NULL,
  description TEXT,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS offers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  value NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_quantity INTEGER NOT NULL DEFAULT 1,
  apply_to_category TEXT,
  apply_to_product BIGINT,
  buy_product_id BIGINT,
  buy_quantity INTEGER NOT NULL DEFAULT 1,
  get_product_id BIGINT,
  get_quantity INTEGER NOT NULL DEFAULT 1,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS import_batches (
  id BIGSERIAL PRIMARY KEY,
  batch_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  created_by BIGINT,
  payload TEXT NOT NULL,
  checksum TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'staged',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS visitor_sessions (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  user_id BIGINT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMPTZ,
  last_path TEXT,
  referrer TEXT,
  user_agent TEXT,
  ip_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_visitor_sessions_started_at ON visitor_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_last_seen_at ON visitor_sessions(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_user_id ON visitor_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_verification_requests_status ON contact_verification_requests(status);
CREATE INDEX IF NOT EXISTS idx_contact_verification_requests_user_type_created
  ON contact_verification_requests(user_id, request_type, created_at DESC);
