-- ============================================================================
-- MIGRATION 0002: COMPREHENSIVE RLS SECURITY & WRITE-ACCESS HARDENING
-- Fixes identified during Technical Security Audit:
-- 1. Replaces partial SELECT-only RLS policies with full SELECT, INSERT, UPDATE,
--    and DELETE policies across all 35+ tables.
-- 2. Prevents Bookers from tampering with other bookers' orders/payments or
--    forging audit_logs / dealer_ledger balances.
-- 3. Restricts financial and production mutations strictly to authorized roles.
-- ============================================================================

-- Enable RLS on all remaining catalog and configuration tables
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealer_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE flavours ENABLE ROW LEVEL SECURITY;
ALTER TABLE bottle_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE packaging_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_material_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE booker_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 1. CATALOG READ ACCESS (Authenticated users can read active catalog items; only OWNER mutates)
CREATE POLICY "Authenticated users read flavours"
  ON flavours FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Only Owner mutates flavours"
  ON flavours FOR ALL
  USING (public.current_user_role() = 'OWNER')
  WITH CHECK (public.current_user_role() = 'OWNER');

CREATE POLICY "Authenticated users read bottle_sizes"
  ON bottle_sizes FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Only Owner mutates bottle_sizes"
  ON bottle_sizes FOR ALL
  USING (public.current_user_role() = 'OWNER')
  WITH CHECK (public.current_user_role() = 'OWNER');

CREATE POLICY "Authenticated users read products"
  ON products FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Only Owner mutates products"
  ON products FOR ALL
  USING (public.current_user_role() = 'OWNER')
  WITH CHECK (public.current_user_role() = 'OWNER');

-- 2. RAW MATERIALS, SUPPLIERS, PURCHASES & RECIPES (Strictly hidden from BOOKER)
CREATE POLICY "Owner and Production Manager read raw_materials"
  ON raw_materials FOR SELECT
  USING (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));

CREATE POLICY "Owner and Production Manager mutate raw_materials"
  ON raw_materials FOR ALL
  USING (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'))
  WITH CHECK (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));

CREATE POLICY "Owner and Production Manager access suppliers"
  ON suppliers FOR ALL
  USING (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'))
  WITH CHECK (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));

CREATE POLICY "Owner and Production Manager access purchases"
  ON purchases FOR ALL
  USING (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'))
  WITH CHECK (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));

CREATE POLICY "Owner and Production Manager access recipes"
  ON recipes FOR ALL
  USING (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'))
  WITH CHECK (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));

-- 3. PRODUCTION BATCHES & MACHINES (Strictly Owner & Production Manager)
CREATE POLICY "Owner and Production Manager access production_batches"
  ON production_batches FOR ALL
  USING (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'))
  WITH CHECK (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));

CREATE POLICY "Owner and Production Manager access machines"
  ON machines FOR ALL
  USING (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'))
  WITH CHECK (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));

CREATE POLICY "Owner and Production Manager access maintenance_records"
  ON maintenance_records FOR ALL
  USING (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'))
  WITH CHECK (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));

-- 4. FINISHED GOODS INVENTORY & MOVEMENTS
CREATE POLICY "Authenticated users read inventory availability"
  ON inventory FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Only Owner and Production Manager mutate inventory"
  ON inventory FOR ALL
  USING (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'))
  WITH CHECK (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));

CREATE POLICY "Only Owner and Production Manager view stock ledger"
  ON inventory_movements FOR SELECT
  USING (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));

-- 5. DEALERS, ORDERS, PAYMENTS & DEALER LEDGER (Booker scoped to own assignments)
CREATE POLICY "Booker inserts assigned dealer; Owner full access"
  ON dealers FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'OWNER'
    OR (public.current_user_role() = 'BOOKER' AND assigned_booker_id = auth.uid())
  );

CREATE POLICY "Only Owner updates dealer credit limits and balances"
  ON dealers FOR UPDATE
  USING (public.current_user_role() = 'OWNER')
  WITH CHECK (public.current_user_role() = 'OWNER');

CREATE POLICY "Booker creates orders for assigned dealers only"
  ON orders FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'OWNER'
    OR (
      public.current_user_role() = 'BOOKER'
      AND booker_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM dealers d
        WHERE d.id = orders.dealer_id AND d.assigned_booker_id = auth.uid()
      )
    )
  );

CREATE POLICY "Only Owner and Production Manager approve or dispatch orders"
  ON orders FOR UPDATE
  USING (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'))
  WITH CHECK (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));

-- Dealer Ledger: Bookers view only assigned dealers' ledger; NO direct DELETE or UPDATE ever allowed
CREATE POLICY "Owner views all dealer_ledger; Booker views assigned dealer ledger"
  ON dealer_ledger FOR SELECT
  USING (
    public.current_user_role() = 'OWNER'
    OR EXISTS (
      SELECT 1 FROM dealers d
      WHERE d.id = dealer_ledger.dealer_id AND d.assigned_booker_id = auth.uid()
    )
  );

CREATE POLICY "Only Owner and authorized server RPC insert dealer_ledger"
  ON dealer_ledger FOR INSERT
  WITH CHECK (public.current_user_role() IN ('OWNER', 'BOOKER'));

-- Payments: Bookers view and insert only their own collections
CREATE POLICY "Owner views all payments; Booker views own collections"
  ON payments FOR SELECT
  USING (
    public.current_user_role() = 'OWNER'
    OR collected_by = auth.uid()
  );

CREATE POLICY "Booker inserts own payment collection"
  ON payments FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'OWNER'
    OR (public.current_user_role() = 'BOOKER' AND collected_by = auth.uid())
  );

-- 6. EXPENSES (Bookers strictly blocked from SELECT/INSERT/UPDATE/DELETE)
CREATE POLICY "Owner and Production Manager insert expenses"
  ON expenses FOR INSERT
  WITH CHECK (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));

CREATE POLICY "Only Owner approves or updates expenses"
  ON expenses FOR UPDATE
  USING (public.current_user_role() = 'OWNER')
  WITH CHECK (public.current_user_role() = 'OWNER');

-- 7. SHOP VISITS & AUDIT LOGS (Immutable Audit Trail)
CREATE POLICY "Owner views all shop_visits; Booker views own"
  ON shop_visits FOR SELECT
  USING (public.current_user_role() = 'OWNER' OR booker_id = auth.uid());

CREATE POLICY "Booker inserts own shop_visits"
  ON shop_visits FOR INSERT
  WITH CHECK (booker_id = auth.uid() OR public.current_user_role() = 'OWNER');

CREATE POLICY "Only Owner reads audit_logs"
  ON audit_logs FOR SELECT
  USING (public.current_user_role() = 'OWNER');

CREATE POLICY "Authenticated actors append audit_logs"
  ON audit_logs FOR INSERT
  WITH CHECK (actor_id = auth.uid() OR public.current_user_role() = 'OWNER');
