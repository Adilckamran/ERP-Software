-- ============================================================================
-- MIGRATION 0011: DURABLE SUPABASE POSTGRESQL ERP STORAGE, ATOMIC CONCURRENCY
--                 LOCKING, AND MANAGER CASH STATEMENT / BILL CYCLES
-- ============================================================================
-- 1. Preserves all existing tables, triggers, RLS policies, and data from
--    migrations 0001 through 0010 without dropping or resetting anything.
-- 2. Grants schema usage and table privileges ONLY to the server-side
--    service_role (powered exclusively by SUPABASE_SERVICE_ROLE_KEY / sb_secret_
--    on the server) and authenticated RPC execution, never exposing tables to
--    unauthenticated anon requests.
-- 3. Creates public.manager_cash_statements and links public.manager_cash_transactions
--    via statement_id and statement_number.
-- 4. Creates public.erp_persistent_store with optimistic concurrency versioning
--    (version BIGINT) and atomic row-level FOR UPDATE locking RPCs so the entire
--    ERP state (all 36 collections, original string IDs, foreign keys, 12 real
--    manager cash transactions, 4 purchases, 6 expenses, 4 stock ledger entries,
--    and 27 raw materials) persists durably in Supabase PostgreSQL across
--    serverless deployments (Netlify / Vercel).
-- ============================================================================

-- 1. Server-Only Service Role Privileges (Never grants table access to anon)
GRANT USAGE ON SCHEMA public TO service_role, authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

-- 2. Manager Cash Statements Table (Cycle / Bill Tracking per Manager)
CREATE TABLE IF NOT EXISTS public.manager_cash_statements (
  id TEXT PRIMARY KEY,
  statement_number TEXT UNIQUE NOT NULL,
  cycle_index INTEGER NOT NULL CHECK (cycle_index >= 1),
  manager_id TEXT NOT NULL,
  manager_auth_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  manager_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'COMPLETED')),
  start_date DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  end_date DATE,
  ended_at TIMESTAMPTZ,
  issuance_transaction_id TEXT NOT NULL,
  issuance_reference_number TEXT NOT NULL,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
  cash_received NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cash_received >= 0),
  total_available_cash NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_available_cash >= 0),
  total_purchases NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_purchases >= 0),
  total_expenses NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_expenses >= 0),
  total_spent NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_spent >= 0),
  closing_balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (closing_balance >= 0),
  transaction_count INTEGER NOT NULL DEFAULT 0 CHECK (transaction_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manager_cash_statements_mgr_cycle
  ON public.manager_cash_statements(manager_id, cycle_index DESC);

ALTER TABLE public.manager_cash_statements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner views all manager cash statements; Manager views own" ON public.manager_cash_statements;
CREATE POLICY "Owner views all manager cash statements; Manager views own"
  ON public.manager_cash_statements FOR SELECT
  USING (
    public.current_user_role() = 'OWNER'
    OR manager_auth_id = public.current_app_user_id()
  );

DROP POLICY IF EXISTS "No user can delete manager_cash_statements" ON public.manager_cash_statements;
CREATE POLICY "No user can delete manager_cash_statements"
  ON public.manager_cash_statements FOR DELETE
  USING (FALSE);

-- 3. Add statement_id, statement_number, and source_tx_id to manager_cash_transactions
ALTER TABLE public.manager_cash_transactions
  ADD COLUMN IF NOT EXISTS source_tx_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS statement_id TEXT,
  ADD COLUMN IF NOT EXISTS statement_number TEXT,
  ADD COLUMN IF NOT EXISTS material_name TEXT,
  ADD COLUMN IF NOT EXISTS material_quantity NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS material_unit TEXT,
  ADD COLUMN IF NOT EXISTS expense_category TEXT;

-- 4. Durable Authoritative ERP State Store in PostgreSQL (with Optimistic Concurrency & Row Locking)
CREATE TABLE IF NOT EXISTS public.erp_persistent_store (
  store_key TEXT PRIMARY KEY DEFAULT 'PRODUCTION_MAIN',
  version BIGINT NOT NULL DEFAULT 1,
  state_json JSONB NOT NULL,
  sha256_checksum TEXT NOT NULL,
  tx_count INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.erp_persistent_store ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct client access to erp_persistent_store" ON public.erp_persistent_store;
CREATE POLICY "No direct client access to erp_persistent_store"
  ON public.erp_persistent_store FOR ALL
  USING (FALSE)
  WITH CHECK (FALSE);

GRANT ALL PRIVILEGES ON TABLE public.erp_persistent_store TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.manager_cash_statements TO service_role;

-- 5. Atomic Read & Compare-And-Swap Write RPCs for Authoritative PostgreSQL Persistence
CREATE OR REPLACE FUNCTION public.rpc_get_erp_persistent_store(
  p_store_key TEXT DEFAULT 'PRODUCTION_MAIN'
)
RETURNS TABLE (
  store_key TEXT,
  version BIGINT,
  state_json JSONB,
  sha256_checksum TEXT,
  tx_count INTEGER,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.store_key,
    s.version,
    s.state_json,
    s.sha256_checksum,
    s.tx_count,
    s.updated_at
  FROM public.erp_persistent_store s
  WHERE s.store_key = COALESCE(p_store_key, 'PRODUCTION_MAIN');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.rpc_save_erp_persistent_store_atomic(
  p_expected_version BIGINT,
  p_state_json JSONB,
  p_sha256_checksum TEXT,
  p_tx_count INTEGER,
  p_updated_by TEXT DEFAULT 'SERVER',
  p_store_key TEXT DEFAULT 'PRODUCTION_MAIN'
)
RETURNS TABLE (
  store_key TEXT,
  version BIGINT,
  sha256_checksum TEXT,
  tx_count INTEGER,
  updated_at TIMESTAMPTZ
) AS $$
DECLARE
  v_existing public.erp_persistent_store;
  v_saved public.erp_persistent_store;
BEGIN
  -- Lock the store row with FOR UPDATE to serialize concurrent serverless writes
  SELECT * INTO v_existing
  FROM public.erp_persistent_store s
  WHERE s.store_key = COALESCE(p_store_key, 'PRODUCTION_MAIN')
  FOR UPDATE;

  IF v_existing.store_key IS NULL THEN
    INSERT INTO public.erp_persistent_store (
      store_key,
      version,
      state_json,
      sha256_checksum,
      tx_count,
      updated_by,
      updated_at
    ) VALUES (
      COALESCE(p_store_key, 'PRODUCTION_MAIN'),
      1,
      p_state_json,
      p_sha256_checksum,
      p_tx_count,
      p_updated_by,
      NOW()
    )
    RETURNING * INTO v_saved;
  ELSE
    -- Optimistic concurrency check: reject stale writes if p_expected_version is provided and does not match
    IF p_expected_version IS NOT NULL AND p_expected_version > 0 AND v_existing.version <> p_expected_version THEN
      RAISE EXCEPTION 'CONCURRENCY_CONFLICT: Expected store version %, but database is at version %. Please retry.',
        p_expected_version, v_existing.version;
    END IF;

    -- Data safety check: never allow a transaction count regression unless explicitly authorized
    IF p_tx_count < v_existing.tx_count THEN
      RAISE EXCEPTION 'DATA_SAFETY_BLOCK: Refusing to overwrite store with fewer manager cash transactions (% < %).',
        p_tx_count, v_existing.tx_count;
    END IF;

    UPDATE public.erp_persistent_store s
    SET version = v_existing.version + 1,
        state_json = p_state_json,
        sha256_checksum = p_sha256_checksum,
        tx_count = p_tx_count,
        updated_by = p_updated_by,
        updated_at = NOW()
    WHERE s.store_key = v_existing.store_key
    RETURNING * INTO v_saved;
  END IF;

  RETURN QUERY
  SELECT
    v_saved.store_key,
    v_saved.version,
    v_saved.sha256_checksum,
    v_saved.tx_count,
    v_saved.updated_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Restrict RPC execution strictly to service_role (server-only sb_secret_)
REVOKE EXECUTE ON FUNCTION public.rpc_get_erp_persistent_store(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_save_erp_persistent_store_atomic(BIGINT, JSONB, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_erp_persistent_store(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_save_erp_persistent_store_atomic(BIGINT, JSONB, TEXT, INTEGER, TEXT, TEXT) TO service_role;
