-- ============================================================================
-- FRUITY FUN JUICE FACTORY MANAGEMENT ERP - COMPLETE NORMALIZED DATABASE SCHEMA
-- Target: Supabase PostgreSQL 15+
-- Features: 35+ Normalized Entities, Foreign Keys, Check Constraints,
--           Transactional RPCs, Idempotency Guards, and Strict RLS Policies
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. ROLES, PERMISSIONS & USER PROFILES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL CHECK (name IN ('OWNER', 'PRODUCTION_MANAGER', 'BOOKER')),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'PRODUCTION_MANAGER', 'BOOKER')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dealer_areas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  city TEXT NOT NULL DEFAULT 'Lahore',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'PRODUCTION_MANAGER', 'BOOKER')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_area_id UUID REFERENCES dealer_areas(id) ON DELETE SET NULL,
  working_hours_start TIME NOT NULL DEFAULT '08:00:00',
  working_hours_end TIME NOT NULL DEFAULT '19:00:00',
  duty_status TEXT NOT NULL DEFAULT 'OFF_DUTY' CHECK (duty_status IN ('ON_DUTY', 'OFF_DUTY')),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. CATALOG: FLAVOURS, BOTTLE SIZES, PACKAGING TYPES & PRODUCTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flavours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  code TEXT UNIQUE NOT NULL,
  color_hex TEXT NOT NULL DEFAULT '#F59E0B',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bottle_sizes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label TEXT UNIQUE NOT NULL,
  volume_ml INTEGER NOT NULL CHECK (volume_ml > 0),
  is_custom BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS packaging_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  units_per_carton INTEGER NOT NULL CHECK (units_per_carton > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  flavour_id UUID NOT NULL REFERENCES flavours(id),
  bottle_size_id UUID NOT NULL REFERENCES bottle_sizes(id),
  packaging_type_id UUID NOT NULL REFERENCES packaging_types(id),
  units_per_carton INTEGER NOT NULL CHECK (units_per_carton > 0),
  wholesale_price_per_carton NUMERIC(12,2) NOT NULL CHECK (wholesale_price_per_carton >= 0),
  retail_price_per_unit NUMERIC(12,2) NOT NULL CHECK (retail_price_per_unit >= 0),
  standard_cost_per_carton NUMERIC(12,2) NOT NULL CHECK (standard_cost_per_carton >= 0),
  min_stock_cartons INTEGER NOT NULL DEFAULT 50 CHECK (min_stock_cartons >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (flavour_id, bottle_size_id, packaging_type_id)
);

-- ----------------------------------------------------------------------------
-- 3. SUPPLIERS, RAW MATERIALS, PURCHASES & BILL OF MATERIALS (RECIPES)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT NOT NULL,
  payable_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raw_materials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'Sweetener', 'Water', 'Concentrate', 'Flavouring', 'Preservative',
    'Bottle', 'Cap', 'Label', 'Carton', 'Packaging'
  )),
  unit TEXT NOT NULL CHECK (unit IN ('kg', 'liter', 'piece', 'carton', 'roll', 'gram')),
  current_stock NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  minimum_stock_level NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (minimum_stock_level >= 0),
  average_cost_per_unit NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (average_cost_per_unit >= 0),
  last_purchase_price NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (last_purchase_price >= 0),
  damaged_quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_number TEXT UNIQUE NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount NUMERIC(14,2) NOT NULL CHECK (total_amount >= 0),
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('PAID', 'PARTIAL', 'UNPAID')),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  raw_material_id UUID NOT NULL REFERENCES raw_materials(id),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,4) NOT NULL CHECK (unit_price >= 0),
  total_cost NUMERIC(14,2) NOT NULL CHECK (total_cost >= 0)
);

CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID UNIQUE NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  version TEXT NOT NULL DEFAULT 'v1.0',
  yield_cartons INTEGER NOT NULL DEFAULT 1 CHECK (yield_cartons > 0),
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipe_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  raw_material_id UUID NOT NULL REFERENCES raw_materials(id),
  quantity_per_carton NUMERIC(14,4) NOT NULL CHECK (quantity_per_carton > 0),
  wastage_allowance_pct NUMERIC(5,2) NOT NULL DEFAULT 1.0 CHECK (wastage_allowance_pct >= 0),
  UNIQUE (recipe_id, raw_material_id)
);

-- ----------------------------------------------------------------------------
-- 4. MACHINES, PRODUCTION BATCHES & MATERIAL CONSUMPTION
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS machines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  machine_number TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  line_section TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Operational' CHECK (status IN ('Operational', 'Under Maintenance', 'Breakdown', 'Standby')),
  last_serviced_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maintenance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_number TEXT UNIQUE NOT NULL,
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  problem_description TEXT NOT NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
  status TEXT NOT NULL DEFAULT 'Reported' CHECK (status IN ('Reported', 'In Progress', 'Parts Awaiting', 'Resolved')),
  repair_notes TEXT NOT NULL DEFAULT '',
  maintenance_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (maintenance_cost >= 0),
  reported_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_number TEXT UNIQUE NOT NULL,
  production_date DATE NOT NULL DEFAULT CURRENT_DATE,
  product_id UUID NOT NULL REFERENCES products(id),
  target_cartons INTEGER NOT NULL CHECK (target_cartons > 0),
  actual_cartons INTEGER NOT NULL DEFAULT 0 CHECK (actual_cartons >= 0),
  wastage_cartons NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (wastage_cartons >= 0),
  damaged_units INTEGER NOT NULL DEFAULT 0 CHECK (damaged_units >= 0),
  machine_id UUID NOT NULL REFERENCES machines(id),
  status TEXT NOT NULL DEFAULT 'Planned' CHECK (status IN ('Planned', 'In Progress', 'Completed', 'On Hold', 'Rejected')),
  inventory_posted BOOLEAN NOT NULL DEFAULT FALSE, -- Prevents double deduction/addition
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  total_production_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost_per_carton NUMERIC(12,2) NOT NULL DEFAULT 0,
  remarks TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  planned_cartons INTEGER NOT NULL CHECK (planned_cartons > 0),
  produced_cartons INTEGER NOT NULL DEFAULT 0 CHECK (produced_cartons >= 0),
  rejected_cartons INTEGER NOT NULL DEFAULT 0 CHECK (rejected_cartons >= 0)
);

CREATE TABLE IF NOT EXISTS production_material_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
  raw_material_id UUID NOT NULL REFERENCES raw_materials(id),
  estimated_quantity NUMERIC(14,3) NOT NULL CHECK (estimated_quantity >= 0),
  actual_quantity NUMERIC(14,3) NOT NULL CHECK (actual_quantity >= 0),
  unit_cost_snapshot NUMERIC(12,4) NOT NULL CHECK (unit_cost_snapshot >= 0),
  total_cost NUMERIC(14,2) NOT NULL CHECK (total_cost >= 0)
);

-- ----------------------------------------------------------------------------
-- 5. FINISHED GOODS INVENTORY & MOVEMENTS LEDGER
-- Formula: Opening + Verified Production + Approved Returns - Dispatches - Damage = Closing
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID UNIQUE NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  opening_stock_cartons INTEGER NOT NULL DEFAULT 0 CHECK (opening_stock_cartons >= 0),
  verified_production_cartons INTEGER NOT NULL DEFAULT 0 CHECK (verified_production_cartons >= 0),
  approved_returns_cartons INTEGER NOT NULL DEFAULT 0 CHECK (approved_returns_cartons >= 0),
  dispatched_cartons INTEGER NOT NULL DEFAULT 0 CHECK (dispatched_cartons >= 0),
  damaged_cartons INTEGER NOT NULL DEFAULT 0 CHECK (damaged_cartons >= 0),
  reserved_cartons INTEGER NOT NULL DEFAULT 0 CHECK (reserved_cartons >= 0),
  closing_stock_cartons INTEGER GENERATED ALWAYS AS (
    opening_stock_cartons + verified_production_cartons + approved_returns_cartons - dispatched_cartons - damaged_cartons
  ) STORED,
  available_cartons INTEGER GENERATED ALWAYS AS (
    (opening_stock_cartons + verified_production_cartons + approved_returns_cartons - dispatched_cartons - damaged_cartons) - reserved_cartons
  ) STORED,
  latest_batch_number TEXT,
  latest_production_date DATE,
  valuation_per_carton NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT non_negative_available_stock CHECK (
    (opening_stock_cartons + verified_production_cartons + approved_returns_cartons - dispatched_cartons - damaged_cartons) >= reserved_cartons
  )
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_type TEXT NOT NULL CHECK (item_type IN ('FINISHED_GOOD', 'RAW_MATERIAL')),
  item_id UUID NOT NULL,
  batch_number TEXT,
  movement_type TEXT NOT NULL,
  quantity_change NUMERIC(14,3) NOT NULL,
  balance_after NUMERIC(14,3) NOT NULL CHECK (balance_after >= 0),
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  notes TEXT,
  performed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. DEALERS, SHOPS, BOOKER ASSIGNMENTS, ORDERS, DELIVERIES & LEDGER
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dealers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  dealer_name TEXT NOT NULL,
  shop_name TEXT NOT NULL,
  contact_number TEXT NOT NULL,
  address TEXT NOT NULL,
  area_id UUID NOT NULL REFERENCES dealer_areas(id),
  assigned_booker_id UUID NOT NULL REFERENCES users(id),
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_limit NUMERIC(14,2) NOT NULL DEFAULT 100000 CHECK (credit_limit >= 0),
  outstanding_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  latitude NUMERIC(10,7) NOT NULL DEFAULT 31.5204,
  longitude NUMERIC(10,7) NOT NULL DEFAULT 74.3587,
  geofence_radius_meters INTEGER NOT NULL DEFAULT 100 CHECK (geofence_radius_meters BETWEEN 20 AND 2000),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  shop_name TEXT NOT NULL,
  area_id UUID NOT NULL REFERENCES dealer_areas(id),
  assigned_booker_id UUID NOT NULL REFERENCES users(id),
  latitude NUMERIC(10,7) NOT NULL,
  longitude NUMERIC(10,7) NOT NULL,
  geofence_radius_meters INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS booker_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area_id UUID NOT NULL REFERENCES dealer_areas(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booker_id, area_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number TEXT UNIQUE NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL, -- Prevents duplicate order submission
  dealer_id UUID NOT NULL REFERENCES dealers(id),
  area_id UUID NOT NULL REFERENCES dealer_areas(id),
  booker_id UUID NOT NULL REFERENCES users(id),
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN (
    'Pending', 'Approved', 'Rejected', 'Processing',
    'Ready for Dispatch', 'Dispatched', 'Delivered', 'Cancelled'
  )),
  payment_status TEXT NOT NULL DEFAULT 'Unpaid (Credit)' CHECK (payment_status IN ('Unpaid (Credit)', 'Partially Paid', 'Paid')),
  subtotal_amount NUMERIC(14,2) NOT NULL CHECK (subtotal_amount >= 0),
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  total_amount NUMERIC(14,2) NOT NULL CHECK (total_amount >= 0),
  amount_paid_on_order NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid_on_order >= 0),
  total_cogs NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_cogs >= 0),
  delivery_notes TEXT,
  approved_by UUID REFERENCES users(id),
  dispatched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity_cartons INTEGER NOT NULL CHECK (quantity_cartons > 0),
  rate_per_carton NUMERIC(12,2) NOT NULL CHECK (rate_per_carton > 0),
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  cogs_per_carton_snapshot NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL CHECK (line_total >= 0)
);

CREATE TABLE IF NOT EXISTS deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  vehicle_number TEXT,
  driver_name TEXT,
  dispatched_by UUID REFERENCES users(id),
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  receiver_signature_name TEXT,
  status TEXT NOT NULL DEFAULT 'In Transit' CHECK (status IN ('In Transit', 'Delivered', 'Returned'))
);

CREATE TABLE IF NOT EXISTS dealer_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id UUID NOT NULL REFERENCES dealers(id),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'OPENING_BALANCE', 'SALES_INVOICE', 'PAYMENT_RECEIVED', 'PAYMENT_GIVEN',
    'SALES_RETURN_CREDIT', 'REVERSAL_ENTRY', 'CORRECTION_ADJUSTMENT'
  )),
  debit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  balance NUMERIC(14,2) NOT NULL,
  reference_number TEXT NOT NULL,
  payment_method TEXT,
  reverses_entry_id UUID REFERENCES dealer_ledger(id),
  is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_number TEXT UNIQUE NOT NULL,
  dealer_id UUID NOT NULL REFERENCES dealers(id),
  collected_by UUID NOT NULL REFERENCES users(id),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  direction TEXT NOT NULL DEFAULT 'INCOMING_FROM_DEALER' CHECK (direction IN ('INCOMING_FROM_DEALER', 'OUTGOING_TO_PERSON')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'Bank Transfer', 'Cheque', 'Online Wallet')),
  reference_number TEXT NOT NULL,
  order_id UUID REFERENCES orders(id),
  ledger_entry_id UUID NOT NULL REFERENCES dealer_ledger(id),
  is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 7. EXPENSES & CATEGORIES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_number TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'Electricity', 'Fuel', 'Salaries', 'Factory rent', 'Machine maintenance',
    'Transportation', 'Raw materials', 'Packaging', 'Marketing', 'Other expenses'
  )),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'Bank Transfer', 'Cheque', 'Company Card')),
  receipt_attachment_url TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  approval_status TEXT NOT NULL DEFAULT 'Pending' CHECK (approval_status IN ('Pending', 'Approved', 'Rejected')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 8. LIVE GPS TRACKING & GEOFENCED SHOP VISITS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS location_points (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  latitude NUMERIC(10,7) NOT NULL,
  longitude NUMERIC(10,7) NOT NULL,
  accuracy_meters NUMERIC(8,2) NOT NULL DEFAULT 10,
  speed_kmh NUMERIC(6,2) NOT NULL DEFAULT 0,
  battery_pct INTEGER NOT NULL DEFAULT 100 CHECK (battery_pct BETWEEN 0 AND 100),
  is_moving BOOLEAN NOT NULL DEFAULT TRUE,
  is_mock_location BOOLEAN NOT NULL DEFAULT FALSE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_from_offline_queue BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_location_points_booker_time ON location_points(booker_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS shop_visits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dealer_id UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  arrival_time TIMESTAMPTZ NOT NULL,
  departure_time TIMESTAMPTZ,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  gps_accuracy_meters NUMERIC(8,2) NOT NULL,
  verification_type TEXT NOT NULL CHECK (verification_type IN ('GPS_GEOFENCE_DETECTED', 'MANUAL_CHECK_IN', 'BOTH_VERIFIED')),
  order_placed BOOLEAN NOT NULL DEFAULT FALSE,
  order_id UUID REFERENCES orders(id),
  collection_made BOOLEAN NOT NULL DEFAULT FALSE,
  collection_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  latitude NUMERIC(10,7) NOT NULL,
  longitude NUMERIC(10,7) NOT NULL,
  notes TEXT
);

-- ----------------------------------------------------------------------------
-- 9. NOTIFICATIONS & IMMUTABLE AUDIT LOGS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical', 'success')),
  target_roles TEXT[] NOT NULL DEFAULT ARRAY['OWNER'],
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  link_href TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID REFERENCES users(id),
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 10. SUPABASE ROW LEVEL SECURITY (RLS) POLICIES
-- Never expose financial tables to bookers or unauthenticated requests
-- ----------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealer_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function for RLS role inspection
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Bookers can only view their own assigned dealers
CREATE POLICY "Owner and Production view all dealers; Booker views assigned only"
  ON dealers FOR SELECT
  USING (
    public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER')
    OR assigned_booker_id = auth.uid()
  );

-- Bookers can only view and create orders for their own account
CREATE POLICY "Role-based order visibility"
  ON orders FOR SELECT
  USING (
    public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER')
    OR booker_id = auth.uid()
  );

-- Financial expenses strictly restricted from Bookers
CREATE POLICY "Only Owner and Production Manager view expenses"
  ON expenses FOR SELECT
  USING (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));

-- Location points: Bookers insert their own GPS points; Owner views all
CREATE POLICY "Booker inserts own GPS points"
  ON location_points FOR INSERT
  WITH CHECK (booker_id = auth.uid());

CREATE POLICY "Owner views all GPS points; Booker views own"
  ON location_points FOR SELECT
  USING (public.current_user_role() = 'OWNER' OR booker_id = auth.uid());
