-- ============================================================================
-- MIGRATION 0005: PHASE 0 — SUPABASE AUTH MAPPING, MANAGER DATA ISOLATION,
--                 PER-MANAGER CASH LEDGER FOUNDATION & ATOMIC CONSTRAINTS
-- ============================================================================
-- Preserves historical migrations 0001 through 0004 without destructive changes.
-- Fixes critical RLS identity mapping so Supabase Auth (auth.uid()) reliably
-- resolves the application user_profiles.id and role even when UUIDs differ.
-- ============================================================================

-- 1. Link application users and user_profiles to Supabase Auth (auth.users)
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'Factory Operations';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS can_record_purchases BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_auth_user_id ON user_profiles(auth_user_id);

-- 2. Canonical Identity & Role Helper Functions for Supabase RLS
-- Maps auth.uid() -> application user_profiles.id via EITHER auth_user_id OR id OR JWT email
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS UUID AS $$
  SELECT u.id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
     OR u.id = auth.uid()
     OR LOWER(u.email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
  SELECT u.role
  FROM public.users u
  WHERE u.id = public.current_app_user_id()
    AND u.is_active = TRUE
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Automatic trigger to bind auth.users sign-in/creation to public.users, public.user_profiles & public.manager_cash_accounts
CREATE OR REPLACE FUNCTION public.sync_auth_user_to_app_profile()
RETURNS TRIGGER AS $$
DECLARE
  v_email TEXT := LOWER(TRIM(COALESCE(NEW.email, '')));
  v_role TEXT;
  v_full_name TEXT;
  v_phone TEXT;
  v_dept TEXT;
  v_app_user_id UUID;
BEGIN
  IF v_email = '' THEN
    RETURN NEW;
  END IF;

  -- Determine canonical role and profile metadata for the 3 core factory accounts (or metadata fallback)
  IF v_email = 'sikandar@fruityfun.pk' THEN
    v_role := 'OWNER';
    v_full_name := 'Sikandar Raja';
    v_phone := '+92-300-8401122';
    v_dept := 'Executive Management';
  ELSIF v_email = 'kamran@fruityfun.pk' THEN
    v_role := 'PRODUCTION_MANAGER';
    v_full_name := 'Kamran Bhai';
    v_phone := '+92-321-4509988';
    v_dept := 'Factory Operations & Production';
  ELSIF v_email = 'imran@fruityfun.pk' THEN
    v_role := 'PRODUCTION_MANAGER';
    v_full_name := 'Imran Bhai';
    v_phone := '+92-322-4509977';
    v_dept := 'Factory Operations & Production';
  ELSE
    v_role := COALESCE(NEW.raw_user_meta_data ->> 'role', 'PRODUCTION_MANAGER');
    IF v_role NOT IN ('OWNER', 'PRODUCTION_MANAGER', 'BOOKER') THEN
      v_role := 'PRODUCTION_MANAGER';
    END IF;
    v_full_name := COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(v_email, '@', 1));
    v_phone := COALESCE(NEW.raw_user_meta_data ->> 'phone', '+92-300-0000000');
    v_dept := CASE WHEN v_role = 'OWNER' THEN 'Executive Management' ELSE 'Factory Operations & Production' END;
  END IF;

  -- 1. Create or link public.users row by email (never creates duplicate emails)
  SELECT id INTO v_app_user_id
  FROM public.users
  WHERE LOWER(email) = v_email
  LIMIT 1;

  IF v_app_user_id IS NULL THEN
    INSERT INTO public.users (id, auth_user_id, email, role, is_active, created_at, updated_at)
    VALUES (NEW.id, NEW.id, v_email, v_role, TRUE, NOW(), NOW())
    RETURNING id INTO v_app_user_id;
  ELSE
    UPDATE public.users
    SET auth_user_id = NEW.id,
        role = v_role,
        is_active = TRUE,
        updated_at = NOW()
    WHERE id = v_app_user_id;
  END IF;

  -- 2. Create or link public.user_profiles row matching public.users.id
  INSERT INTO public.user_profiles (
    id,
    auth_user_id,
    email,
    full_name,
    phone,
    role,
    is_active,
    department,
    can_record_purchases,
    duty_status,
    last_login_at,
    created_at,
    updated_at
  )
  VALUES (
    v_app_user_id,
    NEW.id,
    v_email,
    v_full_name,
    v_phone,
    v_role,
    TRUE,
    v_dept,
    TRUE,
    'ON_DUTY',
    NOW(),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET auth_user_id = EXCLUDED.auth_user_id,
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      is_active = TRUE,
      department = EXCLUDED.department,
      can_record_purchases = TRUE,
      updated_at = NOW();

  -- 3. If user is a Production Manager (Kamran Bhai or Imran Bhai), ensure their individual cash account exists
  IF v_role = 'PRODUCTION_MANAGER' AND to_regclass('public.manager_cash_accounts') IS NOT NULL THEN
    INSERT INTO public.manager_cash_accounts (
      manager_id,
      manager_name,
      total_cash_received,
      total_spent_purchases,
      total_spent_expenses,
      available_balance,
      updated_at
    )
    VALUES (
      v_app_user_id,
      v_full_name,
      0,
      0,
      0,
      0,
      NOW()
    )
    ON CONFLICT (manager_id) DO UPDATE
    SET manager_name = EXCLUDED.manager_name,
        updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_or_updated ON auth.users;
CREATE TRIGGER on_auth_user_created_or_updated
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_auth_user_to_app_profile();

-- 3. Relax supplier_id NOT NULL constraint on purchases (Factory buys from varied sources without requiring supplier registration)
ALTER TABLE purchases ALTER COLUMN supplier_id DROP NOT NULL;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES users(id);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS manager_name TEXT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS previous_cash_balance NUMERIC(14,2);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS updated_cash_balance NUMERIC(14,2);

-- Expand raw_materials unit constraint to support BOX, PIECE, PACKET alongside existing units
ALTER TABLE raw_materials DROP CONSTRAINT IF EXISTS raw_materials_unit_check;
ALTER TABLE raw_materials ADD CONSTRAINT raw_materials_unit_check CHECK (
  unit IN (
    'KG', 'GRAM', 'LITRE', 'ML', 'BOX', 'PIECE', 'PIECES', 'PACKET', 'PACKETS', 'CARTONS',
    'kg', 'liter', 'piece', 'carton', 'roll', 'gram', 'box', 'packet'
  )
);

-- Add previous_balance audit column to financial_transactions and expenses
ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS previous_balance NUMERIC(14,2);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES users(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS previous_cash_balance NUMERIC(14,2);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_cash_balance NUMERIC(14,2);

-- 4. Per-Manager Cash Accounts & Isolated Manager Cash Ledger (Kamran Bhai & Imran Bhai)
CREATE TABLE IF NOT EXISTS manager_cash_accounts (
  manager_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  manager_name TEXT NOT NULL,
  total_cash_received NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_cash_received >= 0),
  total_spent_purchases NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_spent_purchases >= 0),
  total_spent_expenses NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_spent_expenses >= 0),
  available_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS manager_cash_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  manager_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  manager_name TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'CASH_ISSUED_BY_OWNER',
    'MATERIAL_PURCHASE',
    'FACTORY_EXPENSE',
    'REVERSAL_ADJUSTMENT'
  )),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  previous_balance NUMERIC(14,2) NOT NULL,
  updated_balance NUMERIC(14,2) NOT NULL,
  reference_number TEXT NOT NULL,
  description TEXT NOT NULL,
  created_by_id UUID NOT NULL REFERENCES users(id),
  created_by_name TEXT NOT NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manager_cash_tx_manager_date
  ON manager_cash_transactions(manager_id, created_at DESC);

-- 5. Strict Manager-Specific Row Level Security (RLS)
-- Guarantees Kamran Bhai cannot view Imran Bhai's private cash records and vice versa,
-- and neither manager can issue cash to themselves.
ALTER TABLE manager_cash_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_cash_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner views all manager cash accounts; Manager views own only" ON manager_cash_accounts;
CREATE POLICY "Owner views all manager cash accounts; Manager views own only"
  ON manager_cash_accounts FOR SELECT
  USING (
    public.current_user_role() = 'OWNER'
    OR manager_id = public.current_app_user_id()
  );

DROP POLICY IF EXISTS "Only Owner or System RPC updates manager_cash_accounts" ON manager_cash_accounts;
CREATE POLICY "Only Owner or System RPC updates manager_cash_accounts"
  ON manager_cash_accounts FOR ALL
  USING (
    public.current_user_role() = 'OWNER'
    OR manager_id = public.current_app_user_id()
  )
  WITH CHECK (
    public.current_user_role() = 'OWNER'
    OR manager_id = public.current_app_user_id()
  );

DROP POLICY IF EXISTS "Owner views all manager cash txns; Manager views own only" ON manager_cash_transactions;
CREATE POLICY "Owner views all manager cash txns; Manager views own only"
  ON manager_cash_transactions FOR SELECT
  USING (
    public.current_user_role() = 'OWNER'
    OR manager_id = public.current_app_user_id()
  );

DROP POLICY IF EXISTS "Only Owner issues cash; Manager records own purchase/expense only" ON manager_cash_transactions;
CREATE POLICY "Only Owner issues cash; Manager records own purchase/expense only"
  ON manager_cash_transactions FOR INSERT
  WITH CHECK (
    (
      public.current_user_role() = 'OWNER'
      AND created_by_id = public.current_app_user_id()
    )
    OR (
      public.current_user_role() = 'PRODUCTION_MANAGER'
      AND manager_id = public.current_app_user_id()
      AND created_by_id = public.current_app_user_id()
      AND transaction_type IN ('MATERIAL_PURCHASE', 'FACTORY_EXPENSE')
    )
  );

-- 6. Fix Expenses & Purchases RLS so Managers only see their own private financial records while Owner sees all
DROP POLICY IF EXISTS "Only Owner and Production Manager view expenses" ON expenses;
CREATE POLICY "Owner views all expenses; Manager views own expenses only"
  ON expenses FOR SELECT
  USING (
    public.current_user_role() = 'OWNER'
    OR (
      public.current_user_role() = 'PRODUCTION_MANAGER'
      AND (created_by = public.current_app_user_id() OR manager_id = public.current_app_user_id())
    )
  );

DROP POLICY IF EXISTS "Owner and Production Manager insert expenses" ON expenses;
CREATE POLICY "Owner and Manager insert own expenses"
  ON expenses FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'OWNER'
    OR (
      public.current_user_role() = 'PRODUCTION_MANAGER'
      AND created_by = public.current_app_user_id()
    )
  );

DROP POLICY IF EXISTS "Owner and Production Manager access purchases" ON purchases;
CREATE POLICY "Owner views all purchases; Manager views own purchases"
  ON purchases FOR SELECT
  USING (
    public.current_user_role() = 'OWNER'
    OR (
      public.current_user_role() = 'PRODUCTION_MANAGER'
      AND (created_by = public.current_app_user_id() OR manager_id = public.current_app_user_id())
    )
  );

CREATE POLICY "Owner and Manager insert own purchases"
  ON purchases FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'OWNER'
    OR (
      public.current_user_role() = 'PRODUCTION_MANAGER'
      AND created_by = public.current_app_user_id()
    )
  );

-- 7. Atomic PostgreSQL RPC for Owner Issuing Cash to a Manager
CREATE OR REPLACE FUNCTION public.rpc_issue_cash_to_manager(
  p_manager_id UUID,
  p_amount NUMERIC,
  p_reference_number TEXT,
  p_description TEXT,
  p_transaction_date DATE DEFAULT CURRENT_DATE
)
RETURNS public.manager_cash_transactions AS $$
DECLARE
  v_actor_id UUID;
  v_actor_role TEXT;
  v_actor_name TEXT;
  v_manager_name TEXT;
  v_prev_balance NUMERIC(14,2);
  v_new_balance NUMERIC(14,2);
  v_tx public.manager_cash_transactions;
BEGIN
  v_actor_id := public.current_app_user_id();
  v_actor_role := public.current_user_role();

  IF v_actor_id IS NULL OR v_actor_role <> 'OWNER' THEN
    RAISE EXCEPTION 'Forbidden: Only the Owner (Sikandar Raja) can issue cash to managers.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Cash issuance amount must be greater than zero.';
  END IF;

  SELECT full_name INTO v_actor_name FROM public.user_profiles WHERE id = v_actor_id;
  SELECT full_name INTO v_manager_name FROM public.user_profiles WHERE id = p_manager_id;

  IF v_manager_name IS NULL THEN
    RAISE EXCEPTION 'Target manager account not found.';
  END IF;

  INSERT INTO public.manager_cash_accounts (manager_id, manager_name, total_cash_received, available_balance)
  VALUES (p_manager_id, v_manager_name, 0, 0)
  ON CONFLICT (manager_id) DO NOTHING;

  SELECT available_balance INTO v_prev_balance
  FROM public.manager_cash_accounts
  WHERE manager_id = p_manager_id
  FOR UPDATE;

  v_new_balance := v_prev_balance + p_amount;

  UPDATE public.manager_cash_accounts
  SET total_cash_received = total_cash_received + p_amount,
      available_balance = v_new_balance,
      updated_at = NOW()
  WHERE manager_id = p_manager_id;

  INSERT INTO public.manager_cash_transactions (
    manager_id,
    manager_name,
    transaction_type,
    amount,
    previous_balance,
    updated_balance,
    reference_number,
    description,
    created_by_id,
    created_by_name,
    transaction_date
  ) VALUES (
    p_manager_id,
    v_manager_name,
    'CASH_ISSUED_BY_OWNER',
    p_amount,
    v_prev_balance,
    v_new_balance,
    p_reference_number,
    p_description,
    v_actor_id,
    v_actor_name,
    COALESCE(p_transaction_date, CURRENT_DATE)
  )
  RETURNING * INTO v_tx;

  RETURN v_tx;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
