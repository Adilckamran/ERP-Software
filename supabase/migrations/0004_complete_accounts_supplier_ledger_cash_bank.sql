-- ============================================================================
-- MIGRATION 0004: COMPLETE ACCOUNTS, SUPPLIER LEDGER, CASH & BANK,
--                 SALES RETURNS, AND FACTORY SETTINGS WITH STRICT RLS
-- ============================================================================

-- 1. Supplier Ledger Table (Double-entry payable ledger per supplier)
CREATE TABLE IF NOT EXISTS supplier_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'OPENING_BALANCE',
    'PURCHASE_INVOICE',
    'PAYMENT_MADE',
    'PURCHASE_RETURN',
    'REVERSAL_ENTRY',
    'ADJUSTMENT'
  )),
  debit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  reference_number TEXT NOT NULL,
  payment_method TEXT DEFAULT 'Credit',
  reverses_entry_id UUID REFERENCES supplier_ledger(id),
  is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  entered_by_id UUID REFERENCES users(id),
  entered_by_name TEXT NOT NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Cash & Bank Accounts
CREATE TABLE IF NOT EXISTS cash_bank_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_code TEXT UNIQUE NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('CASH', 'BANK')),
  bank_name TEXT,
  account_number TEXT,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_receipts NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_payments NUMERIC(14,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Auditable Financial Transactions (Cash Receipts, Cash Payments, Bank Transfers)
CREATE TABLE IF NOT EXISTS financial_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_number TEXT UNIQUE NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'OPENING_BALANCE',
    'DEALER_PAYMENT_RECEIPT',
    'CASH_SALE_RECEIPT',
    'SUPPLIER_PAYMENT',
    'RAW_MATERIAL_CASH_PURCHASE',
    'EXPENSE_PAYMENT',
    'CASH_DEPOSIT_TO_BANK',
    'BANK_WITHDRAWAL_TO_CASH',
    'CAPITAL_INJECTION',
    'REVERSAL_ENTRY'
  )),
  account_id UUID REFERENCES cash_bank_accounts(id),
  account_name TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('INFLOW', 'OUTFLOW')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  balance_after NUMERIC(14,2) NOT NULL,
  payment_method TEXT NOT NULL,
  related_party_type TEXT,
  related_party_id TEXT,
  related_party_name TEXT NOT NULL,
  entered_by_id UUID REFERENCES users(id),
  entered_by_name TEXT NOT NULL,
  remarks TEXT NOT NULL DEFAULT '',
  is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  reverses_transaction_id UUID REFERENCES financial_transactions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Sales Returns
CREATE TABLE IF NOT EXISTS sales_returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_number TEXT UNIQUE NOT NULL,
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  order_id UUID REFERENCES orders(id),
  dealer_id UUID NOT NULL REFERENCES dealers(id),
  dealer_name TEXT NOT NULL,
  shop_name TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  bottle_size_label TEXT NOT NULL,
  quantity_cartons NUMERIC(12,2) NOT NULL CHECK (quantity_cartons > 0),
  rate_per_carton NUMERIC(12,2) NOT NULL CHECK (rate_per_carton >= 0),
  credit_amount NUMERIC(14,2) NOT NULL CHECK (credit_amount >= 0),
  reason TEXT NOT NULL,
  restock_good_condition BOOLEAN NOT NULL DEFAULT TRUE,
  entered_by_id UUID REFERENCES users(id),
  entered_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Factory Settings
CREATE TABLE IF NOT EXISTS factory_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name TEXT NOT NULL DEFAULT 'Fruity Fun Juice Factory',
  owner_name TEXT NOT NULL DEFAULT 'Sikandar Raja',
  owner_role_title TEXT NOT NULL DEFAULT 'Owner / Super Admin',
  factory_address TEXT NOT NULL DEFAULT 'Industrial Estate, Lahore, Pakistan',
  factory_phone TEXT NOT NULL DEFAULT '+92-300-8401122',
  ntn_strn TEXT NOT NULL DEFAULT 'NTN-8841209-7',
  currency TEXT NOT NULL DEFAULT 'PKR',
  default_credit_limit NUMERIC(14,2) NOT NULL DEFAULT 300000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Enable Strict Row Level Security (Owner-Only Financial Access)
ALTER TABLE supplier_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE factory_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only Owner accesses supplier_ledger"
  ON supplier_ledger FOR ALL
  USING (public.current_user_role() = 'OWNER')
  WITH CHECK (public.current_user_role() = 'OWNER');

CREATE POLICY "Only Owner accesses cash_bank_accounts"
  ON cash_bank_accounts FOR ALL
  USING (public.current_user_role() = 'OWNER')
  WITH CHECK (public.current_user_role() = 'OWNER');

CREATE POLICY "Only Owner accesses financial_transactions"
  ON financial_transactions FOR ALL
  USING (public.current_user_role() = 'OWNER')
  WITH CHECK (public.current_user_role() = 'OWNER');

CREATE POLICY "Only Owner accesses sales_returns"
  ON sales_returns FOR ALL
  USING (public.current_user_role() = 'OWNER')
  WITH CHECK (public.current_user_role() = 'OWNER');

CREATE POLICY "Authenticated users read factory_settings, Owner updates"
  ON factory_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Only Owner modifies factory_settings"
  ON factory_settings FOR ALL
  USING (public.current_user_role() = 'OWNER')
  WITH CHECK (public.current_user_role() = 'OWNER');
