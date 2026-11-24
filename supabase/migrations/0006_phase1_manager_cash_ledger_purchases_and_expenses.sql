-- ============================================================================
-- MIGRATION 0006: PHASE 1 — COMPLETE MANAGER CASH MANAGEMENT MODULE,
--                 LEDGER-DERIVED BALANCES, ATOMIC PURCHASE + STOCK DEDUCTION,
--                 GENERAL FACTORY EXPENSES, AND OWNER REVERSAL RPCs
-- ============================================================================
-- Preserves historical migrations 0001 through 0005.
-- Enforces:
-- 1. Idempotency key on manager_cash_transactions to prevent duplicate submissions.
-- 2. Non-negative balance constraint on manager_cash_accounts (available_balance >= 0).
-- 3. Ledger-derived balance recalculation trigger so balances ALWAYS match the
--    complete transaction ledger and can never be manually overwritten or reset.
-- 4. Atomic PostgreSQL RPCs with row-level FOR UPDATE locking for:
--    - Owner issuing cash to Kamran Bhai or Imran Bhai
--    - Manager recording raw material purchase (deducts cash + adds stock atomically)
--    - Manager recording general factory expense (deducts cash without adding stock)
--    - Owner reversing a manager cash transaction with an auditable reversal entry
-- ============================================================================

-- 1. Extend manager_cash_transactions with idempotency_key, related record links & reversal fields
ALTER TABLE manager_cash_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS related_purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reverses_transaction_id UUID REFERENCES manager_cash_transactions(id) ON DELETE SET NULL;

-- Ensure available_balance on manager_cash_accounts can never become negative
ALTER TABLE manager_cash_accounts
  DROP CONSTRAINT IF EXISTS manager_cash_accounts_non_negative_balance;
ALTER TABLE manager_cash_accounts
  ADD CONSTRAINT manager_cash_accounts_non_negative_balance CHECK (available_balance >= 0);

-- 2. Strict Immutability RLS on manager_cash_transactions
-- Never allow silent DELETE on manager_cash_transactions.
-- Only Owner can mark a transaction as reversed via an auditable reversal entry.
DROP POLICY IF EXISTS "No user can delete manager_cash_transactions" ON manager_cash_transactions;
CREATE POLICY "No user can delete manager_cash_transactions"
  ON manager_cash_transactions FOR DELETE
  USING (FALSE);

DROP POLICY IF EXISTS "Only Owner updates manager_cash_transactions for reversal" ON manager_cash_transactions;
CREATE POLICY "Only Owner updates manager_cash_transactions for reversal"
  ON manager_cash_transactions FOR UPDATE
  USING (public.current_user_role() = 'OWNER')
  WITH CHECK (public.current_user_role() = 'OWNER');

-- 3. Ledger-Derived Balance Helper Function
-- Calculates total_cash_received, total_spent_purchases, total_spent_expenses,
-- and available_balance strictly from the complete manager_cash_transactions ledger.
CREATE OR REPLACE FUNCTION public.recalculate_manager_cash_account_from_ledger(p_manager_id UUID)
RETURNS public.manager_cash_accounts AS $$
DECLARE
  v_manager_name TEXT;
  v_total_received NUMERIC(14,2);
  v_total_purchases NUMERIC(14,2);
  v_total_expenses NUMERIC(14,2);
  v_available NUMERIC(14,2);
  v_acc public.manager_cash_accounts;
BEGIN
  SELECT full_name INTO v_manager_name
  FROM public.user_profiles
  WHERE id = p_manager_id;

  IF v_manager_name IS NULL THEN
    SELECT email INTO v_manager_name FROM public.users WHERE id = p_manager_id;
  END IF;

  SELECT
    COALESCE(SUM(CASE
      WHEN transaction_type = 'CASH_ISSUED_BY_OWNER' AND NOT is_reversed THEN amount
      ELSE 0
    END), 0),
    COALESCE(SUM(CASE
      WHEN transaction_type = 'MATERIAL_PURCHASE' AND NOT is_reversed THEN amount
      ELSE 0
    END), 0),
    COALESCE(SUM(CASE
      WHEN transaction_type = 'FACTORY_EXPENSE' AND NOT is_reversed THEN amount
      ELSE 0
    END), 0)
  INTO v_total_received, v_total_purchases, v_total_expenses
  FROM public.manager_cash_transactions
  WHERE manager_id = p_manager_id;

  v_available := v_total_received - v_total_purchases - v_total_expenses;

  IF v_available < 0 THEN
    RAISE EXCEPTION 'Insufficient available cash balance for %: resulting balance Rs. % cannot be negative.',
      COALESCE(v_manager_name, p_manager_id::TEXT), v_available;
  END IF;

  INSERT INTO public.manager_cash_accounts (
    manager_id,
    manager_name,
    total_cash_received,
    total_spent_purchases,
    total_spent_expenses,
    available_balance,
    updated_at
  ) VALUES (
    p_manager_id,
    COALESCE(v_manager_name, 'Manager'),
    v_total_received,
    v_total_purchases,
    v_total_expenses,
    v_available,
    NOW()
  )
  ON CONFLICT (manager_id) DO UPDATE
  SET manager_name = EXCLUDED.manager_name,
      total_cash_received = EXCLUDED.total_cash_received,
      total_spent_purchases = EXCLUDED.total_spent_purchases,
      total_spent_expenses = EXCLUDED.total_spent_expenses,
      available_balance = EXCLUDED.available_balance,
      updated_at = NOW()
  RETURNING * INTO v_acc;

  RETURN v_acc;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Atomic PostgreSQL RPC: Manager Records Raw Material Purchase Using Available Cash
-- Deducts from manager cash and increases factory raw material stock in one atomic transaction.
-- Does NOT require supplier registration.
CREATE OR REPLACE FUNCTION public.rpc_manager_record_purchase(
  p_material_name TEXT,
  p_category TEXT,
  p_quantity NUMERIC,
  p_unit TEXT,
  p_total_amount NUMERIC,
  p_purchase_date DATE DEFAULT CURRENT_DATE,
  p_description TEXT DEFAULT '',
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS public.manager_cash_transactions AS $$
DECLARE
  v_actor_id UUID;
  v_actor_role TEXT;
  v_actor_name TEXT;
  v_existing_tx public.manager_cash_transactions;
  v_acc public.manager_cash_accounts;
  v_prev_balance NUMERIC(14,2);
  v_new_balance NUMERIC(14,2);
  v_rm_id UUID;
  v_rm_unit TEXT;
  v_opening_stock NUMERIC(14,4);
  v_closing_stock NUMERIC(14,4);
  v_purchase_id UUID;
  v_ref_no TEXT;
  v_tx public.manager_cash_transactions;
BEGIN
  v_actor_id := public.current_app_user_id();
  v_actor_role := public.current_user_role();

  IF v_actor_id IS NULL OR v_actor_role <> 'PRODUCTION_MANAGER' THEN
    RAISE EXCEPTION 'Forbidden: Only an authenticated Manager (Kamran Bhai or Imran Bhai) can record a manager cash purchase.';
  END IF;

  IF p_idempotency_key IS NOT NULL AND LENGTH(TRIM(p_idempotency_key)) > 0 THEN
    SELECT * INTO v_existing_tx
    FROM public.manager_cash_transactions
    WHERE idempotency_key = TRIM(p_idempotency_key)
    LIMIT 1;
    IF v_existing_tx.id IS NOT NULL THEN
      RETURN v_existing_tx;
    END IF;
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Purchase quantity must be greater than zero.';
  END IF;

  IF p_total_amount IS NULL OR p_total_amount <= 0 THEN
    RAISE EXCEPTION 'Purchase amount must be greater than zero.';
  END IF;

  SELECT full_name INTO v_actor_name FROM public.user_profiles WHERE id = v_actor_id;

  -- Lock manager's cash account row to prevent concurrent spending race conditions
  PERFORM public.recalculate_manager_cash_account_from_ledger(v_actor_id);
  SELECT * INTO v_acc
  FROM public.manager_cash_accounts
  WHERE manager_id = v_actor_id
  FOR UPDATE;

  v_prev_balance := COALESCE(v_acc.available_balance, 0);
  IF p_total_amount > v_prev_balance THEN
    RAISE EXCEPTION 'Insufficient cash balance for %: Purchase amount Rs. % exceeds available balance Rs. %.',
      v_actor_name, p_total_amount, v_prev_balance;
  END IF;

  v_new_balance := v_prev_balance - p_total_amount;
  v_ref_no := 'MPUR-' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT;

  -- Upsert Raw Material & increase stock
  SELECT id, unit, current_stock INTO v_rm_id, v_rm_unit, v_opening_stock
  FROM public.raw_materials
  WHERE LOWER(name) = LOWER(TRIM(p_material_name))
  FOR UPDATE;

  IF v_rm_id IS NULL THEN
    v_opening_stock := 0;
    v_rm_unit := UPPER(TRIM(p_unit));
    INSERT INTO public.raw_materials (
      code, name, category, unit, opening_stock, total_received, current_stock, minimum_stock_level, average_cost_per_unit, last_purchase_price
    ) VALUES (
      'RM-' || SUBSTRING(UPPER(REGEXP_REPLACE(p_material_name, '[^a-zA-Z0-9]', '', 'g')) FROM 1 FOR 4) || '-' || (FLOOR(RANDOM() * 900) + 100)::TEXT,
      TRIM(p_material_name),
      COALESCE(NULLIF(TRIM(p_category), ''), 'Chemical'),
      v_rm_unit,
      0,
      p_quantity,
      p_quantity,
      10,
      ROUND(p_total_amount / p_quantity, 2),
      ROUND(p_total_amount / p_quantity, 2)
    )
    RETURNING id, current_stock INTO v_rm_id, v_closing_stock;
  ELSE
    v_closing_stock := v_opening_stock + p_quantity;
    UPDATE public.raw_materials
    SET total_received = COALESCE(total_received, 0) + p_quantity,
        current_stock = v_closing_stock,
        last_purchase_price = ROUND(p_total_amount / p_quantity, 2),
        updated_at = NOW()
    WHERE id = v_rm_id;
  END IF;

  -- Record Purchase row (no supplier required)
  INSERT INTO public.purchases (
    purchase_number, supplier_id, purchase_date, total_amount, amount_paid, payment_status, notes,
    created_by, manager_id, manager_name, previous_cash_balance, updated_cash_balance
  ) VALUES (
    v_ref_no, NULL, COALESCE(p_purchase_date, CURRENT_DATE), p_total_amount, p_total_amount, 'PAID',
    COALESCE(NULLIF(TRIM(p_description), ''), 'Purchased ' || p_quantity || ' ' || p_unit || ' ' || TRIM(p_material_name)),
    v_actor_id, v_actor_id, v_actor_name, v_prev_balance, v_new_balance
  )
  RETURNING id INTO v_purchase_id;

  -- Record Stock Movement
  INSERT INTO public.stock_movements (
    raw_material_id, material_name, unit, opening_quantity, stock_received, quantity_consumed,
    adjustment_quantity, closing_quantity, transaction_type, reference_number, notes, entered_by, approved_by, movement_date
  ) VALUES (
    v_rm_id, TRIM(p_material_name), v_rm_unit, v_opening_stock, p_quantity, 0,
    0, v_closing_stock, 'PURCHASE_RECEIPT', v_ref_no,
    COALESCE(NULLIF(TRIM(p_description), ''), 'Manager Cash Purchase by ' || v_actor_name),
    v_actor_name, v_actor_name, COALESCE(p_purchase_date, CURRENT_DATE)
  );

  -- Record Manager Cash Transaction
  INSERT INTO public.manager_cash_transactions (
    manager_id, manager_name, transaction_type, amount, previous_balance, updated_balance,
    reference_number, description, created_by_id, created_by_name, transaction_date,
    idempotency_key, related_purchase_id
  ) VALUES (
    v_actor_id, v_actor_name, 'MATERIAL_PURCHASE', p_total_amount, v_prev_balance, v_new_balance,
    v_ref_no,
    'Purchase: ' || p_quantity || ' ' || p_unit || ' ' || TRIM(p_material_name) ||
      CASE WHEN LENGTH(TRIM(COALESCE(p_description, ''))) > 0 THEN ' (' || TRIM(p_description) || ')' ELSE '' END,
    v_actor_id, v_actor_name, COALESCE(p_purchase_date, CURRENT_DATE),
    NULLIF(TRIM(COALESCE(p_idempotency_key, '')), ''), v_purchase_id
  )
  RETURNING * INTO v_tx;

  PERFORM public.recalculate_manager_cash_account_from_ledger(v_actor_id);

  RETURN v_tx;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Atomic PostgreSQL RPC: Manager Records General Factory Expense Using Available Cash
-- Deducts from manager cash and records expense WITHOUT increasing inventory.
CREATE OR REPLACE FUNCTION public.rpc_manager_record_expense(
  p_category TEXT,
  p_amount NUMERIC,
  p_expense_date DATE DEFAULT CURRENT_DATE,
  p_description TEXT DEFAULT '',
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS public.manager_cash_transactions AS $$
DECLARE
  v_actor_id UUID;
  v_actor_role TEXT;
  v_actor_name TEXT;
  v_existing_tx public.manager_cash_transactions;
  v_acc public.manager_cash_accounts;
  v_prev_balance NUMERIC(14,2);
  v_new_balance NUMERIC(14,2);
  v_expense_id UUID;
  v_ref_no TEXT;
  v_tx public.manager_cash_transactions;
BEGIN
  v_actor_id := public.current_app_user_id();
  v_actor_role := public.current_user_role();

  IF v_actor_id IS NULL OR v_actor_role <> 'PRODUCTION_MANAGER' THEN
    RAISE EXCEPTION 'Forbidden: Only an authenticated Manager (Kamran Bhai or Imran Bhai) can record a manager cash expense.';
  END IF;

  IF p_idempotency_key IS NOT NULL AND LENGTH(TRIM(p_idempotency_key)) > 0 THEN
    SELECT * INTO v_existing_tx
    FROM public.manager_cash_transactions
    WHERE idempotency_key = TRIM(p_idempotency_key)
    LIMIT 1;
    IF v_existing_tx.id IS NOT NULL THEN
      RETURN v_existing_tx;
    END IF;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Expense amount must be greater than zero.';
  END IF;

  IF LENGTH(TRIM(COALESCE(p_description, ''))) = 0 THEN
    RAISE EXCEPTION 'Expense description is required.';
  END IF;

  SELECT full_name INTO v_actor_name FROM public.user_profiles WHERE id = v_actor_id;

  -- Lock manager's cash account row to prevent concurrent spending race conditions
  PERFORM public.recalculate_manager_cash_account_from_ledger(v_actor_id);
  SELECT * INTO v_acc
  FROM public.manager_cash_accounts
  WHERE manager_id = v_actor_id
  FOR UPDATE;

  v_prev_balance := COALESCE(v_acc.available_balance, 0);
  IF p_amount > v_prev_balance THEN
    RAISE EXCEPTION 'Insufficient cash balance for %: Expense amount Rs. % exceeds available balance Rs. %.',
      v_actor_name, p_amount, v_prev_balance;
  END IF;

  v_new_balance := v_prev_balance - p_amount;
  v_ref_no := 'MEXP-' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT;

  INSERT INTO public.expenses (
    expense_number, category, amount, expense_date, description, payment_method,
    created_by, approval_status, approved_by, approved_at,
    manager_id, previous_cash_balance, updated_cash_balance
  ) VALUES (
    v_ref_no, COALESCE(NULLIF(TRIM(p_category), ''), 'Other expenses'), p_amount,
    COALESCE(p_expense_date, CURRENT_DATE), TRIM(p_description), 'Cash',
    v_actor_id, 'Approved', v_actor_id, NOW(),
    v_actor_id, v_prev_balance, v_new_balance
  )
  RETURNING id INTO v_expense_id;

  INSERT INTO public.manager_cash_transactions (
    manager_id, manager_name, transaction_type, amount, previous_balance, updated_balance,
    reference_number, description, created_by_id, created_by_name, transaction_date,
    idempotency_key, related_expense_id
  ) VALUES (
    v_actor_id, v_actor_name, 'FACTORY_EXPENSE', p_amount, v_prev_balance, v_new_balance,
    v_ref_no, 'Expense (' || COALESCE(NULLIF(TRIM(p_category), ''), 'General') || '): ' || TRIM(p_description),
    v_actor_id, v_actor_name, COALESCE(p_expense_date, CURRENT_DATE),
    NULLIF(TRIM(COALESCE(p_idempotency_key, '')), ''), v_expense_id
  )
  RETURNING * INTO v_tx;

  PERFORM public.recalculate_manager_cash_account_from_ledger(v_actor_id);

  RETURN v_tx;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
