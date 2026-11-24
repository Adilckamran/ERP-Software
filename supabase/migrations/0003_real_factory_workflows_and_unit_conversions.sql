-- ============================================================================
-- MIGRATION 0003: REAL-WORLD INDUSTRIAL FACTORY WORKFLOWS, UNIT CONVERSIONS,
--                 STOCK LEDGERS, AND PRODUCTION APPROVAL PIPELINE
-- ============================================================================

-- 1. Extend raw_materials to support full industrial units and ledger tracking
ALTER TABLE raw_materials DROP CONSTRAINT IF EXISTS raw_materials_unit_check;
ALTER TABLE raw_materials ADD CONSTRAINT raw_materials_unit_check CHECK (
  unit IN ('KG', 'GRAM', 'LITRE', 'ML', 'PIECES', 'PACKETS', 'CARTONS', 'kg', 'liter', 'piece', 'carton', 'roll', 'gram')
);

ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS opening_stock NUMERIC(14,4) NOT NULL DEFAULT 0;
ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS total_received NUMERIC(14,4) NOT NULL DEFAULT 0;
ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS total_consumed NUMERIC(14,4) NOT NULL DEFAULT 0;
ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS total_adjusted NUMERIC(14,4) NOT NULL DEFAULT 0;

-- 2. Material Purchases & Purchase Items (Invoice-based Stock Receipts)
CREATE TABLE IF NOT EXISTS material_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number TEXT NOT NULL,
  supplier_id UUID REFERENCES suppliers(id),
  supplier_name TEXT NOT NULL,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount NUMERIC(14,2) NOT NULL CHECK (total_amount >= 0),
  notes TEXT,
  entered_by UUID REFERENCES users(id),
  entered_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS material_purchase_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID NOT NULL REFERENCES material_purchases(id) ON DELETE CASCADE,
  raw_material_id UUID NOT NULL REFERENCES raw_materials(id),
  material_name TEXT NOT NULL,
  quantity_entered NUMERIC(14,4) NOT NULL CHECK (quantity_entered > 0),
  unit_entered TEXT NOT NULL,
  normalized_quantity NUMERIC(14,4) NOT NULL CHECK (normalized_quantity > 0),
  Canonical_unit TEXT NOT NULL,
  purchase_price NUMERIC(14,2) NOT NULL CHECK (purchase_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Stock Movements Ledger (Raw Materials)
-- Tracks Opening, Stock Received, Quantity Consumed, Adjustment, Closing, Reference, Entered By, Approved By
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  raw_material_id UUID NOT NULL REFERENCES raw_materials(id),
  material_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  opening_quantity NUMERIC(14,4) NOT NULL,
  stock_received NUMERIC(14,4) NOT NULL DEFAULT 0,
  quantity_consumed NUMERIC(14,4) NOT NULL DEFAULT 0,
  adjustment_quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
  closing_quantity NUMERIC(14,4) NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'PURCHASE_RECEIPT',
    'PRODUCTION_CONSUMPTION',
    'STOCK_ADJUSTMENT',
    'OPENING_BALANCE'
  )),
  reference_number TEXT NOT NULL,
  notes TEXT,
  entered_by TEXT NOT NULL,
  approved_by TEXT,
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Update production_batches for DRAFT -> SUBMITTED -> APPROVED / REJECTED workflow
ALTER TABLE production_batches DROP CONSTRAINT IF EXISTS production_batches_status_check;
ALTER TABLE production_batches ADD CONSTRAINT production_batches_status_check CHECK (
  status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'Planned', 'In Progress', 'Completed', 'On Hold', 'Rejected')
);

ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS target_bottles INTEGER NOT NULL DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS produced_bottles INTEGER NOT NULL DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS wastage_bottles INTEGER NOT NULL DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS submitted_by_name TEXT;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS approved_by_name TEXT;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- 5. Production Material Consumption per Batch (Explicit Manager Entry with Unit Conversion)
CREATE TABLE IF NOT EXISTS production_material_consumption (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
  raw_material_id UUID NOT NULL REFERENCES raw_materials(id),
  material_name TEXT NOT NULL,
  quantity_entered NUMERIC(14,4) NOT NULL CHECK (quantity_entered > 0),
  unit_entered TEXT NOT NULL,
  normalized_quantity_canonical NUMERIC(14,4) NOT NULL CHECK (normalized_quantity_canonical > 0),
  canonical_unit TEXT NOT NULL,
  unit_cost_snapshot NUMERIC(14,4) NOT NULL DEFAULT 0,
  total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Finished Goods Inventory (Supports both Bottles and Cartons)
CREATE TABLE IF NOT EXISTS finished_goods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID UNIQUE NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  flavour_name TEXT NOT NULL,
  bottle_size_label TEXT NOT NULL,
  units_per_carton INTEGER NOT NULL DEFAULT 24,
  opening_bottles INTEGER NOT NULL DEFAULT 0,
  produced_bottles INTEGER NOT NULL DEFAULT 0,
  dispatched_bottles INTEGER NOT NULL DEFAULT 0,
  damaged_bottles INTEGER NOT NULL DEFAULT 0,
  available_bottles INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finished_goods_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  bottle_size_label TEXT NOT NULL,
  opening_bottles INTEGER NOT NULL,
  bottles_added INTEGER NOT NULL DEFAULT 0,
  bottles_dispatched INTEGER NOT NULL DEFAULT 0,
  adjustment_bottles INTEGER NOT NULL DEFAULT 0,
  closing_bottles INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'PRODUCTION_APPROVED',
    'DISPATCH_SALE',
    'AUTHORIZED_ADJUSTMENT'
  )),
  reference_number TEXT NOT NULL,
  entered_by TEXT NOT NULL,
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Strict Supabase RLS Policies for New Factory Tables
ALTER TABLE material_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_material_consumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE finished_goods ENABLE ROW LEVEL SECURITY;
ALTER TABLE finished_goods_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only Owner and Production Manager view material_purchases"
  ON material_purchases FOR SELECT
  USING (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));

CREATE POLICY "Only Owner inserts material_purchases"
  ON material_purchases FOR INSERT
  WITH CHECK (public.current_user_role() = 'OWNER');

CREATE POLICY "Owner and Production Manager view stock_movements"
  ON stock_movements FOR SELECT
  USING (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));

CREATE POLICY "Owner and Production Manager access production_material_consumption"
  ON production_material_consumption FOR ALL
  USING (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'))
  WITH CHECK (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));

CREATE POLICY "Authenticated users view finished_goods"
  ON finished_goods FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Owner and Production Manager view finished_goods_movements"
  ON finished_goods_movements FOR SELECT
  USING (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));
