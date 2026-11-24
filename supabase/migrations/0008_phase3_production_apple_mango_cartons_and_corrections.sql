-- ============================================================================
-- MIGRATION 0008: PHASE 3 — COMPLETE PRODUCTION MANAGEMENT
--                 (APPLE JUICE & MANGO JUICE, 1 CARTON = 24 PIECES,
--                  DIRECT ATOMIC CONFIRMATION, EXACT SHORTAGE VALIDATION,
--                  FINISHED GOODS INVENTORY, AND AUDITABLE REVERSAL/CORRECTION)
-- ============================================================================
-- Preserves historical migrations 0001 through 0007 without destructive changes
-- and preserves existing public.inventory and public.finished_goods tables.
-- Enforces:
-- 1. Canonical factory products: Apple Juice and Mango Juice (1 carton = 24 pieces).
-- 2. Direct manager production confirmation (CONFIRMED status) with idempotency_key
--    to prevent duplicate stock deductions or finished goods additions.
-- 3. Auditable reversal and correction columns on production_batches (no silent
--    edits or deletions of confirmed production batches).
-- 4. Authoritative finished_goods_inventory table (synchronized with public.inventory
--    and public.finished_goods) with opening_stock_set lock flag for Owner-only
--    opening finished goods entry without fake initial quantities.
-- 5. Strict RLS ensuring Managers only view/correct their own production batches
--    while Owner (Sikandar Raja) views and manages all factory production.
-- ============================================================================

-- 1. Extend production_batches for Phase 3 direct confirmation, idempotency & corrections
ALTER TABLE public.production_batches
  ALTER COLUMN machine_id DROP NOT NULL;

ALTER TABLE public.production_batches
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS juice_type TEXT CHECK (juice_type IN ('Apple Juice', 'Mango Juice')),
  ADD COLUMN IF NOT EXISTS pieces_per_carton INTEGER NOT NULL DEFAULT 24 CHECK (pieces_per_carton = 24),
  ADD COLUMN IF NOT EXISTS total_pieces INTEGER NOT NULL DEFAULT 0 CHECK (total_pieces >= 0),
  ADD COLUMN IF NOT EXISTS is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reversed_by_name TEXT,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT,
  ADD COLUMN IF NOT EXISTS corrects_batch_id UUID REFERENCES public.production_batches(id),
  ADD COLUMN IF NOT EXISTS corrected_by_batch_id UUID REFERENCES public.production_batches(id);

-- Expand status check on production_batches to include CONFIRMED and REVERSED
ALTER TABLE public.production_batches DROP CONSTRAINT IF EXISTS production_batches_status_check;
ALTER TABLE public.production_batches ADD CONSTRAINT production_batches_status_check CHECK (
  status IN (
    'CONFIRMED',
    'REVERSED',
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'Planned',
    'In Progress',
    'Completed',
    'On Hold',
    'Rejected'
  )
);

-- 2. Create canonical finished_goods_inventory table (preserving public.inventory and public.finished_goods)
CREATE TABLE IF NOT EXISTS public.finished_goods_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID UNIQUE NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL CHECK (product_name IN ('Apple Juice', 'Mango Juice')),
  sku TEXT NOT NULL,
  flavour_name TEXT NOT NULL,
  bottle_size_label TEXT NOT NULL DEFAULT '24 Pieces / Carton',
  packaging_type_name TEXT NOT NULL DEFAULT 'Standard 24-Piece Carton',
  units_per_carton INTEGER NOT NULL DEFAULT 24 CHECK (units_per_carton = 24),
  opening_stock_set BOOLEAN NOT NULL DEFAULT FALSE,
  opening_stock_date DATE,
  opening_stock_cartons NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (opening_stock_cartons >= 0),
  verified_production_cartons NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (verified_production_cartons >= 0),
  approved_returns_cartons NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (approved_returns_cartons >= 0),
  dispatched_cartons NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (dispatched_cartons >= 0),
  damaged_cartons NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (damaged_cartons >= 0),
  reserved_cartons NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (reserved_cartons >= 0),
  available_cartons NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (available_cartons >= 0),
  closing_stock_cartons NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (closing_stock_cartons >= 0),
  total_pieces_produced INTEGER NOT NULL DEFAULT 0 CHECK (total_pieces_produced >= 0),
  current_available_pieces INTEGER NOT NULL DEFAULT 0 CHECK (current_available_pieces >= 0),
  latest_batch_number TEXT,
  latest_production_date DATE,
  valuation_per_carton NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valuation_per_carton >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure columns exist if finished_goods_inventory was already created earlier
ALTER TABLE public.finished_goods_inventory
  ADD COLUMN IF NOT EXISTS opening_stock_set BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS opening_stock_date DATE,
  ADD COLUMN IF NOT EXISTS units_per_carton INTEGER NOT NULL DEFAULT 24 CHECK (units_per_carton = 24),
  ADD COLUMN IF NOT EXISTS opening_stock_cartons NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (opening_stock_cartons >= 0),
  ADD COLUMN IF NOT EXISTS verified_production_cartons NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (verified_production_cartons >= 0),
  ADD COLUMN IF NOT EXISTS approved_returns_cartons NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (approved_returns_cartons >= 0),
  ADD COLUMN IF NOT EXISTS dispatched_cartons NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (dispatched_cartons >= 0),
  ADD COLUMN IF NOT EXISTS damaged_cartons NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (damaged_cartons >= 0),
  ADD COLUMN IF NOT EXISTS reserved_cartons NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (reserved_cartons >= 0),
  ADD COLUMN IF NOT EXISTS available_cartons NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (available_cartons >= 0),
  ADD COLUMN IF NOT EXISTS closing_stock_cartons NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (closing_stock_cartons >= 0),
  ADD COLUMN IF NOT EXISTS total_pieces_produced INTEGER NOT NULL DEFAULT 0 CHECK (total_pieces_produced >= 0),
  ADD COLUMN IF NOT EXISTS current_available_pieces INTEGER NOT NULL DEFAULT 0 CHECK (current_available_pieces >= 0),
  ADD COLUMN IF NOT EXISTS latest_batch_number TEXT,
  ADD COLUMN IF NOT EXISTS latest_production_date DATE,
  ADD COLUMN IF NOT EXISTS valuation_per_carton NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valuation_per_carton >= 0);

-- 3. Seed ONLY Apple Juice and Mango Juice (1 carton = 24 pieces) and initialize finished_goods_inventory at 0 stock
DO $$
DECLARE
  v_apple_flavour_id UUID;
  v_mango_flavour_id UUID;
  v_bottle_size_id UUID;
  v_packaging_id UUID;
  v_apple_product_id UUID;
  v_mango_product_id UUID;
BEGIN
  -- 3a. Ensure Apple and Mango flavours exist
  INSERT INTO public.flavours (name, code, color_hex, is_active)
  VALUES ('Apple', 'APL', '#EF4444', TRUE)
  ON CONFLICT (name) DO UPDATE SET is_active = TRUE
  RETURNING id INTO v_apple_flavour_id;

  IF v_apple_flavour_id IS NULL THEN
    SELECT id INTO v_apple_flavour_id FROM public.flavours WHERE LOWER(name) = 'apple' OR UPPER(code) = 'APL' LIMIT 1;
  END IF;

  INSERT INTO public.flavours (name, code, color_hex, is_active)
  VALUES ('Mango', 'MNG', '#F59E0B', TRUE)
  ON CONFLICT (name) DO UPDATE SET is_active = TRUE
  RETURNING id INTO v_mango_flavour_id;

  IF v_mango_flavour_id IS NULL THEN
    SELECT id INTO v_mango_flavour_id FROM public.flavours WHERE LOWER(name) = 'mango' OR UPPER(code) = 'MNG' LIMIT 1;
  END IF;

  -- 3b. Ensure standard 24-piece carton bottle size & packaging type exist
  INSERT INTO public.bottle_sizes (label, volume_ml, is_custom, is_active)
  VALUES ('24 Pieces / Carton', 250, FALSE, TRUE)
  ON CONFLICT (label) DO UPDATE SET is_active = TRUE
  RETURNING id INTO v_bottle_size_id;

  IF v_bottle_size_id IS NULL THEN
    SELECT id INTO v_bottle_size_id FROM public.bottle_sizes WHERE label = '24 Pieces / Carton' LIMIT 1;
  END IF;

  INSERT INTO public.packaging_types (name, units_per_carton)
  VALUES ('Standard 24-Piece Carton', 24)
  ON CONFLICT (name) DO UPDATE SET units_per_carton = 24
  RETURNING id INTO v_packaging_id;

  IF v_packaging_id IS NULL THEN
    SELECT id INTO v_packaging_id FROM public.packaging_types WHERE name = 'Standard 24-Piece Carton' LIMIT 1;
  END IF;

  -- 3c. Seed canonical Apple Juice product (24 pieces/carton)
  SELECT id INTO v_apple_product_id FROM public.products WHERE LOWER(name) = 'apple juice' OR sku = 'FF-APL-24' LIMIT 1;
  IF v_apple_product_id IS NULL THEN
    INSERT INTO public.products (
      sku, name, flavour_id, bottle_size_id, packaging_type_id,
      units_per_carton, wholesale_price_per_carton, retail_price_per_unit,
      standard_cost_per_carton, min_stock_cartons, is_active
    ) VALUES (
      'FF-APL-24', 'Apple Juice', v_apple_flavour_id, v_bottle_size_id, v_packaging_id,
      24, 1200, 60, 850, 0, TRUE
    )
    ON CONFLICT (sku) DO UPDATE
    SET name = 'Apple Juice',
        units_per_carton = 24,
        is_active = TRUE
    RETURNING id INTO v_apple_product_id;
  ELSE
    UPDATE public.products
    SET units_per_carton = 24,
        is_active = TRUE
    WHERE id = v_apple_product_id;
  END IF;

  -- 3d. Seed canonical Mango Juice product (24 pieces/carton)
  SELECT id INTO v_mango_product_id FROM public.products WHERE LOWER(name) = 'mango juice' OR sku = 'FF-MNG-24' LIMIT 1;
  IF v_mango_product_id IS NULL THEN
    INSERT INTO public.products (
      sku, name, flavour_id, bottle_size_id, packaging_type_id,
      units_per_carton, wholesale_price_per_carton, retail_price_per_unit,
      standard_cost_per_carton, min_stock_cartons, is_active
    ) VALUES (
      'FF-MNG-24', 'Mango Juice', v_mango_flavour_id, v_bottle_size_id, v_packaging_id,
      24, 1200, 60, 850, 0, TRUE
    )
    ON CONFLICT (sku) DO UPDATE
    SET name = 'Mango Juice',
        units_per_carton = 24,
        is_active = TRUE
    RETURNING id INTO v_mango_product_id;
  ELSE
    UPDATE public.products
    SET units_per_carton = 24,
        is_active = TRUE
    WHERE id = v_mango_product_id;
  END IF;

  -- 3e. Initialize finished_goods_inventory, finished_goods, and inventory at 0 stock (preserving any existing rows)
  IF v_apple_product_id IS NOT NULL THEN
    INSERT INTO public.finished_goods_inventory (
      product_id, product_name, sku, flavour_name, bottle_size_label, packaging_type_name, units_per_carton
    ) VALUES (
      v_apple_product_id, 'Apple Juice', 'FF-APL-24', 'Apple', '24 Pieces / Carton', 'Standard 24-Piece Carton', 24
    )
    ON CONFLICT (product_id) DO NOTHING;

    INSERT INTO public.inventory (product_id)
    VALUES (v_apple_product_id)
    ON CONFLICT (product_id) DO NOTHING;

    INSERT INTO public.finished_goods (
      product_id, product_name, flavour_name, bottle_size_label, units_per_carton
    ) VALUES (
      v_apple_product_id, 'Apple Juice', 'Apple', '24 Pieces / Carton', 24
    )
    ON CONFLICT (product_id) DO NOTHING;
  END IF;

  IF v_mango_product_id IS NOT NULL THEN
    INSERT INTO public.finished_goods_inventory (
      product_id, product_name, sku, flavour_name, bottle_size_label, packaging_type_name, units_per_carton
    ) VALUES (
      v_mango_product_id, 'Mango Juice', 'FF-MNG-24', 'Mango', '24 Pieces / Carton', 'Standard 24-Piece Carton', 24
    )
    ON CONFLICT (product_id) DO NOTHING;

    INSERT INTO public.inventory (product_id)
    VALUES (v_mango_product_id)
    ON CONFLICT (product_id) DO NOTHING;

    INSERT INTO public.finished_goods (
      product_id, product_name, flavour_name, bottle_size_label, units_per_carton
    ) VALUES (
      v_mango_product_id, 'Mango Juice', 'Mango', '24 Pieces / Carton', 24
    )
    ON CONFLICT (product_id) DO NOTHING;
  END IF;
END $$;

-- 4. Strict RLS on finished_goods_inventory and production_batches
ALTER TABLE public.finished_goods_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner and Production Manager view finished_goods_inventory" ON public.finished_goods_inventory;
CREATE POLICY "Owner and Production Manager view finished_goods_inventory"
  ON public.finished_goods_inventory FOR SELECT
  USING (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));

DROP POLICY IF EXISTS "Owner and Production Manager mutate finished_goods_inventory" ON public.finished_goods_inventory;
CREATE POLICY "Owner and Production Manager mutate finished_goods_inventory"
  ON public.finished_goods_inventory FOR ALL
  USING (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'))
  WITH CHECK (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));

DROP POLICY IF EXISTS "No user can delete finished_goods_inventory" ON public.finished_goods_inventory;
CREATE POLICY "No user can delete finished_goods_inventory"
  ON public.finished_goods_inventory FOR DELETE
  USING (FALSE);

-- Never allow silent DELETE on production_batches
DROP POLICY IF EXISTS "No user can delete production_batches" ON public.production_batches;
CREATE POLICY "No user can delete production_batches"
  ON public.production_batches FOR DELETE
  USING (FALSE);

-- Owner sees all production batches; Production Manager sees own production batches
DROP POLICY IF EXISTS "Owner views all production_batches; Manager views own" ON public.production_batches;
CREATE POLICY "Owner views all production_batches; Manager views own"
  ON public.production_batches FOR SELECT
  USING (
    public.current_user_role() = 'OWNER'
    OR (
      public.current_user_role() = 'PRODUCTION_MANAGER'
      AND (created_by = public.current_app_user_id() OR submitted_by = public.current_app_user_id())
    )
  );

-- 5. Atomic PostgreSQL RPC: Confirm Production Batch, Deduct Raw Materials & Add Finished Goods (Cartons & 24x Pieces)
CREATE OR REPLACE FUNCTION public.rpc_confirm_production_batch(
  p_production_date DATE,
  p_juice_type TEXT,
  p_cartons_produced NUMERIC,
  p_materials JSONB,
  p_notes TEXT DEFAULT '',
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS public.production_batches AS $$
DECLARE
  v_actor_id UUID;
  v_actor_role TEXT;
  v_actor_name TEXT;
  v_existing_batch public.production_batches;
  v_product_id UUID;
  v_total_pieces INTEGER;
  v_batch_number TEXT;
  v_item JSONB;
  v_rm public.raw_materials;
  v_entered_qty NUMERIC(14,4);
  v_entered_unit TEXT;
  v_normalized_qty NUMERIC(14,4);
  v_shortage_messages TEXT[] := ARRAY[]::TEXT[];
  v_shortage_qty NUMERIC(14,4);
  v_new_batch public.production_batches;
BEGIN
  v_actor_id := public.current_app_user_id();
  v_actor_role := public.current_user_role();

  IF v_actor_id IS NULL OR v_actor_role NOT IN ('OWNER', 'PRODUCTION_MANAGER') THEN
    RAISE EXCEPTION 'Forbidden: Only an authenticated Production Manager (Kamran Bhai or Imran Bhai) or Owner (Sikandar Raja) can confirm production.';
  END IF;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL AND LENGTH(TRIM(p_idempotency_key)) > 0 THEN
    SELECT * INTO v_existing_batch
    FROM public.production_batches
    WHERE idempotency_key = TRIM(p_idempotency_key)
    LIMIT 1;
    IF v_existing_batch.id IS NOT NULL THEN
      RETURN v_existing_batch;
    END IF;
  END IF;

  IF p_juice_type NOT IN ('Apple Juice', 'Mango Juice') THEN
    RAISE EXCEPTION 'Invalid juice type "%". Factory manufactures only Apple Juice and Mango Juice.', p_juice_type;
  END IF;

  IF p_cartons_produced IS NULL OR p_cartons_produced <= 0 THEN
    RAISE EXCEPTION 'Cartons produced must be greater than zero.';
  END IF;

  IF p_materials IS NULL OR jsonb_array_length(p_materials) = 0 THEN
    RAISE EXCEPTION 'At least one raw material consumption entry is required.';
  END IF;

  SELECT full_name INTO v_actor_name FROM public.user_profiles WHERE id = v_actor_id;
  v_total_pieces := ROUND(p_cartons_produced * 24)::INTEGER;

  -- Pass 1: Lock and validate all raw materials, collecting exact shortages if any
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_materials)
  LOOP
    v_entered_qty := (v_item ->> 'entered_quantity')::NUMERIC;
    v_entered_unit := UPPER(TRIM(COALESCE(v_item ->> 'entered_unit', '')));

    IF v_entered_qty IS NULL OR v_entered_qty <= 0 THEN
      RAISE EXCEPTION 'Consumed quantity must be greater than zero for every material.';
    END IF;

    SELECT * INTO v_rm
    FROM public.raw_materials
    WHERE id = (v_item ->> 'raw_material_id')::UUID
    FOR UPDATE;

    IF v_rm.id IS NULL THEN
      RAISE EXCEPTION 'Raw material not found in inventory.';
    END IF;

    IF v_entered_unit = UPPER(v_rm.unit) THEN
      v_normalized_qty := v_entered_qty;
    ELSIF v_entered_unit = 'GRAM' AND UPPER(v_rm.unit) = 'KG' THEN
      v_normalized_qty := ROUND(v_entered_qty / 1000.0, 4);
    ELSIF v_entered_unit = 'KG' AND UPPER(v_rm.unit) = 'GRAM' THEN
      v_normalized_qty := ROUND(v_entered_qty * 1000.0, 4);
    ELSIF v_entered_unit = 'ML' AND UPPER(v_rm.unit) = 'LITRE' THEN
      v_normalized_qty := ROUND(v_entered_qty / 1000.0, 4);
    ELSIF v_entered_unit = 'LITRE' AND UPPER(v_rm.unit) = 'ML' THEN
      v_normalized_qty := ROUND(v_entered_qty * 1000.0, 4);
    ELSIF v_entered_unit = 'PIECE' AND UPPER(v_rm.unit) = 'BOX' AND v_rm.box_to_piece_factor IS NOT NULL THEN
      v_normalized_qty := ROUND(v_entered_qty / v_rm.box_to_piece_factor, 4);
    ELSIF v_entered_unit = 'BOX' AND UPPER(v_rm.unit) = 'PIECE' AND v_rm.box_to_piece_factor IS NOT NULL THEN
      v_normalized_qty := ROUND(v_entered_qty * v_rm.box_to_piece_factor, 4);
    ELSE
      RAISE EXCEPTION 'Unit mismatch: Cannot convert % % into % for "%".', v_entered_qty, v_entered_unit, v_rm.unit, v_rm.name;
    END IF;

    IF v_rm.current_stock < v_normalized_qty THEN
      v_shortage_qty := ROUND(v_normalized_qty - v_rm.current_stock, 4);
      v_shortage_messages := array_append(
        v_shortage_messages,
        FORMAT(
          'Insufficient %s Stock. Available: %s %s. Required: %s %s. Shortage: %s %s.',
          v_rm.name,
          TRIM(TO_CHAR(v_rm.current_stock, 'FM999999990.####')), v_rm.unit,
          TRIM(TO_CHAR(v_normalized_qty, 'FM999999990.####')), v_rm.unit,
          TRIM(TO_CHAR(v_shortage_qty, 'FM999999990.####')), v_rm.unit
        )
      );
    END IF;
  END LOOP;

  IF array_length(v_shortage_messages, 1) > 0 THEN
    RAISE EXCEPTION '%', array_to_string(v_shortage_messages, ' ');
  END IF;

  v_batch_number := 'PROD-' ||
    CASE WHEN p_juice_type = 'Apple Juice' THEN 'APL' ELSE 'MNG' END || '-' ||
    TO_CHAR(COALESCE(p_production_date, CURRENT_DATE), 'YYMMDD') || '-' ||
    SUBSTRING(EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT FROM 6);

  SELECT id INTO v_product_id FROM public.products WHERE LOWER(name) = LOWER(p_juice_type) LIMIT 1;

  INSERT INTO public.production_batches (
    batch_number,
    production_date,
    product_id,
    juice_type,
    pieces_per_carton,
    total_pieces,
    target_cartons,
    actual_cartons,
    wastage_cartons,
    target_bottles,
    produced_bottles,
    status,
    inventory_posted,
    idempotency_key,
    remarks,
    created_by,
    submitted_by,
    submitted_by_name,
    submitted_at,
    verified_by,
    verified_at
  ) VALUES (
    v_batch_number,
    COALESCE(p_production_date, CURRENT_DATE),
    v_product_id,
    p_juice_type,
    24,
    v_total_pieces,
    p_cartons_produced::INTEGER,
    p_cartons_produced::INTEGER,
    0,
    v_total_pieces,
    v_total_pieces,
    'CONFIRMED',
    TRUE,
    NULLIF(TRIM(COALESCE(p_idempotency_key, '')), ''),
    p_notes,
    v_actor_id,
    v_actor_id,
    v_actor_name,
    NOW(),
    v_actor_id,
    NOW()
  )
  RETURNING * INTO v_new_batch;

  -- Pass 2: Deduct raw materials and record stock_movements
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_materials)
  LOOP
    v_entered_qty := (v_item ->> 'entered_quantity')::NUMERIC;
    v_entered_unit := UPPER(TRIM(COALESCE(v_item ->> 'entered_unit', '')));

    SELECT * INTO v_rm
    FROM public.raw_materials
    WHERE id = (v_item ->> 'raw_material_id')::UUID
    FOR UPDATE;

    IF v_entered_unit = UPPER(v_rm.unit) THEN
      v_normalized_qty := v_entered_qty;
    ELSIF v_entered_unit = 'GRAM' AND UPPER(v_rm.unit) = 'KG' THEN
      v_normalized_qty := ROUND(v_entered_qty / 1000.0, 4);
    ELSIF v_entered_unit = 'KG' AND UPPER(v_rm.unit) = 'GRAM' THEN
      v_normalized_qty := ROUND(v_entered_qty * 1000.0, 4);
    ELSIF v_entered_unit = 'ML' AND UPPER(v_rm.unit) = 'LITRE' THEN
      v_normalized_qty := ROUND(v_entered_qty / 1000.0, 4);
    ELSIF v_entered_unit = 'LITRE' AND UPPER(v_rm.unit) = 'ML' THEN
      v_normalized_qty := ROUND(v_entered_qty * 1000.0, 4);
    ELSIF v_entered_unit = 'PIECE' AND UPPER(v_rm.unit) = 'BOX' AND v_rm.box_to_piece_factor IS NOT NULL THEN
      v_normalized_qty := ROUND(v_entered_qty / v_rm.box_to_piece_factor, 4);
    ELSIF v_entered_unit = 'BOX' AND UPPER(v_rm.unit) = 'PIECE' AND v_rm.box_to_piece_factor IS NOT NULL THEN
      v_normalized_qty := ROUND(v_entered_qty * v_rm.box_to_piece_factor, 4);
    END IF;

    UPDATE public.raw_materials
    SET total_consumed = COALESCE(total_consumed, 0) + v_normalized_qty,
        current_stock = ROUND(current_stock - v_normalized_qty, 4),
        updated_at = NOW()
    WHERE id = v_rm.id;

    INSERT INTO public.stock_movements (
      raw_material_id,
      material_name,
      unit,
      opening_quantity,
      stock_received,
      quantity_consumed,
      adjustment_quantity,
      closing_quantity,
      previous_stock,
      quantity_added,
      quantity_deducted,
      updated_stock,
      transaction_type,
      reference_number,
      notes,
      entered_by,
      approved_by,
      created_by_id,
      movement_date
    ) VALUES (
      v_rm.id,
      v_rm.name,
      v_rm.unit,
      v_rm.current_stock,
      0,
      v_normalized_qty,
      0,
      ROUND(v_rm.current_stock - v_normalized_qty, 4),
      v_rm.current_stock,
      0,
      v_normalized_qty,
      ROUND(v_rm.current_stock - v_normalized_qty, 4),
      'PRODUCTION_CONSUMPTION',
      v_batch_number,
      FORMAT('Consumed %s %s for %s cartons (%s pieces) of %s', v_entered_qty, v_entered_unit, p_cartons_produced, v_total_pieces, p_juice_type),
      v_actor_name,
      v_actor_name,
      v_actor_id,
      COALESCE(p_production_date, CURRENT_DATE)
    );
  END LOOP;

  -- Pass 3: Synchronize Finished Goods across finished_goods_inventory, inventory, and finished_goods
  INSERT INTO public.finished_goods_inventory (
    product_id, product_name, sku, flavour_name, bottle_size_label, packaging_type_name,
    units_per_carton, verified_production_cartons, available_cartons, closing_stock_cartons,
    total_pieces_produced, current_available_pieces, latest_batch_number, latest_production_date, updated_at
  ) VALUES (
    v_product_id,
    p_juice_type,
    CASE WHEN p_juice_type = 'Apple Juice' THEN 'FF-APL-24' ELSE 'FF-MNG-24' END,
    CASE WHEN p_juice_type = 'Apple Juice' THEN 'Apple' ELSE 'Mango' END,
    '24 Pieces / Carton',
    'Standard 24-Piece Carton',
    24,
    p_cartons_produced,
    p_cartons_produced,
    p_cartons_produced,
    v_total_pieces,
    v_total_pieces,
    v_batch_number,
    COALESCE(p_production_date, CURRENT_DATE),
    NOW()
  )
  ON CONFLICT (product_id) DO UPDATE
  SET verified_production_cartons = public.finished_goods_inventory.verified_production_cartons + EXCLUDED.verified_production_cartons,
      available_cartons = public.finished_goods_inventory.available_cartons + EXCLUDED.verified_production_cartons,
      closing_stock_cartons = public.finished_goods_inventory.closing_stock_cartons + EXCLUDED.verified_production_cartons,
      total_pieces_produced = public.finished_goods_inventory.total_pieces_produced + EXCLUDED.total_pieces_produced,
      current_available_pieces = ROUND((public.finished_goods_inventory.available_cartons + EXCLUDED.verified_production_cartons) * 24)::INTEGER,
      latest_batch_number = EXCLUDED.latest_batch_number,
      latest_production_date = EXCLUDED.latest_production_date,
      updated_at = NOW();

  UPDATE public.inventory
  SET verified_production_cartons = verified_production_cartons + p_cartons_produced::INTEGER,
      latest_batch_number = v_batch_number,
      latest_production_date = COALESCE(p_production_date, CURRENT_DATE),
      updated_at = NOW()
  WHERE product_id = v_product_id;

  UPDATE public.finished_goods
  SET produced_bottles = produced_bottles + v_total_pieces,
      available_bottles = available_bottles + v_total_pieces,
      updated_at = NOW()
  WHERE product_id = v_product_id;

  RETURN v_new_batch;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
