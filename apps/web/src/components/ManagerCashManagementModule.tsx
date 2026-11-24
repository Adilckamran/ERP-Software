'use client';

import React, { useState, useMemo } from 'react';
import type { ErpDatabaseState } from '@/lib/db/store';
import type {
  UserProfile,
  MaterialUnit,
  ManagerCashTransactionType,
} from '@juice-erp/shared-types';
import {
  Printer,
  RotateCcw,
  Plus,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

const PURCHASE_UNITS: MaterialUnit[] = [
  'KG',
  'GRAM',
  'LITRE',
  'ML',
  'BOX',
  'PIECES',
  'PACKETS',
  'CARTONS',
];

const EXPENSE_CATEGORIES = [
  'Transportation',
  'Electricity',
  'Fuel',
  'Salaries',
  'Factory rent',
  'Machine maintenance',
  'Packaging',
  'Other expenses',
];

interface Props {
  state: ErpDatabaseState;
  actor: UserProfile;
  busy: boolean;
  runAction: (action: string, payload: Record<string, any>, msg?: string) => Promise<any>;
}

export function ManagerCashManagementModule({
  state,
  actor,
  busy,
  runAction,
}: Props) {
  const isOwner = actor.role === 'OWNER';
  const isManager = actor.role === 'PRODUCTION_MANAGER';
  const today = new Date().toISOString().split('T')[0];

  const managers = useMemo(
    () => state.users.filter((u) => u.role === 'PRODUCTION_MANAGER'),
    [state.users]
  );

  // Owner Issue Cash form state
  const [issueManagerId, setIssueManagerId] = useState<string>(
    managers[0]?.id || 'user-mgr-kamran'
  );
  const [issueAmount, setIssueAmount] = useState<string>('');
  const [issueDate, setIssueDate] = useState<string>(today);
  const [issueDesc, setIssueDesc] = useState<string>('');

  // Manager Purchase form state
  const [purMaterialName, setPurMaterialName] = useState<string>('');
  const [purQuantity, setPurQuantity] = useState<string>('');
  const [purUnit, setPurUnit] = useState<MaterialUnit>('KG');
  const [purAmount, setPurAmount] = useState<string>('');
  const [purDate, setPurDate] = useState<string>(today);
  const [purDesc, setPurDesc] = useState<string>('');

  // Manager Expense form state
  const [expCategory, setExpCategory] = useState<string>('Transportation');
  const [expAmount, setExpAmount] = useState<string>('');
  const [expDate, setExpDate] = useState<string>(today);
  const [expDesc, setExpDesc] = useState<string>('');

  // Filters for transaction history table
  const [managerFilter, setManagerFilter] = useState<string>(
    isManager ? actor.id : 'ALL'
  );
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Owner Reversal state
  const [reversingTxId, setReversingTxId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState<string>('');

  // Compute ledger-derived balances per manager
  const managerSummaries = useMemo(() => {
    const targetManagers = isManager
      ? [actor]
      : managers.length > 0
      ? managers
      : [
          { id: 'user-mgr-kamran', full_name: 'Kamran Bhai' },
          { id: 'user-mgr-imran', full_name: 'Imran Bhai' },
        ];

    return targetManagers.map((m) => {
      const txns = (state.manager_cash_transactions || []).filter(
        (t) =>
          t.manager_id === m.id &&
          !t.is_reversed &&
          t.transaction_type !== 'REVERSAL_ADJUSTMENT'
      );
      const totalReceived = txns
        .filter((t) => t.transaction_type === 'CASH_ISSUED_BY_OWNER')
        .reduce((s, t) => s + t.amount, 0);
      const totalPurchases = txns
        .filter((t) => t.transaction_type === 'MATERIAL_PURCHASE')
        .reduce((s, t) => s + t.amount, 0);
      const totalExpenses = txns
        .filter((t) => t.transaction_type === 'FACTORY_EXPENSE')
        .reduce((s, t) => s + t.amount, 0);
      const totalSpent = totalPurchases + totalExpenses;
      const currentBalance = totalReceived - totalSpent;

      return {
        manager_id: m.id,
        manager_name: m.full_name,
        total_received: totalReceived,
        total_purchases: totalPurchases,
        total_expenses: totalExpenses,
        total_spent: totalSpent,
        current_balance: currentBalance,
      };
    });
  }, [state.manager_cash_transactions, managers, isManager, actor]);

  const combinedSummary = useMemo(() => {
    return managerSummaries.reduce(
      (acc, m) => ({
        total_issued: acc.total_issued + m.total_received,
        total_purchases: acc.total_purchases + m.total_purchases,
        total_expenses: acc.total_expenses + m.total_expenses,
        total_spending: acc.total_spending + m.total_spent,
        combined_remaining: acc.combined_remaining + m.current_balance,
      }),
      {
        total_issued: 0,
        total_purchases: 0,
        total_expenses: 0,
        total_spending: 0,
        combined_remaining: 0,
      }
    );
  }, [managerSummaries]);

  const mySummary = managerSummaries[0] || {
    manager_id: actor.id,
    manager_name: actor.full_name,
    total_received: 0,
    total_purchases: 0,
    total_expenses: 0,
    total_spent: 0,
    current_balance: 0,
  };

  const filteredTransactions = useMemo(() => {
    return (state.manager_cash_transactions || []).filter((tx) => {
      if (isManager && tx.manager_id !== actor.id) return false;
      if (isOwner && managerFilter !== 'ALL' && tx.manager_id !== managerFilter) {
        return false;
      }
      if (typeFilter !== 'ALL' && tx.transaction_type !== typeFilter) {
        return false;
      }
      if (dateFrom && tx.transaction_date < dateFrom) return false;
      if (dateTo && tx.transaction_date > dateTo) return false;
      return true;
    });
  }, [
    state.manager_cash_transactions,
    isManager,
    isOwner,
    actor.id,
    managerFilter,
    typeFilter,
    dateFrom,
    dateTo,
  ]);

  const handleOwnerIssueCash = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetMgr = managers.find((m) => m.id === issueManagerId);
    const res = await runAction(
      'ISSUE_CASH_TO_MANAGER',
      {
        manager_id: issueManagerId,
        amount: Number(issueAmount),
        transaction_date: issueDate,
        description: issueDesc.trim() || undefined,
        idempotency_key: `ISS-${issueManagerId}-${Date.now()}`,
      },
      `Issued Rs. ${Number(issueAmount).toLocaleString()} to ${targetMgr?.full_name || 'Manager'}.`
    );
    if (res?.ok) {
      setIssueAmount('');
      setIssueDesc('');
    }
  };

  const handleManagerRecordPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await runAction(
      'RECORD_MANAGER_CASH_PURCHASE',
      {
        material_name: purMaterialName.trim(),
        quantity: Number(purQuantity),
        unit: purUnit,
        total_amount: Number(purAmount),
        purchase_date: purDate,
        description: purDesc.trim() || undefined,
        idempotency_key: `PUR-${actor.id}-${Date.now()}`,
      },
      `Purchase saved: +${purQuantity} ${purUnit} ${purMaterialName} (Rs. ${Number(purAmount).toLocaleString()} deducted from cash).`
    );
    if (res?.ok) {
      setPurMaterialName('');
      setPurQuantity('');
      setPurAmount('');
      setPurDesc('');
    }
  };

  const handleManagerRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await runAction(
      'RECORD_MANAGER_CASH_EXPENSE',
      {
        category: expCategory,
        amount: Number(expAmount),
        expense_date: expDate,
        description: expDesc.trim(),
        idempotency_key: `EXP-${actor.id}-${Date.now()}`,
      },
      `Expense recorded: Rs. ${Number(expAmount).toLocaleString()} (${expCategory}) deducted from cash.`
    );
    if (res?.ok) {
      setExpAmount('');
      setExpDesc('');
    }
  };

  const handleConfirmReversal = async (txId: string) => {
    if (!reversalReason.trim()) return;
    const res = await runAction(
      'REVERSE_MANAGER_CASH_TRANSACTION',
      {
        transaction_id: txId,
        reason: reversalReason.trim(),
      },
      'Transaction reversed and balance updated.'
    );
    if (res?.ok) {
      setReversingTxId(null);
      setReversalReason('');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="bg-white border border-slate-200 rounded px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
          {isOwner
            ? 'Manager Cash Management — Owner Control Panel'
            : `${actor.full_name} — Cash Account, Purchases & Expenses`}
        </h2>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded no-print"
        >
          <Printer className="w-3.5 h-3.5" />
          Print Ledger
        </button>
      </div>

      {/* OWNER VIEW: Manager-Wise & Combined Cash Overview + Issue Cash Form */}
      {isOwner && (
        <div className="space-y-4">
          {/* Combined + Individual Manager Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {managerSummaries.map((m) => {
              const isSelected = managerFilter === m.manager_id;
              return (
                <div
                  key={m.manager_id}
                  className={`bg-white border rounded p-3.5 space-y-2.5 ${
                    isSelected ? 'border-[#0B192C] ring-1 ring-[#0B192C]' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <div>
                      <div className="text-xs font-bold text-slate-900 uppercase">
                        {m.manager_name}
                      </div>
                      <div className="text-[11px] text-slate-500">Manager Cash Ledger</div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setManagerFilter(isSelected ? 'ALL' : m.manager_id)
                      }
                      className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded no-print"
                    >
                      {isSelected ? 'Showing Account ✓' : 'Inspect Transactions'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-slate-50 rounded border border-slate-200">
                      <div className="text-[11px] text-slate-500">Total Cash Received</div>
                      <div className="font-bold tabular-nums text-slate-900 mt-0.5">
                        Rs. {m.total_received.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-2 bg-emerald-50/70 rounded border border-emerald-200">
                      <div className="text-[11px] font-medium text-emerald-800">
                        Current Balance
                      </div>
                      <div className="font-bold tabular-nums text-emerald-800 mt-0.5">
                        Rs. {m.current_balance.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-2 bg-slate-50 rounded border border-slate-200">
                      <div className="text-[11px] text-slate-500">Total Purchases</div>
                      <div className="font-semibold tabular-nums text-slate-800 mt-0.5">
                        Rs. {m.total_purchases.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-2 bg-slate-50 rounded border border-slate-200">
                      <div className="text-[11px] text-slate-500">Total General Expenses</div>
                      <div className="font-semibold tabular-nums text-amber-800 mt-0.5">
                        Rs. {m.total_expenses.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Combined Overview Card */}
            <div className="bg-[#0B192C] text-white border border-slate-800 rounded p-3.5 space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider">
                    Combined Manager Cash Overview
                  </div>
                  <div className="text-[11px] text-slate-300">
                    Kamran Bhai + Imran Bhai
                  </div>
                </div>
                {managerFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setManagerFilter('ALL')}
                    className="px-2 py-0.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 rounded no-print"
                  >
                    Show All
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-slate-800/80 rounded border border-slate-700">
                  <div className="text-[11px] text-slate-300">Total Cash Issued</div>
                  <div className="font-bold tabular-nums text-white mt-0.5">
                    Rs. {combinedSummary.total_issued.toLocaleString()}
                  </div>
                </div>
                <div className="p-2 bg-emerald-900/50 rounded border border-emerald-700">
                  <div className="text-[11px] text-emerald-300">Combined Remaining</div>
                  <div className="font-bold tabular-nums text-emerald-300 mt-0.5">
                    Rs. {combinedSummary.combined_remaining.toLocaleString()}
                  </div>
                </div>
                <div className="p-2 bg-slate-800/80 rounded border border-slate-700">
                  <div className="text-[11px] text-slate-300">Total Spending</div>
                  <div className="font-semibold tabular-nums text-amber-300 mt-0.5">
                    Rs. {combinedSummary.total_spending.toLocaleString()}
                  </div>
                </div>
                <div className="p-2 bg-slate-800/80 rounded border border-slate-700">
                  <div className="text-[11px] text-slate-300">Purchases / Expenses</div>
                  <div className="font-medium tabular-nums text-slate-200 mt-0.5">
                    Rs. {combinedSummary.total_purchases.toLocaleString()} / Rs.{' '}
                    {combinedSummary.total_expenses.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Owner Form: Issue Cash to Manager */}
          <div className="bg-white border border-slate-200 rounded p-4 no-print">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-2 mb-3">
              Issue Cash to Manager (Owner Only — Sikandar Raja)
            </div>
            <form
              onSubmit={handleOwnerIssueCash}
              className="grid grid-cols-1 md:grid-cols-5 gap-3"
            >
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Select Manager *
                </label>
                <select
                  required
                  value={issueManagerId}
                  onChange={(e) => setIssueManagerId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded font-medium"
                >
                  {managers.map((m) => {
                    const summary = managerSummaries.find((s) => s.manager_id === m.id);
                    return (
                      <option key={m.id} value={m.id}>
                        {m.full_name} (Bal: Rs. {(summary?.current_balance || 0).toLocaleString()})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Cash Amount (Rs.) *
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  placeholder="e.g. 100000"
                  value={issueAmount}
                  onChange={(e) => setIssueAmount(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  required
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Weekly factory operations cash"
                  value={issueDesc}
                  onChange={(e) => setIssueDesc(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-1.5 px-3 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-semibold text-xs rounded transition inline-flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {busy ? 'Issuing...' : 'Issue Cash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANAGER VIEW: Personal Cash Summary + Purchase Form + Expense Form */}
      {isManager && (
        <div className="space-y-4">
          {/* Manager's 4 Balance Strip Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 bg-white border border-slate-200 rounded divide-x divide-y sm:divide-y-0 divide-slate-200">
            <div className="p-3.5">
              <div className="text-[11px] font-medium text-slate-500">
                Total Cash Received
              </div>
              <div className="text-base font-bold tabular-nums text-slate-900 mt-1">
                Rs. {mySummary.total_received.toLocaleString()}
              </div>
            </div>
            <div className="p-3.5">
              <div className="text-[11px] font-medium text-slate-500">
                Total Cash Spent
              </div>
              <div className="text-base font-bold tabular-nums text-amber-800 mt-1">
                Rs. {mySummary.total_spent.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                Purchases: Rs. {mySummary.total_purchases.toLocaleString()} | Expenses: Rs.{' '}
                {mySummary.total_expenses.toLocaleString()}
              </div>
            </div>
            <div className="p-3.5 bg-emerald-50/60">
              <div className="text-[11px] font-semibold text-emerald-900">
                Current Available Balance
              </div>
              <div className="text-base font-bold tabular-nums text-emerald-700 mt-1">
                Rs. {mySummary.current_balance.toLocaleString()}
              </div>
            </div>
            <div className="p-3.5">
              <div className="text-[11px] font-medium text-slate-500">
                Manager Account
              </div>
              <div className="text-sm font-bold text-slate-900 mt-1">
                {actor.full_name}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Isolated Personal Cash Ledger
              </div>
            </div>
          </div>

          {mySummary.current_balance <= 0 && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded text-xs text-amber-900 flex items-center gap-2 no-print">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                Your available cash balance is currently <strong>Rs. 0</strong>. Ask Owner{' '}
                <strong>Sikandar Raja</strong> to issue cash to your account before recording purchases or expenses.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 no-print">
            {/* Form 1: Record Raw Material Purchase */}
            <div className="bg-white border border-slate-200 rounded p-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Record Raw Material Purchase
                </div>
                <span className="text-[11px] text-slate-500">
                  Deducts from your cash &amp; adds to factory inventory
                </span>
              </div>

              <form onSubmit={handleManagerRecordPurchase} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Material Name *
                    </label>
                    <input
                      type="text"
                      required
                      list="factory-materials-list"
                      placeholder="e.g. Sugar, Compound, CMC..."
                      value={purMaterialName}
                      onChange={(e) => {
                        setPurMaterialName(e.target.value);
                        const matched = state.raw_materials.find(
                          (m) => m.name.toLowerCase() === e.target.value.trim().toLowerCase()
                        );
                        if (matched) {
                          setPurUnit(String(matched.unit).toUpperCase() as MaterialUnit);
                        }
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                    />
                    <datalist id="factory-materials-list">
                      {state.raw_materials.map((m) => (
                        <option key={m.id} value={m.name} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Purchase Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={purDate}
                      onChange={(e) => setPurDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Quantity *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      required
                      placeholder="e.g. 3"
                      value={purQuantity}
                      onChange={(e) => setPurQuantity(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Unit *
                    </label>
                    <select
                      value={purUnit}
                      onChange={(e) => setPurUnit(e.target.value as MaterialUnit)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                    >
                      {PURCHASE_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Total Amount (Rs.) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      required
                      placeholder="e.g. 1500"
                      value={purAmount}
                      onChange={(e) => setPurAmount(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums font-semibold"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Optional description / market source"
                    value={purDesc}
                    onChange={(e) => setPurDesc(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                  />
                  <button
                    type="submit"
                    disabled={busy || mySummary.current_balance <= 0}
                    className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold rounded inline-flex items-center gap-1.5 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Confirm Purchase
                  </button>
                </div>
              </form>
            </div>

            {/* Form 2: Record General Factory Expense */}
            <div className="bg-white border border-slate-200 rounded p-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Record General Factory Expense
                </div>
                <span className="text-[11px] text-slate-500">
                  Deducts from your cash (does not change inventory)
                </span>
              </div>

              <form onSubmit={handleManagerRecordExpense} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Expense Category *
                    </label>
                    <select
                      value={expCategory}
                      onChange={(e) => setExpCategory(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                    >
                      {EXPENSE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Amount (Rs.) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      required
                      placeholder="e.g. 2000"
                      value={expAmount}
                      onChange={(e) => setExpAmount(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={expDate}
                      onChange={(e) => setExpDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Expense description (e.g. Factory transport expense) *"
                    value={expDesc}
                    onChange={(e) => setExpDesc(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                  />
                  <button
                    type="submit"
                    disabled={busy || mySummary.current_balance <= 0}
                    className="px-4 py-1.5 bg-[#0B192C] hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded shrink-0"
                  >
                    Confirm Expense
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Owner Reversal Modal / Inline Prompt */}
      {isOwner && reversingTxId && (
        <div className="bg-amber-50 border border-amber-300 rounded p-3.5 flex flex-wrap items-center justify-between gap-2 no-print">
          <div className="text-xs font-semibold text-amber-900">
            Authorize Reversal for Transaction ID: <span className="tabular-nums">{reversingTxId}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              required
              placeholder="Enter mandatory audit reason for reversal..."
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              className="px-2.5 py-1 text-xs bg-white border border-amber-300 rounded w-64"
            />
            <button
              type="button"
              disabled={busy || !reversalReason.trim()}
              onClick={() => handleConfirmReversal(reversingTxId)}
              className="px-3 py-1 bg-amber-800 text-white text-xs font-semibold rounded disabled:opacity-50"
            >
              Confirm Reversal
            </button>
            <button
              type="button"
              onClick={() => {
                setReversingTxId(null);
                setReversalReason('');
              }}
              className="px-2.5 py-1 bg-white border border-slate-300 text-xs rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Permanent Manager Cash Transaction Ledger Table */}
      <div className="bg-white border border-slate-200 rounded overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Permanent Manager Cash Transaction History ({filteredTransactions.length})
          </h3>

          <div className="flex flex-wrap items-center gap-2 no-print">
            {isOwner && (
              <select
                value={managerFilter}
                onChange={(e) => setManagerFilter(e.target.value)}
                className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded font-medium"
              >
                <option value="ALL">All Managers (Kamran &amp; Imran)</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            )}

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded"
            >
              <option value="ALL">All Transaction Types</option>
              <option value="CASH_ISSUED_BY_OWNER">Cash Issued by Owner</option>
              <option value="MATERIAL_PURCHASE">Material Purchases</option>
              <option value="FACTORY_EXPENSE">General Factory Expenses</option>
              <option value="REVERSAL_ADJUSTMENT">Reversal Adjustments</option>
            </select>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              title="From Date"
              className="px-2 py-1 text-xs bg-white border border-slate-300 rounded tabular-nums"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              title="To Date"
              className="px-2 py-1 text-xs bg-white border border-slate-300 rounded tabular-nums"
            />
          </div>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No manager cash transactions match the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-2 px-3">Date &amp; Time</th>
                  <th className="py-2 px-3">Reference #</th>
                  <th className="py-2 px-3">Manager</th>
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3">Details / Related Record</th>
                  <th className="py-2 px-3 text-right">Previous Bal</th>
                  <th className="py-2 px-3 text-right">Amount</th>
                  <th className="py-2 px-3 text-right">Updated Bal</th>
                  <th className="py-2 px-3">Created By</th>
                  {isOwner && <th className="py-2 px-3 text-right no-print">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredTransactions.map((tx) => {
                  const isInflow = tx.transaction_type === 'CASH_ISSUED_BY_OWNER';
                  const isReversal = tx.transaction_type === 'REVERSAL_ADJUSTMENT';
                  return (
                    <tr
                      key={tx.id}
                      className={`hover:bg-slate-50 ${
                        tx.is_reversed ? 'opacity-60 bg-slate-50' : ''
                      }`}
                    >
                      <td className="py-2 px-3 tabular-nums text-slate-600 whitespace-nowrap">
                        <div>{tx.transaction_date}</div>
                        <div className="text-[10px] text-slate-400">
                          {new Date(tx.created_at).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="py-2 px-3 tabular-nums font-medium text-slate-800">
                        {tx.reference_number}
                      </td>
                      <td className="py-2 px-3 font-semibold text-slate-900">
                        {tx.manager_name}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
                            isInflow
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : isReversal
                              ? 'bg-slate-100 text-slate-700 border-slate-300'
                              : tx.transaction_type === 'MATERIAL_PURCHASE'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-red-50 text-red-800 border-red-200'
                          }`}
                        >
                          {tx.transaction_type === 'CASH_ISSUED_BY_OWNER'
                            ? 'CASH ISSUED'
                            : tx.transaction_type === 'MATERIAL_PURCHASE'
                            ? 'PURCHASE'
                            : tx.transaction_type === 'FACTORY_EXPENSE'
                            ? 'EXPENSE'
                            : 'REVERSAL'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-700">
                        <div>{tx.description}</div>
                        {tx.material_name && (
                          <div className="text-[11px] text-emerald-700 font-medium">
                            Stock Added: +{tx.material_quantity} {tx.material_unit}{' '}
                            {tx.material_name}
                          </div>
                        )}
                        {tx.is_reversed && (
                          <div className="text-[10px] text-red-700 font-bold">
                            [REVERSED BY OWNER]
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">
                        Rs. {tx.previous_balance.toLocaleString()}
                      </td>
                      <td
                        className={`py-2 px-3 text-right tabular-nums font-bold ${
                          isInflow
                            ? 'text-emerald-700'
                            : isReversal
                            ? 'text-slate-700'
                            : 'text-red-700'
                        }`}
                      >
                        {isInflow ? '+' : isReversal ? '±' : '-'}Rs.{' '}
                        {tx.amount.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-slate-900 bg-slate-50/70">
                        Rs. {tx.updated_balance.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-slate-600">{tx.created_by_name}</td>
                      {isOwner && (
                        <td className="py-2 px-3 text-right no-print">
                          {!tx.is_reversed && !isReversal && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setReversingTxId(tx.id);
                                setReversalReason('');
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded"
                            >
                              <RotateCcw className="w-3 h-3" /> Reverse
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
