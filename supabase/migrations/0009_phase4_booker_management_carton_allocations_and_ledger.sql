-- ============================================================================
-- MIGRATION 0009: PHASE 4 — BOOKER MANAGEMENT, CARTON ALLOCATIONS,
--                 PARTIAL PAYMENTS, SEPARATE BOOKER LEDGERS, AND REVERSALS
-- ============================================================================
-- Preserves historical migrations 0001 through 0008 without destructive changes.
-- Enforces:
-- 1. Dedicated bookers master table (no login account required for bookers;
--    no shop-level distribution tracking required).
-- 2. Dedicated booker_transactions ledger table tracking CARTONS_GIVEN,
--    PAYMENT_RECEIVED, and REVERSAL_ENTRY with running outstanding balances.
-- 3. Ledger-derived booker balance recalculation function so total_cartons_received,
--    apple_cartons_received, mango_cartons_received, total_amount_payable,
--    total_payments_received, and remaining_outstanding_amount always match the
--    authoritative transaction history.
-- 4. Atomic RPCs for giving cartons to a booker (deducts finished goods cartons
--    and 24x pieces, increases booker outstanding balance, does NOT touch manager
--    cash) and receiving partial payments (reduces booker outstanding balance,
--    blocks overpayment, does NOT touch manager cash).
-- 5. Strict RLS allowing Owner and authorized Production Managers (Kamran Bhai
--    and Imran Bhai) to view and record booker transactions while blocking all
--    deletions.
-- ============================================================================

-- 1. Create bookers master table
CREATE TABLE IF NOT EXISTS public.bookers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booker_name TEXT NOT NULL UNIQUE,
  contact_number TEXT,
  created_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  total_cartons_received INTEGER NOT NULL DEFAULT 0 CHECK (total_cartons_received >= 0),
  apple_cartons_received INTEGER NOT NULL DEFAULT 0 CHECK (apple_cartons_received >= 0),
  mango_cartons_received INTEGER NOT NULL DEFAULT 0 CHECK (mango_cartons_received >= 0),
  total_pieces_received INTEGER NOT NULL DEFAULT 0 CHECK (total_pieces_received >= 0),
  total_amount_payable NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_amount_payable >= 0),
  total_payments_received NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_payments_received >= 0),
  remaining_outstanding_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (remaining_outstanding_amount >= 0),
  created_by_id UUID REFERENCES public.users(id),
  created_by_name TEXT NOT NULL DEFAULT 'Owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create booker_transactions ledger table
CREATE TABLE IF NOT EXISTS public.booker_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booker_id UUID NOT NULL REFERENCES public.bookers(id) ON DELETE RESTRICT,
  booker_name TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'CARTONS_GIVEN',
    'PAYMENT_RECEIVED',
    'REVERSAL_ENTRY'
  )),
  reference_number TEXT NOT NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  juice_type TEXT CHECK (juice_type IS NULL OR juice_type IN ('Apple Juice', 'Mango Juice')),
  cartons_given INTEGER NOT NULL DEFAULT 0 CHECK (cartons_given >= 0),
  pieces_given INTEGER NOT NULL DEFAULT 0 CHECK (pieces_given >= 0),
  amount_payable NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_payable >= 0),
  payment_received NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (payment_received >= 0),
  previous_outstanding_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_outstanding_balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (updated_outstanding_balance >= 0),
  notes TEXT,
  idempotency_key TEXT UNIQUE,
  entered_by_id UUID NOT NULL REFERENCES public.users(id),
  entered_by_name TEXT NOT NULL,
  is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  reversed_at TIMESTAMPTZ,
  reversed_by_id UUID REFERENCES public.users(id),
  reversed_by_name TEXT,
  reversal_reason TEXT,
  reverses_transaction_id UUID REFERENCES public.booker_transactions(id),
  corrects_transaction_id UUID REFERENCES public.booker_transactions(id),
  corrected_by_transaction_id UUID REFERENCES public.booker_transactions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booker_transactions_booker_date
  ON public.booker_transactions(booker_id, transaction_date DESC, created_at DESC);

-- 3. Strict RLS on bookers and booker_transactions
ALTER TABLE public.bookers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booker_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner and Production Manager view bookers" ON public.bookers;
CREATE POLICY "Owner and Production Manager view bookers"
  ON public.bookers FOR SELECT
  USING (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));

DROP POLICY IF EXISTS "Owner and Production Manager insert and update bookers" ON public.bookers;
CREATE POLICY "Owner and Production Manager insert and update bookers"
  ON public.bookers FOR INSERT
  WITH CHECK (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));

DROP POLICY IF EXISTS "Owner and Production Manager update bookers" ON public.bookers;
CREATE POLICY "Owner and Production Manager update bookers"
  ON public.bookers FOR UPDATE
  USING (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'))
  WITH CHECK (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));

DROP POLICY IF EXISTS "No user can delete bookers" ON public.bookers;
CREATE POLICY "No user can delete bookers"
  ON public.bookers FOR DELETE
  USING (FALSE);

DROP POLICY IF EXISTS "Owner and Production Manager view booker_transactions" ON public.booker_transactions;
CREATE POLICY "Owner and Production Manager view booker_transactions"
  ON public.booker_transactions FOR SELECT
  USING (public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER'));

DROP POLICY IF EXISTS "Owner and Production Manager insert booker_transactions" ON public.booker_transactions;
CREATE POLICY "Owner and Production Manager insert booker_transactions"
  ON public.booker_transactions FOR INSERT
  WITH CHECK (
    public.current_user_role() IN ('OWNER', 'PRODUCTION_MANAGER')
    AND entered_by_id = public.current_app_user_id()
  );

DROP POLICY IF EXISTS "No user can delete booker_transactions" ON public.booker_transactions;
CREATE POLICY "No user can delete booker_transactions"
  ON public.booker_transactions FOR DELETE
  USING (FALSE);

-- 4. Ledger-Derived Booker Account Balance Recalculation Helper
CREATE OR REPLACE FUNCTION public.recalculate_booker_account_from_ledger(p_booker_id UUID)
RETURNS public.bookers AS $$
DECLARE
  v_apple_cartons INTEGER;
  v_mango_cartons INTEGER;
  v_total_cartons INTEGER;
  v_total_payable NUMERIC(14,2);
  v_total_paid NUMERIC(14,2);
  v_outstanding NUMERIC(14,2);
  v_booker public.bookers;
BEGIN
  SELECT
    COALESCE(SUM(CASE
      WHEN transaction_type = 'CARTONS_GIVEN' AND NOT is_reversed AND juice_type = 'Apple Juice' THEN cartons_given
      ELSE 0
    END), 0),
    COALESCE(SUM(CASE
      WHEN transaction_type = 'CARTONS_GIVEN' AND NOT is_reversed AND juice_type = 'Mango Juice' THEN cartons_given
      ELSE 0
    END), 0),
    COALESCE(SUM(CASE
      WHEN transaction_type = 'CARTONS_GIVEN' AND NOT is_reversed THEN amount_payable
      ELSE 0
    END), 0),
    COALESCE(SUM(CASE
      WHEN transaction_type = 'PAYMENT_RECEIVED' AND NOT is_reversed THEN payment_received
      ELSE 0
    END), 0)
  INTO v_apple_cartons, v_mango_cartons, v_total_payable, v_total_paid
  FROM public.booker_transactions
  WHERE booker_id = p_booker_id;

  v_total_cartons := v_apple_cartons + v_mango_cartons;
  v_outstanding := ROUND(v_total_payable - v_total_paid, 2);

  IF v_outstanding < 0 THEN
    RAISE EXCEPTION 'Booker outstanding balance cannot become negative (Payable: Rs. %, Paid: Rs. %).',
      v_total_payable, v_total_paid;
  END IF;

  UPDATE public.bookers
  SET apple_cartons_received = v_apple_cartons,
      mango_cartons_received = v_mango_cartons,
      total_cartons_received = v_total_cartons,
      total_pieces_received = v_total_cartons * 24,
      total_amount_payable = v_total_payable,
      total_payments_received = v_total_paid,
      remaining_outstanding_amount = v_outstanding,
      updated_at = NOW()
  WHERE id = p_booker_id
  RETURNING * INTO v_booker;

  RETURN v_booker;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Atomic RPC: Give Cartons to Booker (Deducts Finished Goods & Increases Booker Outstanding)
CREATE OR REPLACE FUNCTION public.rpc_give_cartons_to_booker(
  p_booker_id UUID,
  p_juice_type TEXT,
  p_cartons_given INTEGER,
  p_amount_payable NUMERIC,
  p_transaction_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT '',
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS public.booker_transactions AS $$
DECLARE
  v_actor_id UUID;
  v_actor_role TEXT;
  v_actor_name TEXT;
  v_existing_tx public.booker_transactions;
  v_booker public.bookers;
  v_fg public.finished_goods_inventory;
  v_shortage INTEGER;
  v_prev_outstanding NUMERIC(14,2);
  v_new_outstanding NUMERIC(14,2);
  v_ref_no TEXT;
  v_tx public.booker_transactions;
BEGIN
  v_actor_id := public.current_app_user_id();
  v_actor_role := public.current_user_role();

  IF v_actor_id IS NULL OR v_actor_role NOT IN ('OWNER', 'PRODUCTION_MANAGER') THEN
    RAISE EXCEPTION 'Forbidden: Only Owner or an authorized Production Manager can give cartons to a booker.';
  END IF;

  IF p_idempotency_key IS NOT NULL AND LENGTH(TRIM(p_idempotency_key)) > 0 THEN
    SELECT * INTO v_existing_tx
    FROM public.booker_transactions
    WHERE idempotency_key = TRIM(p_idempotency_key)
    LIMIT 1;
    IF v_existing_tx.id IS NOT NULL THEN
      RETURN v_existing_tx;
    END IF;
  END IF;

  IF p_juice_type NOT IN ('Apple Juice', 'Mango Juice') THEN
    RAISE EXCEPTION 'Invalid product "%". Factory only allocates Apple Juice or Mango Juice cartons.', p_juice_type;
  END IF;

  IF p_cartons_given IS NULL OR p_cartons_given <= 0 THEN
    RAISE EXCEPTION 'Number of cartons given must be greater than zero.';
  END IF;

  IF p_amount_payable IS NULL OR p_amount_payable <= 0 THEN
    RAISE EXCEPTION 'Total amount payable for this transaction must be greater than zero.';
  END IF;

  SELECT full_name INTO v_actor_name FROM public.user_profiles WHERE id = v_actor_id;

  -- Lock Booker Account
  PERFORM public.recalculate_booker_account_from_ledger(p_booker_id);
  SELECT * INTO v_booker FROM public.bookers WHERE id = p_booker_id FOR UPDATE;
  IF v_booker.id IS NULL THEN
    RAISE EXCEPTION 'Booker account not found.';
  END IF;

  -- Lock Finished Goods Inventory for p_juice_type
  SELECT f.* INTO v_fg
  FROM public.finished_goods_inventory f
  JOIN public.products p ON p.id = f.product_id
  WHERE LOWER(p.name) = LOWER(p_juice_type)
  FOR UPDATE;

  IF v_fg.id IS NULL OR v_fg.available_cartons < p_cartons_given THEN
    v_shortage := p_cartons_given - COALESCE(v_fg.available_cartons, 0)::INTEGER;
    RAISE EXCEPTION 'Insufficient % Finished Goods Stock. Available: % Cartons (% Pieces). Required: % Cartons (% Pieces). Shortage: % Cartons (% Pieces).',
      p_juice_type,
      COALESCE(v_fg.available_cartons, 0)::INTEGER,
      COALESCE(v_fg.available_cartons, 0)::INTEGER * 24,
      p_cartons_given,
      p_cartons_given * 24,
      v_shortage,
      v_shortage * 24;
  END IF;

  -- Deduct Finished Goods Cartons & Pieces across finished_goods_inventory, inventory, and finished_goods
  UPDATE public.finished_goods_inventory
  SET dispatched_cartons = COALESCE(dispatched_cartons, 0) + p_cartons_given,
      available_cartons = available_cartons - p_cartons_given,
      closing_stock_cartons = closing_stock_cartons - p_cartons_given,
      current_available_pieces = ROUND((available_cartons - p_cartons_given) * 24)::INTEGER,
      updated_at = NOW()
  WHERE id = v_fg.id;

  UPDATE public.inventory
  SET dispatched_cartons = dispatched_cartons + p_cartons_given,
      updated_at = NOW()
  WHERE product_id = v_fg.product_id;

  UPDATE public.finished_goods
  SET dispatched_bottles = dispatched_bottles + (p_cartons_given * 24),
      available_bottles = GREATEST(0, available_bottles - (p_cartons_given * 24)),
      updated_at = NOW()
  WHERE product_id = v_fg.product_id;

  v_prev_outstanding := v_booker.remaining_outstanding_amount;
  v_new_outstanding := ROUND(v_prev_outstanding + p_amount_payable, 2);
  v_ref_no := 'BKR-CTN-' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT;

  INSERT INTO public.booker_transactions (
    booker_id,
    booker_name,
    transaction_type,
    reference_number,
    transaction_date,
    juice_type,
    cartons_given,
    pieces_given,
    amount_payable,
    payment_received,
    previous_outstanding_balance,
    updated_outstanding_balance,
    notes,
    idempotency_key,
    entered_by_id,
    entered_by_name
  ) VALUES (
    v_booker.id,
    v_booker.booker_name,
    'CARTONS_GIVEN',
    v_ref_no,
    COALESCE(p_transaction_date, CURRENT_DATE),
    p_juice_type,
    p_cartons_given,
    p_cartons_given * 24,
    p_amount_payable,
    0,
    v_prev_outstanding,
    v_new_outstanding,
    p_notes,
    NULLIF(TRIM(COALESCE(p_idempotency_key, '')), ''),
    v_actor_id,
    COALESCE(v_actor_name, 'Authorized User')
  )
  RETURNING * INTO v_tx;

  PERFORM public.recalculate_booker_account_from_ledger(v_booker.id);

  RETURN v_tx;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Atomic RPC: Receive Payment from Booker (Reduces Outstanding Balance, Blocks Overpayment)
CREATE OR REPLACE FUNCTION public.rpc_receive_booker_payment(
  p_booker_id UUID,
  p_payment_amount NUMERIC,
  p_payment_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT '',
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS public.booker_transactions AS $$
DECLARE
  v_actor_id UUID;
  v_actor_role TEXT;
  v_actor_name TEXT;
  v_existing_tx public.booker_transactions;
  v_booker public.bookers;
  v_prev_outstanding NUMERIC(14,2);
  v_new_outstanding NUMERIC(14,2);
  v_ref_no TEXT;
  v_tx public.booker_transactions;
BEGIN
  v_actor_id := public.current_app_user_id();
  v_actor_role := public.current_user_role();

  IF v_actor_id IS NULL OR v_actor_role NOT IN ('OWNER', 'PRODUCTION_MANAGER') THEN
    RAISE EXCEPTION 'Forbidden: Only Owner or an authorized Production Manager can receive booker payments.';
  END IF;

  IF p_idempotency_key IS NOT NULL AND LENGTH(TRIM(p_idempotency_key)) > 0 THEN
    SELECT * INTO v_existing_tx
    FROM public.booker_transactions
    WHERE idempotency_key = TRIM(p_idempotency_key)
    LIMIT 1;
    IF v_existing_tx.id IS NOT NULL THEN
      RETURN v_existing_tx;
    END IF;
  END IF;

  IF p_payment_amount IS NULL OR p_payment_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.';
  END IF;

  SELECT full_name INTO v_actor_name FROM public.user_profiles WHERE id = v_actor_id;

  PERFORM public.recalculate_booker_account_from_ledger(p_booker_id);
  SELECT * INTO v_booker FROM public.bookers WHERE id = p_booker_id FOR UPDATE;
  IF v_booker.id IS NULL THEN
    RAISE EXCEPTION 'Booker account not found.';
  END IF;

  v_prev_outstanding := v_booker.remaining_outstanding_amount;
  IF p_payment_amount > v_prev_outstanding THEN
    RAISE EXCEPTION 'Payment amount Rs. % exceeds booker % remaining outstanding balance of Rs. %.',
      p_payment_amount, v_booker.booker_name, v_prev_outstanding;
  END IF;

  v_new_outstanding := ROUND(v_prev_outstanding - p_payment_amount, 2);
  v_ref_no := 'BKR-PAY-' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT;

  INSERT INTO public.booker_transactions (
    booker_id,
    booker_name,
    transaction_type,
    reference_number,
    transaction_date,
    juice_type,
    cartons_given,
    pieces_given,
    amount_payable,
    payment_received,
    previous_outstanding_balance,
    updated_outstanding_balance,
    notes,
    idempotency_key,
    entered_by_id,
    entered_by_name
  ) VALUES (
    v_booker.id,
    v_booker.booker_name,
    'PAYMENT_RECEIVED',
    v_ref_no,
    COALESCE(p_payment_date, CURRENT_DATE),
    NULL,
    0,
    0,
    0,
    p_payment_amount,
    v_prev_outstanding,
    v_new_outstanding,
    p_notes,
    NULLIF(TRIM(COALESCE(p_idempotency_key, '')), ''),
    v_actor_id,
    COALESCE(v_actor_name, 'Authorized User')
  )
  RETURNING * INTO v_tx;

  PERFORM public.recalculate_booker_account_from_ledger(v_booker.id);

  RETURN v_tx;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
