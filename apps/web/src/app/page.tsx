'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { ErpDatabaseState } from '@/lib/db/store';
import type { UserProfile, RoleName } from '@juice-erp/shared-types';
import { RawMaterialAndStockLedgerModule } from '@/components/RawMaterialAndStockLedgerModule';
import { ProductionBatchAndApprovalModule } from '@/components/ProductionBatchAndApprovalModule';
import { AdminOperationsAndFinanceModules } from '@/components/AdminOperationsAndFinanceModules';
import { BookerMobilePortalModule } from '@/components/BookerMobilePortalModule';
import { ManagerCashManagementModule } from '@/components/ManagerCashManagementModule';
import { BookerManagementModule } from '@/components/BookerManagementModule';
import { FactoryBusinessReportsModule } from '@/components/FactoryBusinessReportsModule';
import {
  LayoutDashboard,
  Package,
  Factory,
  ClipboardList,
  Boxes,
  ShoppingCart,
  Receipt,
  Users,
  Wrench,
  ShieldCheck,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Database,
  Truck,
  Building2,
  Wallet,
  Landmark,
  BarChart3,
  FileSpreadsheet,
  Settings,
  UserCircle,
  History,
  FlaskConical,
} from 'lucide-react';

type NavTab =
  | 'DASHBOARD'
  | 'MANAGER_CASH'
  | 'BOOKER_MANAGEMENT'
  | 'EMPLOYEES'
  | 'RAW_MATERIALS'
  | 'PURCHASES'
  | 'SUPPLIERS'
  | 'INVENTORY'
  | 'PRODUCTION_APPROVALS'
  | 'PRODUCTION_ENTRY'
  | 'MATERIAL_CONSUMPTION'
  | 'PRODUCTION_HISTORY'
  | 'FINISHED_GOODS'
  | 'SALES'
  | 'DISPATCH'
  | 'DEALERS'
  | 'DEALER_LEDGER'
  | 'SUPPLIER_LEDGER'
  | 'PAYMENTS'
  | 'EXPENSES'
  | 'CASH_AND_BANK'
  | 'PROFIT_AND_LOSS'
  | 'REPORTS'
  | 'AUDIT_LOGS'
  | 'SETTINGS'
  | 'MACHINES'
  | 'MY_PROFILE';

interface NavGroup {
  groupTitle: string;
  items: Array<{
    id: NavTab;
    label: string;
    icon: React.ComponentType<any>;
    badge?: number;
  }>;
}

function formatRoleLabel(role: RoleName): string {
  if (role === 'OWNER') return 'Owner / Super Admin';
  if (role === 'PRODUCTION_MANAGER') return 'Production Manager';
  return 'Booker';
}

export default function FruityFunFactoryErpApp() {
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [dbConnected, setDbConnected] = useState<boolean>(true);

  const [state, setState] = useState<ErpDatabaseState | null>(null);
  const [actor, setActor] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('DASHBOARD');
  const [busy, setBusy] = useState<boolean>(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [dashBookerFilter, setDashBookerFilter] = useState<string>('ALL');
  const [dashBookerDateFrom, setDashBookerDateFrom] = useState<string>('');
  const [dashBookerDateTo, setDashBookerDateTo] = useState<string>('');

  const fetchErpState = useCallback(async () => {
    try {
      const res = await fetch('/api/erp', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (res.status === 401) {
        setIsAuthenticated(false);
        setActor(null);
        setState(null);
        setDbConnected(true);
        return;
      }
      if (!res.ok || json.error) {
        setDbConnected(false);
        setBanner({ type: 'error', text: json.error || 'Database connection failed.' });
        return;
      }
      if (json.state && json.actor) {
        setDbConnected(true);
        setState(json.state);
        setActor(json.actor);
        setIsAuthenticated(true);
      }
    } catch (err: any) {
      setDbConnected(false);
      setBanner({ type: 'error', text: err?.message || 'Database connection error.' });
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    fetchErpState();
  }, [fetchErpState]);

  const runAction = async (
    action: string,
    payload: Record<string, any>,
    successMessage?: string
  ) => {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/erp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action, payload }),
      });
      const json = await res.json();
      if (res.status === 401) {
        setIsAuthenticated(false);
        setActor(null);
        setState(null);
        throw new Error(json.error || 'Session expired. Please sign in again.');
      }
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Operation failed');
      }
      if (json.state) {
        setState(json.state);
        if (json.actor) setActor(json.actor);
      } else {
        await fetchErpState();
      }
      if (successMessage) {
        setBanner({ type: 'success', text: successMessage });
      }
      return json;
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Transaction error' });
      return { ok: false, error: err?.message };
    } finally {
      setBusy(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setBusy(true);
    try {
      const res = await fetch('/api/erp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'AUTHENTICATE_USER',
          payload: {
            email: loginEmail.trim(),
            password: loginPassword,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setLoginError(json.error || 'Invalid email or password.');
        return;
      }
      setActor(json.actor);
      setState(json.state);
      setIsAuthenticated(true);
      setLoginPassword('');
      setActiveTab('DASHBOARD');
      setBanner(null);
    } catch (err: any) {
      setLoginError(err?.message || 'Unable to connect to authentication server.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      await fetch('/api/erp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'LOGOUT_USER', payload: {} }),
      });
    } finally {
      setIsAuthenticated(false);
      setActor(null);
      setState(null);
      setLoginPassword('');
      setBusy(false);
    }
  };

  // Phase 5 Section 1E: Chronological Recent Activity Feed across all 5 ledgers
  const recentActivityFeed = useMemo(() => {
    if (!state) return [];
    const activities: Array<{
      id: string;
      timestamp: string;
      date: string;
      category: string;
      reference: string;
      summary: string;
      performedBy: string;
    }> = [];

    for (const tx of state.manager_cash_transactions || []) {
      const catLabel =
        tx.transaction_type === 'CASH_ISSUED_BY_OWNER'
          ? 'Cash Issued'
          : tx.transaction_type === 'MATERIAL_PURCHASE'
          ? 'Manager Purchase'
          : tx.transaction_type === 'FACTORY_EXPENSE'
          ? 'Factory Expense'
          : 'Cash Reversal';
      activities.push({
        id: `act-mctx-${tx.id}`,
        timestamp: tx.created_at || tx.transaction_date,
        date: tx.transaction_date,
        category: catLabel,
        reference: tx.reference_number,
        summary: `${tx.description} (Rs. ${tx.amount.toLocaleString()})`,
        performedBy: tx.created_by_name || tx.manager_name,
      });
    }

    for (const sl of state.stock_ledger || []) {
      if (
        sl.transaction_type === 'STOCK_ADJUSTMENT' ||
        sl.transaction_type === 'STOCK_CORRECTION' ||
        sl.transaction_type === 'OPENING_STOCK'
      ) {
        activities.push({
          id: `act-sl-${sl.id}`,
          timestamp: sl.created_at || sl.date,
          date: sl.date,
          category:
            sl.transaction_type === 'OPENING_STOCK' ? 'Opening Stock' : 'Stock Adjustment',
          reference: sl.reference_number,
          summary: `${sl.material_name}: ${sl.notes || sl.transaction_type} (Closing: ${
            sl.updated_stock ?? sl.closing_quantity
          } ${sl.unit})`,
          performedBy: sl.entered_by_name || sl.entered_by || 'Owner',
        });
      }
    }

    for (const b of state.production_batches || []) {
      activities.push({
        id: `act-prod-${b.id}`,
        timestamp: b.submitted_at || b.created_at || b.production_date,
        date: b.production_date,
        category: b.is_reversed ? 'Production Reversed' : 'Production Confirmed',
        reference: b.batch_number,
        summary: `${b.actual_cartons.toLocaleString()} Cartons (${(
          b.total_pieces ?? b.actual_cartons * 24
        ).toLocaleString()} Pieces) of ${b.juice_type || b.product_name}`,
        performedBy: b.submitted_by_name || b.created_by_name || 'Production Manager',
      });
    }

    for (const btx of state.booker_transactions || []) {
      const catLabel =
        btx.transaction_type === 'CARTONS_GIVEN'
          ? 'Booker Carton Allocation'
          : btx.transaction_type === 'PAYMENT_RECEIVED'
          ? 'Booker Payment'
          : 'Booker Reversal';
      const detail =
        btx.transaction_type === 'CARTONS_GIVEN'
          ? `Gave ${btx.cartons_given} Cartons (${btx.pieces_given.toLocaleString()} Pcs) ${btx.juice_type} to ${btx.booker_name} — Payable: Rs. ${btx.amount_payable.toLocaleString()}`
          : btx.transaction_type === 'PAYMENT_RECEIVED'
          ? `Received Rs. ${btx.payment_received.toLocaleString()} from Booker ${btx.booker_name} (Remaining: Rs. ${btx.updated_outstanding_balance.toLocaleString()})`
          : btx.notes || `Reversed ${btx.reference_number}`;
      activities.push({
        id: `act-bkr-${btx.id}`,
        timestamp: btx.created_at || btx.transaction_date,
        date: btx.transaction_date,
        category: catLabel,
        reference: btx.reference_number,
        summary: detail,
        performedBy: btx.entered_by_name,
      });
    }

    return activities
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
      .slice(0, 15);
  }, [state]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] text-slate-700 text-xs font-semibold">
        Verifying Fruity Fun Juice Factory ERP session...
      </div>
    );
  }

  if (!isAuthenticated || !state || !actor) {
    return (
      <div className="min-h-screen bg-[#0B192C] flex items-center justify-center p-4">
        <div className="bg-white border border-slate-300 rounded max-w-sm w-full p-6 space-y-5 shadow-lg">
          <div className="border-b border-slate-200 pb-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-[#0B192C] text-white font-bold flex items-center justify-center text-xs tracking-wider shrink-0">
              FF
            </div>
            <div>
              <div className="text-slate-900 font-bold text-sm tracking-tight">
                FRUITY FUN JUICE FACTORY
              </div>
              <div className="text-xs text-slate-500">Factory Management ERP</div>
            </div>
          </div>

          {loginError && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-800 font-medium">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                autoComplete="username"
                placeholder="Enter your factory email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2 bg-[#0B192C] hover:bg-slate-800 disabled:opacity-50 text-white font-semibold text-xs rounded"
            >
              {busy ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const displayOwnerName =
    actor.role === 'OWNER' ? 'Sikandar Raja' : actor.full_name;
  const displayRoleTitle = formatRoleLabel(actor.role);

  const isAdmin = actor.role === 'OWNER';
  const isProdManager = actor.role === 'PRODUCTION_MANAGER';
  const isBooker = actor.role === 'BOOKER';

  const pendingApprovalsCount = state.production_batches.filter(
    (b) => b.status === 'SUBMITTED'
  ).length;
  const openTicketsCount = state.maintenance_records.filter(
    (m) => m.status !== 'Resolved'
  ).length;
  const pendingDispatchCount = state.orders.filter(
    (o) => o.status === 'Pending' || o.status === 'Approved'
  ).length;

  // 20 Modules for Admin Panel / 8 Modules for Production Manager Panel
  const navGroups: NavGroup[] = isAdmin
    ? [
        {
          groupTitle: 'Overview & People',
          items: [
            { id: 'DASHBOARD', label: '1. Dashboard', icon: LayoutDashboard },
            { id: 'MANAGER_CASH', label: 'Manager Cash Management', icon: Wallet },
            { id: 'BOOKER_MANAGEMENT', label: 'Booker Management', icon: Users },
            { id: 'EMPLOYEES', label: '2. Employees', icon: Users },
          ],
        },
        {
          groupTitle: 'Raw Materials & Purchasing',
          items: [
            { id: 'RAW_MATERIALS', label: '3. Raw Materials', icon: Package },
            { id: 'PURCHASES', label: '4. Purchases', icon: ShoppingCart },
            { id: 'SUPPLIERS', label: '5. Suppliers', icon: Building2 },
            { id: 'INVENTORY', label: '6. Inventory Ledger', icon: ClipboardList },
          ],
        },
        {
          groupTitle: 'Manufacturing & Stock',
          items: [
            {
              id: 'PRODUCTION_APPROVALS',
              label: '7. Production & History',
              icon: Factory,
              badge: pendingApprovalsCount,
            },
            { id: 'MATERIAL_CONSUMPTION', label: 'Material Consumption', icon: FlaskConical },
            { id: 'FINISHED_GOODS', label: '8. Finished Goods', icon: Boxes },
          ],
        },
        {
          groupTitle: 'Sales & Distribution',
          items: [
            { id: 'SALES', label: '9. Sales', icon: Receipt },
            {
              id: 'DISPATCH',
              label: '10. Dispatch',
              icon: Truck,
              badge: pendingDispatchCount,
            },
            { id: 'DEALERS', label: '11. Dealers', icon: Users },
          ],
        },
        {
          groupTitle: 'Accounts & Bookkeeping',
          items: [
            { id: 'DEALER_LEDGER', label: '12. Dealer Ledger', icon: ClipboardList },
            { id: 'SUPPLIER_LEDGER', label: '13. Supplier Ledger', icon: ClipboardList },
            { id: 'PAYMENTS', label: '14. Payments', icon: Wallet },
            { id: 'EXPENSES', label: '15. Expenses', icon: Receipt },
            { id: 'CASH_AND_BANK', label: '16. Cash & Bank', icon: Landmark },
            { id: 'PROFIT_AND_LOSS', label: '17. Profit & Loss', icon: BarChart3 },
          ],
        },
        {
          groupTitle: 'Reporting & System',
          items: [
            { id: 'REPORTS', label: '18. Reports', icon: FileSpreadsheet },
            { id: 'AUDIT_LOGS', label: '19. Audit History', icon: ShieldCheck },
            { id: 'SETTINGS', label: '20. Settings', icon: Settings },
          ],
        },
      ]
    : isProdManager
    ? [
        {
          groupTitle: 'Production Operations',
          items: [
            { id: 'DASHBOARD', label: '1. Dashboard & My Cash', icon: LayoutDashboard },
            { id: 'MANAGER_CASH', label: 'My Cash, Purchases & Expenses', icon: Wallet },
            { id: 'RAW_MATERIALS', label: '2. Available Raw Materials', icon: Package },
            { id: 'PRODUCTION_ENTRY', label: '3. Production Entry', icon: Factory },
            { id: 'MATERIAL_CONSUMPTION', label: '4. Material Consumption', icon: FlaskConical },
            { id: 'PRODUCTION_HISTORY', label: '5. Production History', icon: History },
            { id: 'FINISHED_GOODS', label: '6. Finished Goods Stock', icon: Boxes },
            { id: 'BOOKER_MANAGEMENT', label: 'Booker Management', icon: Users },
            {
              id: 'MACHINES',
              label: '7. Machine Issues',
              icon: Wrench,
              badge: openTicketsCount,
            },
            { id: 'MY_PROFILE', label: '8. My Profile', icon: UserCircle },
          ],
        },
      ]
    : [];

  // Operational metrics from real database
  const today = new Date().toISOString().split('T')[0];
  const approvedBatches = state.production_batches.filter(
    (b) =>
      !b.is_reversed &&
      b.status !== 'REVERSED' &&
      (b.status === 'CONFIRMED' || b.status === 'APPROVED' || b.status === 'Completed')
  );
  const pendingBatches = state.production_batches.filter((b) => b.status === 'SUBMITTED');
  const todayBatches = approvedBatches.filter((b) => b.production_date === today);

  // Phase 3: Apple, Mango, Combined & Manager-Wise Production Metrics
  const appleBatches = approvedBatches.filter((b) =>
    (b.juice_type || b.product_name || '').toLowerCase().includes('apple')
  );
  const mangoBatches = approvedBatches.filter((b) =>
    (b.juice_type || b.product_name || '').toLowerCase().includes('mango')
  );

  const appleDailyCartons = appleBatches
    .filter((b) => b.production_date === today)
    .reduce((sum, b) => sum + b.actual_cartons, 0);
  const appleTotalCartons = appleBatches.reduce((sum, b) => sum + b.actual_cartons, 0);
  const appleTotalPieces = appleTotalCartons * 24;
  const appleFg = state.finished_goods.find((fg) =>
    fg.product_name.toLowerCase().includes('apple')
  );
  const appleCurrentCartons = appleFg?.available_cartons ?? 0;
  const appleCurrentPieces = appleFg?.available_bottles ?? appleCurrentCartons * 24;

  const mangoDailyCartons = mangoBatches
    .filter((b) => b.production_date === today)
    .reduce((sum, b) => sum + b.actual_cartons, 0);
  const mangoTotalCartons = mangoBatches.reduce((sum, b) => sum + b.actual_cartons, 0);
  const mangoTotalPieces = mangoTotalCartons * 24;
  const mangoFg = state.finished_goods.find((fg) =>
    fg.product_name.toLowerCase().includes('mango')
  );
  const mangoCurrentCartons = mangoFg?.available_cartons ?? 0;
  const mangoCurrentPieces = mangoFg?.available_bottles ?? mangoCurrentCartons * 24;

  const combinedTotalCartons = appleTotalCartons + mangoTotalCartons;
  const combinedTotalPieces = appleTotalPieces + mangoTotalPieces;
  const totalRawMaterialConsumedLines = approvedBatches.reduce(
    (sum, b) => sum + b.material_usage.length,
    0
  );
  const totalRawMaterialConsumedQty = Number(
    approvedBatches
      .reduce(
        (sum, b) =>
          sum + b.material_usage.reduce((mSum, u) => mSum + (u.actual_quantity || 0), 0),
        0
      )
      .toFixed(4)
  );

  const kamranBatches = approvedBatches.filter(
    (b) =>
      b.created_by === 'user-mgr-kamran' ||
      b.submitted_by === 'user-mgr-kamran' ||
      b.submitted_by_id === 'user-mgr-kamran' ||
      (b.submitted_by_name || b.created_by_name || '').toLowerCase().includes('kamran')
  );
  const kamranAppleCartons = kamranBatches
    .filter((b) => (b.juice_type || b.product_name || '').toLowerCase().includes('apple'))
    .reduce((sum, b) => sum + b.actual_cartons, 0);
  const kamranMangoCartons = kamranBatches
    .filter((b) => (b.juice_type || b.product_name || '').toLowerCase().includes('mango'))
    .reduce((sum, b) => sum + b.actual_cartons, 0);

  const imranBatches = approvedBatches.filter(
    (b) =>
      b.created_by === 'user-mgr-imran' ||
      b.submitted_by === 'user-mgr-imran' ||
      b.submitted_by_id === 'user-mgr-imran' ||
      (b.submitted_by_name || b.created_by_name || '').toLowerCase().includes('imran')
  );
  const imranAppleCartons = imranBatches
    .filter((b) => (b.juice_type || b.product_name || '').toLowerCase().includes('apple'))
    .reduce((sum, b) => sum + b.actual_cartons, 0);
  const imranMangoCartons = imranBatches
    .filter((b) => (b.juice_type || b.product_name || '').toLowerCase().includes('mango'))
    .reduce((sum, b) => sum + b.actual_cartons, 0);

  // Phase 4: Booker Overview Metrics & Filtered Booker-Wise Table
  const allBookers = state.bookers || [];
  const allBookerTxs = (state.booker_transactions || []).filter(
    (t) => !t.is_reversed && t.transaction_type !== 'REVERSAL_ENTRY'
  );
  const hasBookerDateFilter = Boolean(dashBookerDateFrom || dashBookerDateTo);
  const filteredDashBookerRows = allBookers
    .filter((b) => dashBookerFilter === 'ALL' || b.id === dashBookerFilter)
    .map((b) => {
      if (!hasBookerDateFilter) {
        return {
          id: b.id,
          booker_name: b.booker_name,
          cartons_given: b.total_cartons_received,
          apple_cartons: b.apple_cartons_received,
          mango_cartons: b.mango_cartons_received,
          total_amount: b.total_amount_payable,
          received: b.total_payments_received,
          outstanding: b.remaining_outstanding_amount,
        };
      }
      const bTxs = allBookerTxs.filter((t) => {
        if (t.booker_id !== b.id) return false;
        if (dashBookerDateFrom && t.transaction_date < dashBookerDateFrom) return false;
        if (dashBookerDateTo && t.transaction_date > dashBookerDateTo) return false;
        return true;
      });
      const appleCtn = bTxs
        .filter((t) => t.transaction_type === 'CARTONS_GIVEN' && t.juice_type === 'Apple Juice')
        .reduce((s, t) => s + t.cartons_given, 0);
      const mangoCtn = bTxs
        .filter((t) => t.transaction_type === 'CARTONS_GIVEN' && t.juice_type === 'Mango Juice')
        .reduce((s, t) => s + t.cartons_given, 0);
      const totAmt = Number(
        bTxs
          .filter((t) => t.transaction_type === 'CARTONS_GIVEN')
          .reduce((s, t) => s + t.amount_payable, 0)
          .toFixed(2)
      );
      const recAmt = Number(
        bTxs
          .filter((t) => t.transaction_type === 'PAYMENT_RECEIVED')
          .reduce((s, t) => s + t.payment_received, 0)
          .toFixed(2)
      );
      return {
        id: b.id,
        booker_name: b.booker_name,
        cartons_given: appleCtn + mangoCtn,
        apple_cartons: appleCtn,
        mango_cartons: mangoCtn,
        total_amount: totAmt,
        received: recAmt,
        outstanding: Number((totAmt - recAmt).toFixed(2)),
      };
    });

  const dashTotalActiveBookers = allBookers.filter((b) => b.is_active).length;
  const dashTotalBookerCartons = filteredDashBookerRows.reduce((s, r) => s + r.cartons_given, 0);
  const dashTotalBookerPayable = filteredDashBookerRows.reduce((s, r) => s + r.total_amount, 0);
  const dashTotalBookerReceived = filteredDashBookerRows.reduce((s, r) => s + r.received, 0);
  const dashTotalBookerOutstanding = filteredDashBookerRows.reduce((s, r) => s + r.outstanding, 0);

  const todayProducedBottles = todayBatches.reduce(
    (sum, b) =>
      sum +
      (b.total_pieces ??
        b.actual_bottles ??
        Math.round(b.actual_cartons * (b.units_per_carton || 24))),
    0
  );
  const lowStockItems = state.raw_materials.filter(
    (rm) => rm.minimum_stock_level > 0 && rm.current_stock <= rm.minimum_stock_level
  );
  const totalFinishedBottles = state.finished_goods.reduce(
    (sum, fg) =>
      sum +
      (fg.available_bottles ?? Math.round(fg.available_cartons * (fg.units_per_carton || 24))),
    0
  );
  const todayPurchasesAmount = state.purchases
    .filter((p) => p.purchase_date === today)
    .reduce((sum, p) => sum + p.total_amount, 0);
  const totalPurchasesAmount = state.purchases.reduce((sum, p) => sum + p.total_amount, 0);

  const dispatchedOrders = state.orders.filter(
    (o) => o.status === 'Dispatched' || o.status === 'Delivered'
  );
  const todaySalesAmount = dispatchedOrders
    .filter((o) => o.order_date === today)
    .reduce((sum, o) => sum + o.total_amount, 0);
  const totalSalesAmount = dispatchedOrders.reduce((sum, o) => sum + o.total_amount, 0);
  const totalCogs = dispatchedOrders.reduce((sum, o) => sum + o.total_cogs, 0);

  const totalReceivables = state.dealers.reduce((sum, d) => sum + d.outstanding_balance, 0);
  const totalExpenses = state.expenses
    .filter((e) => e.approval_status === 'Approved')
    .reduce((sum, e) => sum + e.amount, 0);
  const netProfitLoss = totalSalesAmount - totalCogs - totalExpenses;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F8FAFC] text-slate-900">
      {/* DEEP NAVY SIDEBAR */}
      {!isBooker && (
        <aside className="w-full md:w-56 bg-[#0B192C] text-slate-200 flex flex-col justify-between shrink-0 no-print border-r border-slate-800">
          <div>
            <div className="px-4 py-3.5 border-b border-slate-800 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded bg-emerald-700 text-white font-bold flex items-center justify-center text-xs tracking-wider shrink-0">
                FF
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">
                  Fruity Fun Juice Factory
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  Factory Management ERP
                </div>
              </div>
            </div>

            <nav className="p-2 space-y-3 overflow-y-auto max-h-[calc(100vh-130px)]">
              {navGroups.map((group) => (
                <div key={group.groupTitle} className="space-y-0.5">
                  <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {group.groupTitle}
                  </div>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveTab(item.id)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded transition ${
                          active
                            ? 'bg-slate-800 text-white font-semibold border-l-2 border-emerald-500'
                            : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <Icon className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                          <span className="truncate">{item.label}</span>
                        </span>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500/90 text-slate-950 tabular-nums">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>

          {/* Active User Profile Footer */}
          <div className="p-3 border-t border-slate-800 bg-[#081220] text-xs">
            <div className="font-semibold text-white truncate">{displayOwnerName}</div>
            <div className="text-[11px] text-emerald-400 font-medium truncate">
              {displayRoleTitle}
            </div>
            <div className="text-[11px] text-slate-400 truncate mt-0.5">{actor.email}</div>
          </div>
        </aside>
      )}

      {/* WORKSPACE AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-3">
            {isBooker && (
              <div className="w-6 h-6 rounded bg-[#0B192C] text-white font-bold flex items-center justify-center text-[10px]">
                FF
              </div>
            )}
            <span className="text-xs font-bold text-slate-900">
              Fruity Fun Juice Factory
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-xs font-semibold text-slate-700">
              {displayOwnerName}
            </span>
            <span className="px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-300 rounded">
              {displayRoleTitle}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Database Connection Status */}
            <div
              className={`flex items-center gap-1.5 border rounded px-2 py-1 text-xs ${
                dbConnected
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-300 text-red-800'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span className="font-medium">
                {dbConnected ? 'DB Connected' : 'DB Disconnected'}
              </span>
              {isAdmin && state.environment_mode !== 'PRODUCTION_CLEAN' && (
                <button
                  type="button"
                  onClick={() =>
                    runAction(
                      'SWITCH_ENVIRONMENT_MODE',
                      { mode: 'PRODUCTION_CLEAN' },
                      'Reset to Clean Production Database.'
                    )
                  }
                  className="ml-1 px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[11px] font-semibold text-slate-800 hover:bg-slate-100"
                >
                  Reset Clean
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('MY_PROFILE')}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded"
            >
              <UserCircle className="w-3.5 h-3.5" />
              My Profile
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-5 max-w-7xl w-full mx-auto space-y-4">
          {banner && (
            <div
              className={`px-3.5 py-2 rounded border flex items-center justify-between text-xs font-medium no-print ${
                banner.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-red-50 border-red-300 text-red-900'
              }`}
            >
              <span className="flex items-center gap-2">
                {banner.type === 'success' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-red-700 shrink-0" />
                )}
                {banner.text}
              </span>
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="text-slate-500 hover:text-slate-800 ml-4"
              >
                ✕
              </button>
            </div>
          )}

          {/* BOOKER PANEL */}
          {isBooker && activeTab !== 'MY_PROFILE' && (
            <BookerMobilePortalModule
              db={state}
              actor={actor}
              onMutate={async (action, payload) => {
                const r = await runAction(action, payload);
                return Boolean(r?.ok);
              }}
              showToast={(msg, type) =>
                setBanner({ type: type || 'success', text: msg })
              }
            />
          )}

          {/* ADMIN / OWNER DASHBOARD (PHASE 5 CENTRAL DASHBOARD FOR SIKANDAR RAJA) */}
          {isAdmin && activeTab === 'DASHBOARD' && (
            <div className="space-y-4">
              {/* SECTION A: MANAGER CASH OVERVIEW (Kamran Bhai, Imran Bhai & Combined) */}
              <ManagerCashManagementModule
                state={state}
                actor={actor}
                busy={busy}
                runAction={runAction}
              />

              {/* SECTION B: RAW MATERIAL INVENTORY OVERVIEW */}
              <div className="bg-white border border-slate-200 rounded overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      B. Raw Material Inventory Overview (27 Factory Materials)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Live stock status using actual configured minimum stock thresholds, recent purchases, and stock movements
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('RAW_MATERIALS')}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded"
                    >
                      Open 27-Material Inventory →
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('INVENTORY')}
                      className="px-2.5 py-1 text-xs font-semibold text-white bg-[#0B192C] hover:bg-slate-800 rounded"
                    >
                      Stock Movement Ledger →
                    </button>
                  </div>
                </div>

                {/* 4 Raw Material Inventory KPI Counters */}
                <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-200 border-b border-slate-200">
                  <div className="p-3">
                    <div className="text-[11px] font-medium text-slate-500">
                      Total Number of Materials
                    </div>
                    <div className="text-sm font-bold tabular-nums text-slate-900 mt-1">
                      {state.raw_materials.length} Materials
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="text-[11px] font-medium text-slate-500">
                      Materials In Stock
                    </div>
                    <div className="text-sm font-bold tabular-nums text-emerald-700 mt-1">
                      {state.raw_materials.filter((rm) => rm.current_stock > 0).length} In Stock
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="text-[11px] font-medium text-slate-500">
                      Low Stock Materials
                    </div>
                    <div className="text-sm font-bold tabular-nums text-amber-800 mt-1">
                      {lowStockItems.length} Low Stock
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="text-[11px] font-medium text-slate-500">
                      Out of Stock Materials
                    </div>
                    <div className="text-sm font-bold tabular-nums text-red-700 mt-1">
                      {state.raw_materials.filter((rm) => rm.current_stock <= 0).length} Out of Stock
                    </div>
                  </div>
                </div>

                {/* Recent Purchases & Recent Stock Movements */}
                <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
                  <div className="p-3 space-y-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Recent Raw Material Purchases
                    </div>
                    {state.material_purchase_receipts.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded border border-slate-200">
                        No recent purchases recorded.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                              <th className="py-1.5 px-2">Date</th>
                              <th className="py-1.5 px-2">Material</th>
                              <th className="py-1.5 px-2 text-right">Qty</th>
                              <th className="py-1.5 px-2 text-right">Amount</th>
                              <th className="py-1.5 px-2">By</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {state.material_purchase_receipts.slice(0, 5).map((pr) => (
                              <tr key={pr.id}>
                                <td className="py-1.5 px-2 tabular-nums text-slate-600">
                                  {pr.purchase_date}
                                </td>
                                <td className="py-1.5 px-2 font-semibold text-slate-900">
                                  {pr.material_name}
                                </td>
                                <td className="py-1.5 px-2 text-right tabular-nums">
                                  {pr.quantity_entered} {pr.unit_entered}
                                </td>
                                <td className="py-1.5 px-2 text-right tabular-nums font-semibold">
                                  Rs. {pr.purchase_price_total.toLocaleString()}
                                </td>
                                <td className="py-1.5 px-2 text-slate-700">{pr.entered_by_name}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="p-3 space-y-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Recent Stock Movements
                    </div>
                    {state.stock_ledger.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded border border-slate-200">
                        No stock movements recorded.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                              <th className="py-1.5 px-2">Date</th>
                              <th className="py-1.5 px-2">Material</th>
                              <th className="py-1.5 px-2">Type</th>
                              <th className="py-1.5 px-2 text-right">Updated Stock</th>
                              <th className="py-1.5 px-2">By</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {state.stock_ledger.slice(0, 5).map((sl) => (
                              <tr key={sl.id}>
                                <td className="py-1.5 px-2 tabular-nums text-slate-600">
                                  {sl.date}
                                </td>
                                <td className="py-1.5 px-2 font-semibold text-slate-900">
                                  {sl.material_name}
                                </td>
                                <td className="py-1.5 px-2 text-slate-700">
                                  {sl.transaction_type}
                                </td>
                                <td className="py-1.5 px-2 text-right tabular-nums font-bold">
                                  {sl.updated_stock ?? sl.closing_quantity} {sl.unit}
                                </td>
                                <td className="py-1.5 px-2 text-slate-700">
                                  {sl.entered_by_name || sl.entered_by}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION C: PRODUCTION OVERVIEW (Apple, Mango, Combined & Manager Activity) */}
              <div className="bg-white border border-slate-200 rounded overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      C. Production Overview — Apple Juice &amp; Mango Juice (1 Carton = 24 Pieces)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Daily cartons &amp; pieces, total cumulative output, current available finished goods stock, and manager activity
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('PRODUCTION_APPROVALS')}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded"
                    >
                      Production History →
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('MATERIAL_CONSUMPTION')}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded"
                    >
                      Material Consumption →
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('FINISHED_GOODS')}
                      className="px-2.5 py-1 text-xs font-semibold text-white bg-[#0B192C] hover:bg-slate-800 rounded"
                    >
                      Finished Goods Stock →
                    </button>
                  </div>
                </div>

                {/* Apple, Mango, and Combined Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 border-b border-slate-200">
                  {/* Apple Juice */}
                  <div className="p-3.5 space-y-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-900">
                      Apple Juice (1 Carton = 24 Pieces)
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-slate-50 p-2 rounded border border-slate-200">
                        <div className="text-[11px] text-slate-500">Today&apos;s Production</div>
                        <div className="font-bold tabular-nums text-slate-900 mt-0.5">
                          {appleDailyCartons.toLocaleString()} Ctn ({(appleDailyCartons * 24).toLocaleString()} Pcs)
                        </div>
                      </div>
                      <div className="bg-slate-50 p-2 rounded border border-slate-200">
                        <div className="text-[11px] text-slate-500">Total Produced</div>
                        <div className="font-bold tabular-nums text-emerald-700 mt-0.5">
                          {appleTotalCartons.toLocaleString()} Ctn ({appleTotalPieces.toLocaleString()} Pcs)
                        </div>
                      </div>
                      <div className="bg-slate-50 p-2 rounded border border-slate-200">
                        <div className="text-[11px] text-slate-500">Current Available</div>
                        <div className="font-bold tabular-nums text-slate-900 mt-0.5">
                          {appleCurrentCartons.toLocaleString()} Ctn ({appleCurrentPieces.toLocaleString()} Pcs)
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Mango Juice */}
                  <div className="p-3.5 space-y-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-900">
                      Mango Juice (1 Carton = 24 Pieces)
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-slate-50 p-2 rounded border border-slate-200">
                        <div className="text-[11px] text-slate-500">Today&apos;s Production</div>
                        <div className="font-bold tabular-nums text-slate-900 mt-0.5">
                          {mangoDailyCartons.toLocaleString()} Ctn ({(mangoDailyCartons * 24).toLocaleString()} Pcs)
                        </div>
                      </div>
                      <div className="bg-slate-50 p-2 rounded border border-slate-200">
                        <div className="text-[11px] text-slate-500">Total Produced</div>
                        <div className="font-bold tabular-nums text-emerald-700 mt-0.5">
                          {mangoTotalCartons.toLocaleString()} Ctn ({mangoTotalPieces.toLocaleString()} Pcs)
                        </div>
                      </div>
                      <div className="bg-slate-50 p-2 rounded border border-slate-200">
                        <div className="text-[11px] text-slate-500">Current Available</div>
                        <div className="font-bold tabular-nums text-slate-900 mt-0.5">
                          {mangoCurrentCartons.toLocaleString()} Ctn ({mangoCurrentPieces.toLocaleString()} Pcs)
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Combined Production */}
                  <div className="p-3.5 space-y-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-900">
                      Combined Factory Output
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-slate-50 p-2 rounded border border-slate-200">
                        <div className="text-[11px] text-slate-500">Combined Daily</div>
                        <div className="font-bold tabular-nums text-slate-900 mt-0.5">
                          {(appleDailyCartons + mangoDailyCartons).toLocaleString()} Ctn (
                          {((appleDailyCartons + mangoDailyCartons) * 24).toLocaleString()} Pcs)
                        </div>
                      </div>
                      <div className="bg-slate-50 p-2 rounded border border-slate-200">
                        <div className="text-[11px] text-slate-500">Combined Total</div>
                        <div className="font-bold tabular-nums text-emerald-800 mt-0.5">
                          {combinedTotalCartons.toLocaleString()} Ctn ({combinedTotalPieces.toLocaleString()} Pcs)
                        </div>
                      </div>
                      <div className="bg-slate-50 p-2 rounded border border-slate-200">
                        <div className="text-[11px] text-slate-500">Current Stock</div>
                        <div className="font-bold tabular-nums text-slate-900 mt-0.5">
                          {(appleCurrentCartons + mangoCurrentCartons).toLocaleString()} Ctn (
                          {(appleCurrentPieces + mangoCurrentPieces).toLocaleString()} Pcs)
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Manager-Wise Production Activity (Kamran Bhai & Imran Bhai) */}
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 bg-slate-50/40">
                  <div className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-bold text-slate-900">Kamran Bhai</span>
                      <span className="text-slate-500 ml-1.5">(Production Manager)</span>
                    </div>
                    <div className="flex items-center gap-3 tabular-nums">
                      <span>
                        Production Entries: <strong>{kamranBatches.length}</strong>
                      </span>
                      <span className="text-slate-300">|</span>
                      <span>
                        Apple Cartons: <strong>{kamranAppleCartons.toLocaleString()}</strong>
                      </span>
                      <span className="text-slate-300">|</span>
                      <span>
                        Mango Cartons: <strong>{kamranMangoCartons.toLocaleString()}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-bold text-slate-900">Imran Bhai</span>
                      <span className="text-slate-500 ml-1.5">(Production Manager)</span>
                    </div>
                    <div className="flex items-center gap-3 tabular-nums">
                      <span>
                        Production Entries: <strong>{imranBatches.length}</strong>
                      </span>
                      <span className="text-slate-300">|</span>
                      <span>
                        Apple Cartons: <strong>{imranAppleCartons.toLocaleString()}</strong>
                      </span>
                      <span className="text-slate-300">|</span>
                      <span>
                        Mango Cartons: <strong>{imranMangoCartons.toLocaleString()}</strong>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION D: BOOKER OVERVIEW */}
              <div className="bg-white border border-slate-200 rounded overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      D. Booker Overview &amp; Accounts Summary
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Factory-to-Booker carton allocations, payments received, and remaining outstanding balances
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 no-print">
                    <select
                      value={dashBookerFilter}
                      onChange={(e) => setDashBookerFilter(e.target.value)}
                      className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded font-medium"
                    >
                      <option value="ALL">All Bookers</option>
                      {allBookers.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.booker_name}
                        </option>
                      ))}
                    </select>

                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-slate-500">From:</span>
                      <input
                        type="date"
                        value={dashBookerDateFrom}
                        onChange={(e) => setDashBookerDateFrom(e.target.value)}
                        className="px-2 py-1 text-xs bg-white border border-slate-300 rounded tabular-nums"
                      />
                      <span className="text-slate-500">To:</span>
                      <input
                        type="date"
                        value={dashBookerDateTo}
                        onChange={(e) => setDashBookerDateTo(e.target.value)}
                        className="px-2 py-1 text-xs bg-white border border-slate-300 rounded tabular-nums"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveTab('BOOKER_MANAGEMENT')}
                      className="px-2.5 py-1 text-xs font-semibold text-white bg-[#0B192C] hover:bg-slate-800 rounded"
                    >
                      Open Booker Management →
                    </button>
                  </div>
                </div>

                {/* 5 Booker Overview KPI Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-slate-200 border-b border-slate-200">
                  <div className="p-3">
                    <div className="text-[11px] font-medium text-slate-500">
                      Total Active Bookers
                    </div>
                    <div className="text-sm font-bold tabular-nums text-slate-900 mt-1">
                      {dashTotalActiveBookers}
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="text-[11px] font-medium text-slate-500">
                      Total Cartons Given
                    </div>
                    <div className="text-sm font-bold tabular-nums text-slate-900 mt-1">
                      {dashTotalBookerCartons.toLocaleString()} Cartons (
                      {(dashTotalBookerCartons * 24).toLocaleString()} Pcs)
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="text-[11px] font-medium text-slate-500">
                      Total Amount Payable
                    </div>
                    <div className="text-sm font-bold tabular-nums text-slate-900 mt-1">
                      Rs. {dashTotalBookerPayable.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="text-[11px] font-medium text-slate-500">
                      Total Payments Received
                    </div>
                    <div className="text-sm font-bold tabular-nums text-emerald-700 mt-1">
                      Rs. {dashTotalBookerReceived.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="text-[11px] font-medium text-slate-500">
                      Total Outstanding Amount
                    </div>
                    <div className="text-sm font-bold tabular-nums text-amber-800 mt-1">
                      Rs. {dashTotalBookerOutstanding.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Booker-Wise Summary Table */}
                {filteredDashBookerRows.length === 0 ? (
                  <div className="p-5 text-center text-xs text-slate-500">
                    No booker accounts recorded yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/50">
                          <th className="py-2 px-3">Booker</th>
                          <th className="py-2 px-3 text-right">Cartons Given</th>
                          <th className="py-2 px-3 text-right">Total Amount</th>
                          <th className="py-2 px-3 text-right">Received</th>
                          <th className="py-2 px-3 text-right">Outstanding</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {filteredDashBookerRows.map((row) => (
                          <tr key={row.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-bold text-slate-900">
                              {row.booker_name}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums font-semibold text-slate-900">
                              {row.cartons_given.toLocaleString()} Ctn (Apple: {row.apple_cartons} | Mango:{' '}
                              {row.mango_cartons})
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums font-semibold text-slate-900">
                              Rs. {row.total_amount.toLocaleString()}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums font-semibold text-emerald-700">
                              Rs. {row.received.toLocaleString()}
                            </td>
                            <td
                              className={`py-2 px-3 text-right tabular-nums font-bold ${
                                row.outstanding > 0 ? 'text-amber-800' : 'text-emerald-700'
                              }`}
                            >
                              Rs. {row.outstanding.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* SECTION E: CHRONOLOGICAL RECENT ACTIVITY FEED */}
              <div className="bg-white border border-slate-200 rounded overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      E. Recent Factory Activity Feed ({recentActivityFeed.length})
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Chronological record of cash issued, manager purchases, factory expenses, stock adjustments, production confirmations, and booker transactions
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('REPORTS')}
                    className="px-2.5 py-1 text-xs font-semibold text-white bg-[#0B192C] hover:bg-slate-800 rounded"
                  >
                    Open Business Reports →
                  </button>
                </div>

                {recentActivityFeed.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No factory activity recorded yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/50">
                          <th className="py-2 px-3">Date / Time</th>
                          <th className="py-2 px-3">Activity Type</th>
                          <th className="py-2 px-3">Reference</th>
                          <th className="py-2 px-3">Details</th>
                          <th className="py-2 px-3">Performed By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {recentActivityFeed.map((act) => (
                          <tr key={act.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 tabular-nums text-slate-600 whitespace-nowrap">
                              {act.date}
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-900">
                              {act.category}
                            </td>
                            <td className="py-2 px-3 tabular-nums font-bold text-slate-900">
                              {act.reference}
                            </td>
                            <td className="py-2 px-3 text-slate-700">{act.summary}</td>
                            <td className="py-2 px-3 font-medium text-slate-800">
                              {act.performedBy}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PRODUCTION MANAGER DASHBOARD */}
          {isProdManager && activeTab === 'DASHBOARD' && (
            <div className="space-y-4">
              {/* Phase 1: Manager Personal Cash Account, Purchases & Expenses */}
              <ManagerCashManagementModule
                state={state}
                actor={actor}
                busy={busy}
                runAction={runAction}
              />

              {/* Compact Manager KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 bg-white border border-slate-200 rounded divide-x divide-y sm:divide-y-0 divide-slate-200">
                <div className="p-3">
                  <div className="text-[11px] font-medium text-slate-500">
                    Today&apos;s Production
                  </div>
                  <div className="text-sm font-bold tabular-nums text-slate-900 mt-1">
                    {todayProducedBottles.toLocaleString()} Bottles
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('RAW_MATERIALS')}
                  className="p-3 text-left hover:bg-slate-50"
                >
                  <div className="text-[11px] font-medium text-slate-500">
                    Available Raw Materials
                  </div>
                  <div className="text-sm font-bold tabular-nums text-slate-900 mt-1">
                    {state.raw_materials.length} Items
                  </div>
                </button>
                <div className="p-3">
                  <div className="text-[11px] font-medium text-slate-500">
                    Pending Approvals
                  </div>
                  <div className="text-sm font-bold tabular-nums text-amber-800 mt-1">
                    {pendingBatches.length} Batches
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('MACHINES')}
                  className="p-3 text-left hover:bg-slate-50"
                >
                  <div className="text-[11px] font-medium text-slate-500">
                    Machine Issues
                  </div>
                  <div
                    className={`text-sm font-bold tabular-nums mt-1 ${
                      openTicketsCount > 0 ? 'text-red-700' : 'text-emerald-700'
                    }`}
                  >
                    {openTicketsCount} Open
                  </div>
                </button>
              </div>

              {/* Available Raw Materials Summary Table */}
              <div className="bg-white border border-slate-200 rounded overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Available Raw Materials
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('RAW_MATERIALS')}
                    className="text-xs font-semibold text-slate-700 hover:text-slate-900"
                  >
                    Full Inventory →
                  </button>
                </div>
                {state.raw_materials.length === 0 ? (
                  <div className="p-5 text-center text-xs text-slate-500">
                    No raw material stock available.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                          <th className="py-2 px-3">Code</th>
                          <th className="py-2 px-3">Material</th>
                          <th className="py-2 px-3">Category</th>
                          <th className="py-2 px-3 text-right">Available Stock</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {state.raw_materials.map((rm) => (
                          <tr key={rm.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 tabular-nums text-slate-500">
                              {rm.code}
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-900">
                              {rm.name}
                            </td>
                            <td className="py-2 px-3 text-slate-600">{rm.category}</td>
                            <td className="py-2 px-3 text-right tabular-nums font-bold text-slate-900">
                              {rm.current_stock} {rm.unit}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Direct Production Entry & Material Consumption */}
              <ProductionBatchAndApprovalModule
                state={state}
                actor={actor}
                busy={busy}
                runAction={runAction}
                viewMode="ALL"
              />

              {/* Permitted Booker Transactions & Quick Access (Section 6) */}
              <div className="bg-white border border-slate-200 rounded overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Booker Carton Allocations &amp; Payments ({state.booker_transactions?.length || 0})
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Record carton allocations and installment payments for bookers
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('BOOKER_MANAGEMENT')}
                    className="px-2.5 py-1 text-xs font-semibold text-white bg-[#0B192C] hover:bg-slate-800 rounded"
                  >
                    Open Booker Management →
                  </button>
                </div>
                {!state.booker_transactions || state.booker_transactions.length === 0 ? (
                  <div className="p-5 text-center text-xs text-slate-500">
                    No booker transactions recorded yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Ref</th>
                          <th className="py-2 px-3">Booker</th>
                          <th className="py-2 px-3">Type</th>
                          <th className="py-2 px-3">Product</th>
                          <th className="py-2 px-3 text-right">Cartons</th>
                          <th className="py-2 px-3 text-right">Payable / Received</th>
                          <th className="py-2 px-3">Entered By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {state.booker_transactions.slice(0, 6).map((btx) => (
                          <tr key={btx.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 tabular-nums text-slate-600">
                              {btx.transaction_date}
                            </td>
                            <td className="py-2 px-3 tabular-nums font-semibold">
                              {btx.reference_number}
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-900">
                              {btx.booker_name}
                            </td>
                            <td className="py-2 px-3">{btx.transaction_type}</td>
                            <td className="py-2 px-3">{btx.juice_type || '—'}</td>
                            <td className="py-2 px-3 text-right tabular-nums">
                              {btx.cartons_given > 0 ? `${btx.cartons_given} Ctn` : '—'}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums font-bold">
                              {btx.amount_payable > 0
                                ? `Rs. ${btx.amount_payable.toLocaleString()}`
                                : `Rs. ${btx.payment_received.toLocaleString()}`}
                            </td>
                            <td className="py-2 px-3 text-slate-700">{btx.entered_by_name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MANAGER CASH MANAGEMENT TAB */}
          {!isBooker && activeTab === 'MANAGER_CASH' && (
            <ManagerCashManagementModule
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
            />
          )}

          {/* BOOKER MANAGEMENT TAB */}
          {!isBooker && activeTab === 'BOOKER_MANAGEMENT' && (
            <BookerManagementModule
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
            />
          )}

          {/* RAW MATERIALS / PURCHASES / SUPPLIERS / INVENTORY */}
          {!isBooker && activeTab === 'RAW_MATERIALS' && (
            <RawMaterialAndStockLedgerModule
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              mode="RAW_MATERIALS"
            />
          )}

          {isAdmin && activeTab === 'PURCHASES' && (
            <RawMaterialAndStockLedgerModule
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              mode="PURCHASES"
            />
          )}

          {isAdmin && activeTab === 'SUPPLIERS' && (
            <RawMaterialAndStockLedgerModule
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              mode="SUPPLIERS"
            />
          )}

          {!isBooker && activeTab === 'INVENTORY' && (
            <RawMaterialAndStockLedgerModule
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              mode="STOCK_LEDGER"
            />
          )}

          {/* PRODUCTION MODULES */}
          {!isBooker && activeTab === 'PRODUCTION_APPROVALS' && (
            <ProductionBatchAndApprovalModule
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              viewMode="APPROVALS"
            />
          )}

          {!isBooker && activeTab === 'PRODUCTION_ENTRY' && (
            <ProductionBatchAndApprovalModule
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              viewMode="ENTRY"
            />
          )}

          {!isBooker && activeTab === 'MATERIAL_CONSUMPTION' && (
            <ProductionBatchAndApprovalModule
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              viewMode="CONSUMPTION"
            />
          )}

          {!isBooker && activeTab === 'PRODUCTION_HISTORY' && (
            <ProductionBatchAndApprovalModule
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              viewMode="HISTORY"
            />
          )}

          {/* FINISHED GOODS */}
          {!isBooker && activeTab === 'FINISHED_GOODS' && (
            <AdminOperationsAndFinanceModules
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              section="FINISHED_GOODS"
            />
          )}

          {/* SALES */}
          {isAdmin && activeTab === 'SALES' && (
            <AdminOperationsAndFinanceModules
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              section="SALES"
            />
          )}

          {/* DISPATCH */}
          {isAdmin && activeTab === 'DISPATCH' && (
            <AdminOperationsAndFinanceModules
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              section="DISPATCH"
            />
          )}

          {/* DEALERS */}
          {isAdmin && activeTab === 'DEALERS' && (
            <AdminOperationsAndFinanceModules
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              section="DEALERS"
            />
          )}

          {/* DEALER LEDGER */}
          {isAdmin && activeTab === 'DEALER_LEDGER' && (
            <AdminOperationsAndFinanceModules
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              section="DEALER_LEDGER"
            />
          )}

          {/* SUPPLIER LEDGER */}
          {isAdmin && activeTab === 'SUPPLIER_LEDGER' && (
            <AdminOperationsAndFinanceModules
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              section="SUPPLIER_LEDGER"
            />
          )}

          {/* PAYMENTS */}
          {isAdmin && activeTab === 'PAYMENTS' && (
            <AdminOperationsAndFinanceModules
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              section="PAYMENTS"
            />
          )}

          {/* EXPENSES */}
          {isAdmin && activeTab === 'EXPENSES' && (
            <AdminOperationsAndFinanceModules
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              section="EXPENSES"
            />
          )}

          {/* CASH & BANK */}
          {isAdmin && activeTab === 'CASH_AND_BANK' && (
            <AdminOperationsAndFinanceModules
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              section="CASH_AND_BANK"
            />
          )}

          {/* PROFIT & LOSS */}
          {isAdmin && activeTab === 'PROFIT_AND_LOSS' && (
            <AdminOperationsAndFinanceModules
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              section="PROFIT_AND_LOSS"
            />
          )}

          {/* REPORTS (PHASE 5 DEDICATED BUSINESS REPORTS MODULE) */}
          {!isBooker && activeTab === 'REPORTS' && (
            <FactoryBusinessReportsModule state={state} actor={actor} />
          )}

          {/* EMPLOYEES */}
          {isAdmin && activeTab === 'EMPLOYEES' && (
            <AdminOperationsAndFinanceModules
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              section="EMPLOYEES"
            />
          )}

          {/* SETTINGS */}
          {isAdmin && activeTab === 'SETTINGS' && (
            <AdminOperationsAndFinanceModules
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              section="SETTINGS"
            />
          )}

          {/* MACHINES */}
          {!isBooker && activeTab === 'MACHINES' && (
            <AdminOperationsAndFinanceModules
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              section="MACHINES"
            />
          )}

          {/* AUDIT LOGS */}
          {isAdmin && activeTab === 'AUDIT_LOGS' && (
            <AdminOperationsAndFinanceModules
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              section="AUDIT_LOGS"
            />
          )}

          {/* MY PROFILE */}
          {activeTab === 'MY_PROFILE' && (
            <AdminOperationsAndFinanceModules
              state={state}
              actor={actor}
              busy={busy}
              runAction={runAction}
              section="MY_PROFILE"
            />
          )}
        </main>
      </div>
    </div>
  );
}
