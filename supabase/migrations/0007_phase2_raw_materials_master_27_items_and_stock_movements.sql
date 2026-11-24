-- ============================================================================
-- MIGRATION 0007: PHASE 2 — COMPLETE INVENTORY & 27 RAW MATERIALS MASTER,
--                 CONFIGURABLE UNIT CONVERSIONS, OPENING STOCK LOCK,
--                 LEDGER-DERIVED STOCK BALANCES, AND OWNER STOCK ADJUSTMENTS
-- ============================================================================
-- Preserves historical migrations 0001 through 0006 without destructive changes.
-- Enforces:
-- 1. All 27 exact Fruity Fun Juice Factory raw materials seeded with 0 opening
--    stock and 0 minimum stock threshold (no fake/invented quantities).
-- 2. Allowed units and optional configurable box_to_piece_factor on raw_materials.
-- 3. opening_stock_set lock flag so opening stock can only be entered once per
--    material by the Owner (corrections require an auditable adjustment).
-- 4. Permanent stock_movements ledger recording previous_stock, quantity_added,
--    quantity_deducted, updated_stock, movement_type, reference_number, and user.
-- 5. Strict Supabase RLS preventing managers from modifying opening stock,
--    minimum stock thresholds, or stock adjustments, and blocking all deletions.
-- ============================================================================

-- 1. Extend raw_materials table for Phase 2 requirements
ALTER TABLE raw_materials
  ADD COLUMN IF NOT EXISTS allowed_units TEXT[] NOT NULL DEFAULT ARRAY['KG'],
  ADD COLUMN IF NOT EXISTS opening_stock_set BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS opening_stock_date DATE,
  ADD COLUMN IF NOT EXISTS box_to_piece_factor NUMERIC(14,4) CHECK (box_to_piece_factor IS NULL OR box_to_piece_factor > 0);

-- Relax category constraint on raw_materials so all 27 factory materials fit cleanly
ALTER TABLE raw_materials DROP CONSTRAINT IF EXISTS raw_materials_category_check;
ALTER TABLE raw_materials ADD CONSTRAINT raw_materials_category_check CHECK (
  category IN (
    'Chemical', 'Sweetener', 'Water', 'Concentrate', 'Flavouring', 'Preservative',
    'Bottle', 'Cap', 'Label', 'Carton', 'Packaging', 'Safety & Hygiene', 'Adhesive', 'Ingredients'
  )
);

-- 2. Extend stock_movements table for explicit quantity_added / quantity_deducted / previous_stock / updated_stock
ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS quantity_added NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (quantity_added >= 0),
  ADD COLUMN IF NOT EXISTS quantity_deducted NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (quantity_deducted >= 0),
  ADD COLUMN IF NOT EXISTS previous_stock NUMERIC(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_stock NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (updated_stock >= 0),
  ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES users(id);

ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_transaction_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_transaction_type_check CHECK (
  transaction_type IN (
    'OPENING_STOCK',
    'OPENING_BALANCE',
    'PURCHASE',
    'PURCHASE_RECEIPT',
    'PRODUCTION_CONSUMPTION',
    'STOCK_ADJUSTMENT',
    'STOCK_CORRECTION'
  )
);

-- 3. Strict RLS on raw_materials and stock_movements
-- Nobody can delete stock movements
DROP POLICY IF EXISTS "No user can delete stock_movements" ON stock_movements;
CREATE POLICY "No user can delete stock_movements"
  ON stock_movements FOR DELETE
  USING (FALSE);

-- Only Owner or System RPC mutates raw_materials directly; managers only add via purchase RPC
DROP POLICY IF EXISTS "Owner and Production Manager mutate raw_materials" ON raw_materials;
CREATE POLICY "Only Owner directly mutates raw_materials master"
  ON raw_materials FOR ALL
  USING (public.current_user_role() = 'OWNER')
  WITH CHECK (public.current_user_role() = 'OWNER');

-- 4. Seed the exact 27 Fruity Fun Juice Factory Raw Materials with 0 stock and 0 min threshold
INSERT INTO raw_materials (code, name, category, unit, allowed_units, opening_stock, current_stock, minimum_stock_level)
VALUES
  ('RM-01', 'Compound', 'Chemical', 'KG', ARRAY['KG', 'GRAM'], 0, 0, 0),
  ('RM-02', 'CMC', 'Chemical', 'KG', ARRAY['KG', 'GRAM'], 0, 0, 0),
  ('RM-03', 'Sugar', 'Sweetener', 'KG', ARRAY['KG', 'GRAM'], 0, 0, 0),
  ('RM-04', 'Xenthum gun', 'Chemical', 'KG', ARRAY['KG', 'GRAM'], 0, 0, 0),
  ('RM-05', 'Scotbic vtmc', 'Chemical', 'KG', ARRAY['KG', 'GRAM'], 0, 0, 0),
  ('RM-06', 'sitric acid', 'Chemical', 'KG', ARRAY['KG', 'GRAM'], 0, 0, 0),
  ('RM-07', 'sudiam sitret', 'Chemical', 'KG', ARRAY['KG', 'GRAM'], 0, 0, 0),
  ('RM-08', 'sudiam benziod', 'Preservative', 'KG', ARRAY['KG', 'GRAM'], 0, 0, 0),
  ('RM-09', 'palp', 'Concentrate', 'KG', ARRAY['KG', 'GRAM'], 0, 0, 0),
  ('RM-10', 'sheeling rapper', 'Packaging', 'KG', ARRAY['KG', 'GRAM'], 0, 0, 0),
  ('RM-11', 'sweetner', 'Sweetener', 'KG', ARRAY['KG', 'GRAM'], 0, 0, 0),
  ('RM-12', 'flavour', 'Flavouring', 'LITRE', ARRAY['ML', 'LITRE'], 0, 0, 0),
  ('RM-13', 'PH paper', 'Chemical', 'BOX', ARRAY['BOX'], 0, 0, 0),
  ('RM-14', 'Water', 'Water', 'LITRE', ARRAY['LITRE'], 0, 0, 0),
  ('RM-15', 'mask', 'Safety & Hygiene', 'BOX', ARRAY['BOX', 'PIECE'], 0, 0, 0),
  ('RM-16', 'cap', 'Cap', 'BOX', ARRAY['BOX', 'PIECE'], 0, 0, 0),
  ('RM-17', 'gluffs', 'Safety & Hygiene', 'BOX', ARRAY['BOX', 'PIECE'], 0, 0, 0),
  ('RM-18', 'rubber band', 'Packaging', 'PACKET', ARRAY['PACKET'], 0, 0, 0),
  ('RM-19', 'Glue stick', 'Adhesive', 'PACKET', ARRAY['PACKET'], 0, 0, 0),
  ('RM-20', 'liquid glue', 'Adhesive', 'KG', ARRAY['KG'], 0, 0, 0),
  ('RM-21', 'tray', 'Packaging', 'PIECE', ARRAY['PIECE'], 0, 0, 0),
  ('RM-22', 'shopper', 'Packaging', 'KG', ARRAY['KG', 'GRAM'], 0, 0, 0),
  ('RM-23', 'juice box', 'Packaging', 'PIECE', ARRAY['PIECE'], 0, 0, 0),
  ('RM-24', 'straw', 'Packaging', 'PIECE', ARRAY['PIECE'], 0, 0, 0),
  ('RM-25', 'tea bags', 'Ingredients', 'PACKET', ARRAY['PACKET'], 0, 0, 0),
  ('RM-26', 'milk', 'Ingredients', 'KG', ARRAY['KG'], 0, 0, 0),
  ('RM-27', 'green tea', 'Ingredients', 'PACKET', ARRAY['PACKET'], 0, 0, 0)
ON CONFLICT (name) DO NOTHING;

-- 5. Atomic Owner-Only Opening Stock Entry RPC (Prevents duplicate overwrite)
CREATE OR REPLACE FUNCTION public.rpc_owner_set_opening_stock(
  p_material_id UUID,
  p_opening_quantity NUMERIC,
  p_unit TEXT,
  p_opening_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT 'Initial Opening Stock'
)
RETURNS public.raw_materials AS $$
DECLARE
  v_actor_id UUID;
  v_actor_role TEXT;
  v_actor_name TEXT;
  v_rm public.raw_materials;
  v_normalized_qty NUMERIC(14,4);
  v_new_stock NUMERIC(14,4);
BEGIN
  v_actor_id := public.current_app_user_id();
  v_actor_role := public.current_user_role();

  IF v_actor_id IS NULL OR v_actor_role <> 'OWNER' THEN
    RAISE EXCEPTION 'Forbidden: Only the Owner (Sikandar Raja) can enter opening stock.';
  END IF;

  IF p_opening_quantity IS NULL OR p_opening_quantity < 0 THEN
    RAISE EXCEPTION 'Opening stock quantity cannot be negative.';
  END IF;

  SELECT * INTO v_rm FROM public.raw_materials WHERE id = p_material_id FOR UPDATE;
  IF v_rm.id IS NULL THEN
    RAISE EXCEPTION 'Raw material not found.';
  END IF;

  IF v_rm.opening_stock_set THEN
    RAISE EXCEPTION 'Opening stock has already been recorded for "%". Use an auditable Stock Adjustment to modify stock.', v_rm.name;
  END IF;

  -- Unit conversion: KG <-> GRAM, LITRE <-> ML
  IF UPPER(TRIM(p_unit)) = UPPER(v_rm.unit) THEN
    v_normalized_qty := p_opening_quantity;
  ELSIF UPPER(TRIM(p_unit)) = 'GRAM' AND UPPER(v_rm.unit) = 'KG' THEN
    v_normalized_qty := ROUND(p_opening_quantity / 1000.0, 4);
  ELSIF UPPER(TRIM(p_unit)) = 'KG' AND UPPER(v_rm.unit) = 'GRAM' THEN
    v_normalized_qty := ROUND(p_opening_quantity * 1000.0, 4);
  ELSIF UPPER(TRIM(p_unit)) = 'ML' AND UPPER(v_rm.unit) = 'LITRE' THEN
    v_normalized_qty := ROUND(p_opening_quantity / 1000.0, 4);
  ELSIF UPPER(TRIM(p_unit)) = 'LITRE' AND UPPER(v_rm.unit) = 'ML' THEN
    v_normalized_qty := ROUND(p_opening_quantity * 1000.0, 4);
  ELSIF UPPER(TRIM(p_unit)) = 'PIECE' AND UPPER(v_rm.unit) = 'BOX' AND v_rm.box_to_piece_factor IS NOT NULL THEN
    v_normalized_qty := ROUND(p_opening_quantity / v_rm.box_to_piece_factor, 4);
  ELSIF UPPER(TRIM(p_unit)) = 'BOX' AND UPPER(v_rm.unit) = 'PIECE' AND v_rm.box_to_piece_factor IS NOT NULL THEN
    v_normalized_qty := ROUND(p_opening_quantity * v_rm.box_to_piece_factor, 4);
  ELSE
    RAISE EXCEPTION 'Unit conversion from % to % is not configured for "%".', p_unit, v_rm.unit, v_rm.name;
  END IF;

  SELECT full_name INTO v_actor_name FROM public.user_profiles WHERE id = v_actor_id;
  v_new_stock := v_rm.current_stock + v_normalized_qty;

  UPDATE public.raw_materials
  SET opening_stock = v_normalized_qty,
      opening_stock_set = TRUE,
      opening_stock_date = COALESCE(p_opening_date, CURRENT_DATE),
      current_stock = v_new_stock,
      updated_at = NOW()
  WHERE id = v_rm.id
  RETURNING * INTO v_rm;

  INSERT INTO public.stock_movements (
    raw_material_id, material_name, unit,
    opening_quantity, stock_received, quantity_consumed, adjustment_quantity, closing_quantity,
    previous_stock, quantity_added, quantity_deducted, updated_stock,
    transaction_type, reference_number, notes, entered_by, approved_by, created_by_id, movement_date
  ) VALUES (
    v_rm.id, v_rm.name, v_rm.unit,
    v_new_stock - v_normalized_qty, v_normalized_qty, 0, 0, v_new_stock,
    v_new_stock - v_normalized_qty, v_normalized_qty, 0, v_new_stock,
    'OPENING_STOCK', 'OPEN-' || v_rm.code, COALESCE(p_notes, 'Opening stock recorded by Owner'),
    v_actor_name, v_actor_name, v_actor_id, COALESCE(p_opening_date, CURRENT_DATE)
  );

  RETURN v_rm;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
