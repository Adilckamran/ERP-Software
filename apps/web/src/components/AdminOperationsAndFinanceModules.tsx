'use client';

import React, { useState, useMemo } from 'react';
import type { ErpDatabaseState } from '@/lib/db/store';
import type {
  UserProfile,
  RoleName,
  OrderStatus,
  FinancialTransactionType,
} from '@juice-erp/shared-types';
import {
  Printer,
  Lock,
  Unlock,
  Download,
  RotateCcw,
  KeyRound,
  CheckCircle2,
  XCircle,
  SlidersHorizontal,
  Plus,
} from 'lucide-react';

export type AdminModuleSection =
  | 'FINISHED_GOODS'
  | 'EMPLOYEES'
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
  | 'SETTINGS'
  | 'MACHINES'
  | 'AUDIT_LOGS'
  | 'MY_PROFILE';

interface Props {
  state: ErpDatabaseState;
  actor: UserProfile;
  busy: boolean;
  runAction: (action: string, payload: Record<string, any>, msg?: string) => Promise<any>;
  section: AdminModuleSection;
}

export function AdminOperationsAndFinanceModules({
  state,
  actor,
  busy,
  runAction,
  section,
}: Props) {
  const isAdmin = actor.role === 'OWNER';
  const today = new Date().toISOString().split('T')[0];

  // Employees state
  const [empId, setEmpId] = useState<string>('');
  const [empName, setEmpName] = useState('');
  const [empEmail, setEmpEmail] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empDepartment, setEmpDepartment] = useState('Production & Operations');
  const [empPassword, setEmpPassword] = useState('manager123');
  const [empRole, setEmpRole] = useState<RoleName>('PRODUCTION_MANAGER');
  const [empAreaId, setEmpAreaId] = useState(state.dealer_areas[0]?.id || 'area-gulberg');
  const [empCanPurchase, setEmpCanPurchase] = useState<boolean>(false);
  const [resetUserId, setResetUserId] = useState<string>('');
  const [resetPasswordVal, setResetPasswordVal] = useState<string>('');

  // Finished Goods adjustment & opening stock state
  const [showFgAdjust, setShowFgAdjust] = useState(false);
  const [showFgOpening, setShowFgOpening] = useState(false);
  const [fgOpenJuiceType, setFgOpenJuiceType] = useState<'Apple Juice' | 'Mango Juice'>('Apple Juice');
  const [fgOpenCartons, setFgOpenCartons] = useState('');
  const [fgOpenDate, setFgOpenDate] = useState(today);
  const [fgOpenNotes, setFgOpenNotes] = useState('');
  const [fgProductId, setFgProductId] = useState(state.products[0]?.id || 'prod-apple-juice');
  const [fgAdjCartons, setFgAdjCartons] = useState('');
  const [fgAdjReason, setFgAdjReason] = useState('');

  // Dealers state
  const [dealerName, setDealerName] = useState('');
  const [shopName, setShopName] = useState('');
  const [dealerPhone, setDealerPhone] = useState('');
  const [dealerAddress, setDealerAddress] = useState('');
  const [dealerAreaId, setDealerAreaId] = useState(state.dealer_areas[0]?.id || 'area-gulberg');
  const [dealerBookerId, setDealerBookerId] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [creditLimit, setCreditLimit] = useState('300000');

  // Sales & Returns state
  const [orderDealerId, setOrderDealerId] = useState('');
  const [orderProductId, setOrderProductId] = useState(state.products[0]?.id || '');
  const [orderCartons, setOrderCartons] = useState('10');
  const [orderDiscount, setOrderDiscount] = useState('0');
  const [retDealerId, setRetDealerId] = useState('');
  const [retProductId, setRetProductId] = useState(state.products[0]?.id || '');
  const [retCartons, setRetCartons] = useState('1');
  const [retReason, setRetReason] = useState('Damaged in transit / Customer return');

  // Payments state
  const [payDealerId, setPayDealerId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');
  const [payRef, setPayRef] = useState('');
  const [supPayId, setSupPayId] = useState('');
  const [supPayAmount, setSupPayAmount] = useState('');
  const [supPayMethod, setSupPayMethod] = useState('Cash');
  const [supPayRef, setSupPayRef] = useState('');

  // Ledger Filters
  const [ledgerDealerFilter, setLedgerDealerFilter] = useState('ALL');
  const [ledgerSupplierFilter, setLedgerSupplierFilter] = useState('ALL');

  // Expenses state
  const [expCategory, setExpCategory] = useState('Electricity & Utilities');
  const [expAmount, setExpAmount] = useState('');
  const [expMethod, setExpMethod] = useState('Cash');
  const [expDesc, setExpDesc] = useState('');
  const [expDate, setExpDate] = useState(today);

  // Cash & Bank state
  const [cbAccountId, setCbAccountId] = useState<'acc-cash' | 'acc-bank'>('acc-cash');
  const [cbType, setCbType] = useState<FinancialTransactionType>('CAPITAL_INJECTION');
  const [cbAmount, setCbAmount] = useState('');
  const [cbParty, setCbParty] = useState('Sikandar Raja');
  const [cbRef, setCbRef] = useState('');
  const [cbNotes, setCbNotes] = useState('');

  // Reports state
  const [reportType, setReportType] = useState<string>('DAILY_PRODUCTION');
  const [repDateFrom, setRepDateFrom] = useState<string>('');
  const [repDateTo, setRepDateTo] = useState<string>('');

  // Settings & Product Catalog state
  const [companyName, setCompanyName] = useState(
    state.factory_settings?.company_name || 'Fruity Fun Juice Factory'
  );
  const [ownerName, setOwnerName] = useState(
    state.factory_settings?.owner_name || 'Sikandar Raja'
  );
  const [companyPhone, setCompanyPhone] = useState(
    state.factory_settings?.factory_phone || '+92-300-8400100'
  );
  const [companyAddress, setCompanyAddress] = useState(
    state.factory_settings?.factory_address || 'Industrial Area, Lahore, Pakistan'
  );
  const [newSkuName, setNewSkuName] = useState('');
  const [newSkuCode, setNewSkuCode] = useState('');
  const [newSkuFlavourId, setNewSkuFlavourId] = useState(
    state.flavours[0]?.id || 'flav-mango'
  );
  const [newSkuSizeId, setNewSkuSizeId] = useState(state.bottle_sizes[0]?.id || 'size-250');
  const [newSkuUpc, setNewSkuUpc] = useState('24');
  const [newSkuPrice, setNewSkuPrice] = useState('1200');
  const [newSkuCost, setNewSkuCost] = useState('820');

  // Machines state
  const [machId, setMachId] = useState(state.machines[0]?.id || 'mach-1');
  const [machPriority, setMachPriority] = useState('High');
  const [machProblem, setMachProblem] = useState('');
  const [machCost, setMachCost] = useState('0');

  // My Profile state
  const [profName, setProfName] = useState(actor.full_name);
  const [profPhone, setProfPhone] = useState(actor.phone);
  const [profDept, setProfDept] = useState(actor.department || 'Factory Operations');
  const [profCurrentPassword, setProfCurrentPassword] = useState('');
  const [profNewPassword, setProfNewPassword] = useState('');

  // Audit filter
  const [auditSearch, setAuditSearch] = useState('');

  // ---------------------------------------------------------------------------
  // 1. FINISHED GOODS INVENTORY (Apple Juice & Mango Juice — 1 Carton = 24 Pieces)
  // ---------------------------------------------------------------------------
  if (section === 'FINISHED_GOODS') {
    const handleSetFgOpening = async (e: React.FormEvent) => {
      e.preventDefault();
      const res = await runAction(
        'SET_FINISHED_GOODS_OPENING_STOCK',
        {
          juice_type: fgOpenJuiceType,
          opening_cartons: Number(fgOpenCartons),
          opening_date: fgOpenDate,
          notes: fgOpenNotes,
        },
        `Opening finished goods stock recorded for ${fgOpenJuiceType}.`
      );
      if (res?.ok) {
        setFgOpenCartons('');
        setFgOpenNotes('');
        setShowFgOpening(false);
      }
    };

    const handleAdjustFg = async (e: React.FormEvent) => {
      e.preventDefault();
      const res = await runAction(
        'ADMIN_ADJUST_FINISHED_GOODS_STOCK',
        {
          product_id: fgProductId,
          adjustment_cartons: Number(fgAdjCartons),
          reason: fgAdjReason,
        },
        'Finished goods stock adjusted.'
      );
      if (res?.ok) {
        setFgAdjCartons('');
        setFgAdjReason('');
        setShowFgAdjust(false);
      }
    };

    return (
      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Finished Goods Inventory — Apple Juice &amp; Mango Juice (1 Carton = 24 Pieces)
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Separated from Raw Material Inventory | Real-time stock calculated from confirmed production &amp; authorized movements
              </p>
            </div>
            <div className="flex items-center gap-2 no-print">
              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setShowFgOpening(!showFgOpening);
                      setShowFgAdjust(false);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded"
                  >
                    <Plus className="w-3.5 h-3.5" /> Opening Stock Entry
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowFgAdjust(!showFgAdjust);
                      setShowFgOpening(false);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" /> Stock Adjustment
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
            </div>
          </div>

          {isAdmin && showFgOpening && (
            <form
              onSubmit={handleSetFgOpening}
              className="p-4 border-b border-slate-200 bg-slate-50 grid grid-cols-1 md:grid-cols-5 gap-2.5 no-print"
            >
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Juice Product *
                </label>
                <select
                  required
                  value={fgOpenJuiceType}
                  onChange={(e) =>
                    setFgOpenJuiceType(e.target.value as 'Apple Juice' | 'Mango Juice')
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded font-semibold"
                >
                  <option value="Apple Juice">Apple Juice</option>
                  <option value="Mango Juice">Mango Juice</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Opening Cartons (×24 Pieces) *
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  placeholder="Enter cartons"
                  value={fgOpenCartons}
                  onChange={(e) => setFgOpenCartons(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Opening Date *
                </label>
                <input
                  type="date"
                  required
                  value={fgOpenDate}
                  onChange={(e) => setFgOpenDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  placeholder="Initial warehouse count"
                  value={fgOpenNotes}
                  onChange={(e) => setFgOpenNotes(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-1.5 px-3 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded"
                >
                  Save Opening Stock
                </button>
              </div>
            </form>
          )}

          {isAdmin && showFgAdjust && (
            <form
              onSubmit={handleAdjustFg}
              className="p-4 border-b border-slate-200 bg-slate-50 grid grid-cols-1 md:grid-cols-4 gap-2.5 no-print"
            >
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Product *
                </label>
                <select
                  required
                  value={fgProductId}
                  onChange={(e) => setFgProductId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                >
                  {state.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Cartons Adjustment (+/-) *
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="e.g. +5 or -2"
                  value={fgAdjCartons}
                  onChange={(e) => setFgAdjCartons(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Reason *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Physical count / Audit reason"
                  value={fgAdjReason}
                  onChange={(e) => setFgAdjReason(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-1.5 px-3 bg-[#0B192C] text-white text-xs font-semibold rounded"
                >
                  Apply Adjustment
                </button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-2 px-3">SKU</th>
                  <th className="py-2 px-3">Product Name</th>
                  <th className="py-2 px-3">Carton Type</th>
                  <th className="py-2 px-3 text-right">Opening Cartons</th>
                  <th className="py-2 px-3 text-right">Total Cartons Produced</th>
                  <th className="py-2 px-3 text-right">Total Pieces Produced</th>
                  <th className="py-2 px-3 text-right">Dispatched Cartons</th>
                  <th className="py-2 px-3 text-right">Current Available Cartons</th>
                  <th className="py-2 px-3 text-right">Current Available Pieces</th>
                  <th className="py-2 px-3">Latest Batch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {state.finished_goods.map((fg) => {
                  const upc = 24;
                  const prodPieces =
                    fg.verified_production_bottles ??
                    Math.round(fg.verified_production_cartons * upc);
                  const availPieces =
                    fg.available_bottles ?? Math.round(fg.available_cartons * upc);
                  return (
                    <tr key={fg.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 tabular-nums text-slate-500">{fg.sku}</td>
                      <td className="py-2 px-3 font-bold text-slate-900">
                        {fg.product_name}
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        1 Carton = 24 Pieces
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">
                        {fg.opening_stock_cartons.toLocaleString()} Ctn (
                        {(fg.opening_stock_cartons * upc).toLocaleString()} Pcs)
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-emerald-700 font-bold">
                        {fg.verified_production_cartons.toLocaleString()} Cartons
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-emerald-700 font-bold">
                        {prodPieces.toLocaleString()} Pieces
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-700">
                        {fg.dispatched_cartons.toLocaleString()} Cartons
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-slate-900 bg-slate-50/70">
                        {fg.available_cartons.toLocaleString()} Cartons
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-slate-900 bg-slate-50/70">
                        {availPieces.toLocaleString()} Pieces
                      </td>
                      <td className="py-2 px-3 tabular-nums text-slate-500">
                        {fg.latest_batch_number}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 2. EMPLOYEES & USER MANAGEMENT
  // ---------------------------------------------------------------------------
  if (section === 'EMPLOYEES') {
    const handleSaveEmployee = async (e: React.FormEvent) => {
      e.preventDefault();
      const res = await runAction(
        'MANAGE_EMPLOYEE',
        {
          user_id: empId || undefined,
          full_name: empName,
          email: empEmail,
          phone: empPhone,
          department: empDepartment,
          password: empPassword || undefined,
          role: empRole,
          assigned_area_id: empRole === 'BOOKER' ? empAreaId : undefined,
          can_record_purchases: empRole === 'OWNER' ? true : empCanPurchase,
          is_active: true,
        },
        empId ? `Employee updated: ${empName}` : `Employee added: ${empName}`
      );
      if (res?.ok) {
        setEmpId('');
        setEmpName('');
        setEmpEmail('');
        setEmpPhone('');
        setEmpPassword('manager123');
        setEmpCanPurchase(false);
      }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!resetUserId || !resetPasswordVal) return;
      const res = await runAction(
        'RESET_USER_PASSWORD',
        {
          target_user_id: resetUserId,
          new_password: resetPasswordVal,
        },
        'Employee password reset.'
      );
      if (res?.ok) {
        setResetUserId('');
        setResetPasswordVal('');
      }
    };

    const toggleManagerPurchasePermission = async (u: UserProfile) => {
      const nextPerm = !Boolean(u.can_record_purchases);
      await runAction(
        'MANAGE_EMPLOYEE',
        {
          user_id: u.id,
          full_name: u.full_name,
          email: u.email,
          phone: u.phone,
          department: u.department,
          role: u.role,
          can_record_purchases: nextPerm,
          is_active: u.is_active,
        },
        `Updated permission for ${u.full_name}`
      );
    };

    return (
      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded p-4 no-print">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
            <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              {empId ? 'Edit Employee Profile' : 'Add Employee / Manager Account'}
            </div>
            {empId && (
              <button
                type="button"
                onClick={() => {
                  setEmpId('');
                  setEmpName('');
                  setEmpEmail('');
                  setEmpPhone('');
                }}
                className="text-xs text-slate-600 underline"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <form onSubmit={handleSaveEmployee} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Full name"
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Email (Login ID) *
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@fruityfun.pk"
                  value={empEmail}
                  onChange={(e) => setEmpEmail(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Phone *
                </label>
                <input
                  type="text"
                  required
                  placeholder="+92-300-0000000"
                  value={empPhone}
                  onChange={(e) => setEmpPhone(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Department
                </label>
                <input
                  type="text"
                  placeholder="Production / Sales"
                  value={empDepartment}
                  onChange={(e) => setEmpDepartment(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Role *
                </label>
                <select
                  value={empRole}
                  onChange={(e) => setEmpRole(e.target.value as RoleName)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                >
                  <option value="PRODUCTION_MANAGER">Production Manager</option>
                  <option value="BOOKER">Booker / Salesman</option>
                  <option value="OWNER">Owner / Super Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  {empId ? 'New Password (optional)' : 'Initial Password *'}
                </label>
                <input
                  type="text"
                  required={!empId}
                  placeholder="Min 4 chars"
                  value={empPassword}
                  onChange={(e) => setEmpPassword(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {empRole === 'PRODUCTION_MANAGER' ? (
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded px-3 py-1.5">
                  <input
                    id="emp-can-purchase"
                    type="checkbox"
                    checked={empCanPurchase}
                    onChange={(e) => setEmpCanPurchase(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <label htmlFor="emp-can-purchase" className="text-xs text-slate-700">
                    Allow Stock Receiving &amp; Supplier Purchases
                  </label>
                </div>
              ) : (
                <div />
              )}

              <button
                type="submit"
                disabled={busy}
                className="py-1.5 px-4 bg-[#0B192C] hover:bg-slate-800 text-white font-semibold text-xs rounded"
              >
                {empId ? 'Update Employee' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>

        {resetUserId && (
          <form
            onSubmit={handleResetPassword}
            className="bg-amber-50 border border-amber-200 rounded p-3 flex flex-wrap items-center justify-between gap-2 no-print"
          >
            <div className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
              <KeyRound className="w-4 h-4" />
              Reset Password for{' '}
              {state.users.find((u) => u.id === resetUserId)?.full_name || resetUserId}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                required
                minLength={4}
                placeholder="Enter new password..."
                value={resetPasswordVal}
                onChange={(e) => setResetPasswordVal(e.target.value)}
                className="px-2.5 py-1 text-xs bg-white border border-amber-300 rounded"
              />
              <button
                type="submit"
                disabled={busy}
                className="px-3 py-1 bg-amber-800 text-white text-xs font-semibold rounded"
              >
                Save Password
              </button>
              <button
                type="button"
                onClick={() => {
                  setResetUserId('');
                  setResetPasswordVal('');
                }}
                className="px-2.5 py-1 bg-white border border-slate-300 text-xs rounded"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Employees &amp; System Users ({state.users.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-2 px-3">Name</th>
                  <th className="py-2 px-3">Email</th>
                  <th className="py-2 px-3">Phone</th>
                  <th className="py-2 px-3">Department</th>
                  <th className="py-2 px-3">Role</th>
                  <th className="py-2 px-3">Purchasing Access</th>
                  <th className="py-2 px-3 text-center">Status</th>
                  <th className="py-2 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {state.users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-semibold text-slate-900">
                      {u.role === 'OWNER' ? 'Sikandar Raja' : u.full_name}
                    </td>
                    <td className="py-2 px-3 text-slate-600">{u.email}</td>
                    <td className="py-2 px-3 tabular-nums text-slate-600">{u.phone}</td>
                    <td className="py-2 px-3 text-slate-600">{u.department || '—'}</td>
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 border border-slate-300 rounded">
                        {u.role === 'OWNER'
                          ? 'Owner / Super Admin'
                          : u.role === 'PRODUCTION_MANAGER'
                          ? 'Production Manager'
                          : 'Booker'}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      {u.role === 'OWNER' ? (
                        <span className="text-emerald-700 font-medium">Full Access</span>
                      ) : u.role === 'PRODUCTION_MANAGER' ? (
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
                              u.can_record_purchases
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border-slate-300'
                            }`}
                          >
                            {u.can_record_purchases ? 'Allowed' : 'Restricted'}
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => toggleManagerPurchasePermission(u)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded"
                          >
                            {u.can_record_purchases ? (
                              <>
                                <Lock className="w-3 h-3" /> Revoke
                              </>
                            ) : (
                              <>
                                <Unlock className="w-3 h-3" /> Grant
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
                          u.is_active
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                        }`}
                      >
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right space-x-1 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setEmpId(u.id);
                          setEmpName(u.full_name);
                          setEmpEmail(u.email);
                          setEmpPhone(u.phone);
                          setEmpDepartment(u.department || '');
                          setEmpRole(u.role);
                          setEmpPassword('');
                          setEmpCanPurchase(Boolean(u.can_record_purchases));
                        }}
                        className="px-2 py-0.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setResetUserId(u.id);
                          setResetPasswordVal('');
                        }}
                        className="px-2 py-0.5 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded"
                      >
                        Reset Password
                      </button>
                      {u.id !== actor.id && (
                        <button
                          type="button"
                          onClick={() =>
                            runAction(
                              'TOGGLE_USER_ACTIVE',
                              { user_id: u.id },
                              `Updated status for ${u.full_name}`
                            )
                          }
                          className="px-2 py-0.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded"
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 3. SALES & RETURNS MODULE
  // ---------------------------------------------------------------------------
  if (section === 'SALES') {
    const handleCreateOrder = async (e: React.FormEvent) => {
      e.preventDefault();
      const res = await runAction(
        'CREATE_ORDER',
        {
          dealer_id: orderDealerId,
          product_id: orderProductId,
          quantity_cartons: Number(orderCartons),
          discount_amount: Number(orderDiscount || 0),
        },
        'Sales order created.'
      );
      if (res?.ok) {
        setOrderCartons('10');
        setOrderDiscount('0');
      }
    };

    const handleRecordReturn = async (e: React.FormEvent) => {
      e.preventDefault();
      const res = await runAction(
        'RECORD_SALES_RETURN',
        {
          dealer_id: retDealerId,
          product_id: retProductId,
          quantity_cartons: Number(retCartons),
          reason: retReason,
        },
        'Sales return recorded and stock restored.'
      );
      if (res?.ok) {
        setRetCartons('1');
      }
    };

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 no-print">
          {/* Create Sales Order */}
          <form
            onSubmit={handleCreateOrder}
            className="bg-white border border-slate-200 rounded p-4 space-y-3"
          >
            <div className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-2">
              New Sales Order
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Dealer / Customer *
                </label>
                <select
                  required
                  value={orderDealerId}
                  onChange={(e) => setOrderDealerId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                >
                  <option value="">Select Dealer *</option>
                  {state.dealers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.shop_name} (Bal: PKR {d.outstanding_balance.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Finished Good SKU *
                </label>
                <select
                  required
                  value={orderProductId}
                  onChange={(e) => setOrderProductId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                >
                  {state.products.map((p) => {
                    const fg = state.finished_goods.find((f) => f.product_id === p.id);
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} — PKR {p.wholesale_price_per_carton}/Ctn (Stock:{' '}
                        {fg?.available_cartons || 0} Ctn)
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Quantity (Cartons) *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={orderCartons}
                  onChange={(e) => setOrderCartons(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Discount (PKR)
                </label>
                <input
                  type="number"
                  min="0"
                  value={orderDiscount}
                  onChange={(e) => setOrderDiscount(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded tabular-nums"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busy || state.dealers.length === 0}
                className="px-4 py-1.5 bg-[#0B192C] hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded"
              >
                Create Sales Order
              </button>
            </div>
          </form>

          {/* Record Sales Return */}
          <form
            onSubmit={handleRecordReturn}
            className="bg-white border border-slate-200 rounded p-4 space-y-3"
          >
            <div className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-2">
              Record Sales Return
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Dealer *
                </label>
                <select
                  required
                  value={retDealerId}
                  onChange={(e) => setRetDealerId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                >
                  <option value="">Select Dealer *</option>
                  {state.dealers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.shop_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Returned Product *
                </label>
                <select
                  required
                  value={retProductId}
                  onChange={(e) => setRetProductId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                >
                  {state.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Returned Cartons *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={retCartons}
                  onChange={(e) => setRetCartons(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Reason *
                </label>
                <input
                  type="text"
                  required
                  value={retReason}
                  onChange={(e) => setRetReason(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busy || state.dealers.length === 0}
                className="px-4 py-1.5 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white text-xs font-semibold rounded"
              >
                Record Return
              </button>
            </div>
          </form>
        </div>

        {/* Sales Orders Register */}
        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Sales Orders ({state.orders.length})
            </h3>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded no-print"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
          </div>
          {state.orders.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">No sales orders yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2 px-3">Order #</th>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Dealer</th>
                    <th className="py-2 px-3">Items</th>
                    <th className="py-2 px-3 text-right">Invoice Amount</th>
                    <th className="py-2 px-3 text-center">Status</th>
                    <th className="py-2 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {state.orders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 tabular-nums font-semibold">{ord.order_number}</td>
                      <td className="py-2 px-3 tabular-nums text-slate-600">{ord.order_date}</td>
                      <td className="py-2 px-3 font-medium text-slate-900">{ord.shop_name}</td>
                      <td className="py-2 px-3 text-slate-600">
                        {ord.items.map((i) => `${i.quantity_cartons} Ctn × ${i.product_name}`).join(', ')}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold">
                        PKR {ord.total_amount.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
                            ord.status === 'Dispatched' || ord.status === 'Delivered'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {ord.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right space-x-1">
                        {ord.status === 'Pending' && (
                          <button
                            type="button"
                            onClick={() =>
                              runAction('TRANSITION_ORDER_STATUS', {
                                order_id: ord.id,
                                next_status: 'Approved' as OrderStatus,
                              })
                            }
                            className="px-2 py-0.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded"
                          >
                            Approve
                          </button>
                        )}
                        {(ord.status === 'Pending' || ord.status === 'Approved') && (
                          <button
                            type="button"
                            onClick={() =>
                              runAction('TRANSITION_ORDER_STATUS', {
                                order_id: ord.id,
                                next_status: 'Dispatched' as OrderStatus,
                              })
                            }
                            className="px-2 py-0.5 text-xs font-semibold text-white bg-emerald-700 rounded"
                          >
                            Dispatch
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 4. DISPATCH MODULE
  // ---------------------------------------------------------------------------
  if (section === 'DISPATCH') {
    const pendingDispatch = state.orders.filter(
      (o) => o.status === 'Pending' || o.status === 'Approved'
    );
    const completedDispatch = state.orders.filter(
      (o) => o.status === 'Dispatched' || o.status === 'Delivered'
    );

    return (
      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Pending Factory Dispatch Queue ({pendingDispatch.length})
            </h2>
          </div>
          {pendingDispatch.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No pending orders awaiting dispatch.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2 px-3">Order #</th>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Dealer / Shop</th>
                    <th className="py-2 px-3">Shipment Items</th>
                    <th className="py-2 px-3 text-right">Amount</th>
                    <th className="py-2 px-3 text-center">Status</th>
                    <th className="py-2 px-3 text-right">Dispatch Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {pendingDispatch.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-semibold tabular-nums">{ord.order_number}</td>
                      <td className="py-2 px-3 text-slate-600 tabular-nums">{ord.order_date}</td>
                      <td className="py-2 px-3 font-semibold text-slate-900">{ord.shop_name}</td>
                      <td className="py-2 px-3 text-slate-700">
                        {ord.items.map((i) => `${i.quantity_cartons} Ctn × ${i.product_name}`).join(', ')}
                      </td>
                      <td className="py-2 px-3 text-right font-bold tabular-nums">
                        PKR {ord.total_amount.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 rounded">
                          {ord.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right space-x-1.5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            runAction(
                              'TRANSITION_ORDER_STATUS',
                              {
                                order_id: ord.id,
                                next_status: 'Dispatched' as OrderStatus,
                              },
                              `Order ${ord.order_number} dispatched.`
                            )
                          }
                          className="px-3 py-1 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded"
                        >
                          Dispatch Stock
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Dispatched &amp; Delivered Shipments ({completedDispatch.length})
            </h3>
          </div>
          {completedDispatch.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No dispatched shipments recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2 px-3">Order #</th>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Dealer</th>
                    <th className="py-2 px-3">Items Dispatched</th>
                    <th className="py-2 px-3 text-right">Invoice Amount</th>
                    <th className="py-2 px-3 text-center">Status</th>
                    <th className="py-2 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {completedDispatch.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-semibold tabular-nums">{ord.order_number}</td>
                      <td className="py-2 px-3 text-slate-600 tabular-nums">{ord.order_date}</td>
                      <td className="py-2 px-3 font-medium text-slate-900">{ord.shop_name}</td>
                      <td className="py-2 px-3 text-slate-700">
                        {ord.items.map((i) => `${i.quantity_cartons} Ctn × ${i.product_name}`).join(', ')}
                      </td>
                      <td className="py-2 px-3 text-right font-bold tabular-nums">
                        PKR {ord.total_amount.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                          {ord.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        {ord.status === 'Dispatched' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              runAction(
                                'TRANSITION_ORDER_STATUS',
                                {
                                  order_id: ord.id,
                                  next_status: 'Delivered' as OrderStatus,
                                },
                                `Order ${ord.order_number} marked delivered.`
                              )
                            }
                            className="px-2.5 py-0.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded"
                          >
                            Mark Delivered
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 5. DEALERS DIRECTORY MODULE
  // ---------------------------------------------------------------------------
  if (section === 'DEALERS') {
    const bookers = state.users.filter((u) => u.role === 'BOOKER');
    const handleAddDealer = async (e: React.FormEvent) => {
      e.preventDefault();
      const res = await runAction(
        'CREATE_DEALER',
        {
          dealer_name: dealerName,
          shop_name: shopName,
          contact_number: dealerPhone,
          address: dealerAddress,
          area_id: dealerAreaId,
          assigned_booker_id: dealerBookerId || bookers[0]?.id,
          opening_balance: Number(openingBalance || 0),
          credit_limit: Number(creditLimit || 300000),
        },
        `Dealer added: ${shopName}`
      );
      if (res?.ok) {
        setDealerName('');
        setShopName('');
        setDealerPhone('');
        setDealerAddress('');
        setOpeningBalance('0');
      }
    };

    return (
      <div className="space-y-4">
        <form
          onSubmit={handleAddDealer}
          className="bg-white border border-slate-200 rounded p-4 space-y-3 no-print"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-2">
            Add Dealer / Distributor
          </div>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Shop / Distributor Name *
              </label>
              <input
                type="text"
                required
                placeholder="Shop or business name"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Contact Person *
              </label>
              <input
                type="text"
                required
                placeholder="Owner / Manager name"
                value={dealerName}
                onChange={(e) => setDealerName(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Phone *
              </label>
              <input
                type="text"
                required
                placeholder="0300-0000000"
                value={dealerPhone}
                onChange={(e) => setDealerPhone(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Area / Route
              </label>
              <select
                value={dealerAreaId}
                onChange={(e) => setDealerAreaId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
              >
                {state.dealer_areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.city})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Opening Balance (PKR)
              </label>
              <input
                type="number"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded tabular-nums"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={busy}
                className="w-full py-1.5 px-3 bg-[#0B192C] hover:bg-slate-800 text-white text-xs font-semibold rounded"
              >
                Add Dealer
              </button>
            </div>
          </div>
        </form>

        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Dealers &amp; Distributors ({state.dealers.length})
            </h3>
            <span className="text-xs font-semibold text-slate-700 tabular-nums">
              Total Receivables: PKR{' '}
              {state.dealers
                .reduce((acc, d) => acc + (d.outstanding_balance || 0), 0)
                .toLocaleString()}
            </span>
          </div>
          {state.dealers.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">No dealers registered.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2 px-3">Code</th>
                    <th className="py-2 px-3">Shop / Business</th>
                    <th className="py-2 px-3">Contact Person</th>
                    <th className="py-2 px-3">Phone</th>
                    <th className="py-2 px-3">Area</th>
                    <th className="py-2 px-3 text-right">Credit Limit</th>
                    <th className="py-2 px-3 text-right">Closing Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {state.dealers.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 tabular-nums text-slate-500">{d.code}</td>
                      <td className="py-2 px-3 font-semibold text-slate-900">{d.shop_name}</td>
                      <td className="py-2 px-3 text-slate-700">{d.dealer_name}</td>
                      <td className="py-2 px-3 tabular-nums text-slate-600">{d.contact_number}</td>
                      <td className="py-2 px-3 text-slate-600">{d.area_name}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">
                        PKR {d.credit_limit.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-slate-900">
                        PKR {d.outstanding_balance.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 6. DEALER LEDGER MODULE
  // ---------------------------------------------------------------------------
  if (section === 'DEALER_LEDGER') {
    const filteredEntries = state.dealer_ledger.filter(
      (entry) => ledgerDealerFilter === 'ALL' || entry.dealer_id === ledgerDealerFilter
    );
    const totalSalesDebit = filteredEntries
      .filter((e) => e.entry_type === 'SALES_INVOICE' || e.entry_type === 'OPENING_BALANCE')
      .reduce((s, e) => s + e.debit, 0);
    const totalPaymentsCredit = filteredEntries
      .filter((e) => e.entry_type === 'PAYMENT_RECEIVED' || e.entry_type === 'SALES_RETURN_CREDIT')
      .reduce((s, e) => s + e.credit, 0);
    const closingBal =
      ledgerDealerFilter === 'ALL'
        ? state.dealers.reduce((s, d) => s + d.outstanding_balance, 0)
        : state.dealers.find((d) => d.id === ledgerDealerFilter)?.outstanding_balance || 0;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 bg-white border border-slate-200 rounded divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <div className="p-3">
            <div className="text-[11px] font-medium text-slate-500">
              Total Debits (Opening + Sales)
            </div>
            <div className="text-sm font-bold tabular-nums text-slate-900 mt-1">
              PKR {totalSalesDebit.toLocaleString()}
            </div>
          </div>
          <div className="p-3">
            <div className="text-[11px] font-medium text-slate-500">
              Total Credits (Payments + Returns)
            </div>
            <div className="text-sm font-bold tabular-nums text-emerald-700 mt-1">
              PKR {totalPaymentsCredit.toLocaleString()}
            </div>
          </div>
          <div className="p-3 bg-slate-50">
            <div className="text-[11px] font-semibold text-slate-700">Closing Receivable Balance</div>
            <div className="text-sm font-bold tabular-nums text-slate-900 mt-1">
              PKR {closingBal.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Dealer Account Statement ({filteredEntries.length})
            </h2>
            <div className="flex items-center gap-2 no-print">
              <select
                value={ledgerDealerFilter}
                onChange={(e) => setLedgerDealerFilter(e.target.value)}
                className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded"
              >
                <option value="ALL">All Dealers</option>
                {state.dealers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.shop_name} (PKR {d.outstanding_balance.toLocaleString()})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
            </div>
          </div>
          {filteredEntries.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No dealer ledger entries found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Dealer</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3">Reference</th>
                    <th className="py-2 px-3">Description</th>
                    <th className="py-2 px-3 text-right">Debit (+)</th>
                    <th className="py-2 px-3 text-right">Credit (-)</th>
                    <th className="py-2 px-3 text-right">Running Balance</th>
                    <th className="py-2 px-3 text-right no-print">Reversal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredEntries.map((entry) => {
                    const dealer = state.dealers.find((d) => d.id === entry.dealer_id);
                    const isReversed = entry.reference_number.startsWith('REV-');
                    return (
                      <tr key={entry.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 tabular-nums text-slate-600">{entry.date}</td>
                        <td className="py-2 px-3 font-medium text-slate-900">
                          {dealer?.shop_name || entry.dealer_id}
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 border border-slate-300 rounded">
                            {entry.entry_type}
                          </span>
                        </td>
                        <td className="py-2 px-3 tabular-nums text-slate-700">
                          {entry.reference_number}
                        </td>
                        <td className="py-2 px-3 text-slate-600">{entry.description}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-800 font-medium">
                          {entry.debit > 0 ? `PKR ${entry.debit.toLocaleString()}` : '—'}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-emerald-700 font-medium">
                          {entry.credit > 0 ? `PKR ${entry.credit.toLocaleString()}` : '—'}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums font-bold text-slate-900">
                          PKR {entry.balance.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right no-print">
                          {!isReversed && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                runAction(
                                  'REVERSE_LEDGER_ENTRY',
                                  {
                                    entry_id: entry.id,
                                    reason: 'Admin ledger correction',
                                  },
                                  'Reversal entry posted.'
                                )
                              }
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded"
                            >
                              <RotateCcw className="w-3 h-3" /> Reverse
                            </button>
                          )}
                        </td>
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

  // ---------------------------------------------------------------------------
  // 7. SUPPLIER LEDGER MODULE
  // ---------------------------------------------------------------------------
  if (section === 'SUPPLIER_LEDGER') {
    const supplierLedger = state.supplier_ledger || [];
    const filteredEntries = supplierLedger.filter(
      (entry) => ledgerSupplierFilter === 'ALL' || entry.supplier_id === ledgerSupplierFilter
    );
    const totalPurchasesCredit = filteredEntries.reduce((s, e) => s + e.credit, 0);
    const totalPaymentsDebit = filteredEntries.reduce((s, e) => s + e.debit, 0);
    const closingPayable =
      ledgerSupplierFilter === 'ALL'
        ? state.suppliers.reduce((s, sup) => s + sup.payable_balance, 0)
        : state.suppliers.find((s) => s.id === ledgerSupplierFilter)?.payable_balance || 0;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 bg-white border border-slate-200 rounded divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <div className="p-3">
            <div className="text-[11px] font-medium text-slate-500">
              Total Purchases &amp; Opening (Credit)
            </div>
            <div className="text-sm font-bold tabular-nums text-slate-900 mt-1">
              PKR {totalPurchasesCredit.toLocaleString()}
            </div>
          </div>
          <div className="p-3">
            <div className="text-[11px] font-medium text-slate-500">
              Total Payments Made (Debit)
            </div>
            <div className="text-sm font-bold tabular-nums text-emerald-700 mt-1">
              PKR {totalPaymentsDebit.toLocaleString()}
            </div>
          </div>
          <div className="p-3 bg-slate-50">
            <div className="text-[11px] font-semibold text-slate-700">Closing Payable Balance</div>
            <div className="text-sm font-bold tabular-nums text-amber-800 mt-1">
              PKR {closingPayable.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Supplier Ledger Statement ({filteredEntries.length})
            </h2>
            <div className="flex items-center gap-2 no-print">
              <select
                value={ledgerSupplierFilter}
                onChange={(e) => setLedgerSupplierFilter(e.target.value)}
                className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded"
              >
                <option value="ALL">All Suppliers</option>
                {state.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (Payable: PKR {s.payable_balance.toLocaleString()})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
            </div>
          </div>
          {filteredEntries.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No supplier ledger entries recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Supplier</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3">Reference</th>
                    <th className="py-2 px-3">Description</th>
                    <th className="py-2 px-3 text-right">Purchase Credit (+)</th>
                    <th className="py-2 px-3 text-right">Payment Debit (-)</th>
                    <th className="py-2 px-3 text-right">Payable Balance</th>
                    <th className="py-2 px-3 text-right no-print">Reversal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredEntries.map((entry) => {
                    const isReversed = entry.reference_number.startsWith('SREV-');
                    return (
                      <tr key={entry.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 tabular-nums text-slate-600">{entry.date}</td>
                        <td className="py-2 px-3 font-medium text-slate-900">
                          {entry.supplier_name}
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 border border-slate-300 rounded">
                            {entry.entry_type}
                          </span>
                        </td>
                        <td className="py-2 px-3 tabular-nums text-slate-700">
                          {entry.reference_number}
                        </td>
                        <td className="py-2 px-3 text-slate-600">{entry.description}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-800 font-medium">
                          {entry.credit > 0 ? `PKR ${entry.credit.toLocaleString()}` : '—'}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-emerald-700 font-medium">
                          {entry.debit > 0 ? `PKR ${entry.debit.toLocaleString()}` : '—'}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums font-bold text-slate-900">
                          PKR {entry.balance.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right no-print">
                          {!isReversed && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                runAction(
                                  'REVERSE_SUPPLIER_LEDGER_ENTRY',
                                  {
                                    entry_id: entry.id,
                                    reason: 'Admin supplier ledger correction',
                                  },
                                  'Supplier reversal posted.'
                                )
                              }
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded"
                            >
                              <RotateCcw className="w-3 h-3" /> Reverse
                            </button>
                          )}
                        </td>
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

  // ---------------------------------------------------------------------------
  // 8. PAYMENTS MODULE (DEALER RECEIPTS & SUPPLIER PAYMENTS)
  // ---------------------------------------------------------------------------
  if (section === 'PAYMENTS') {
    const handleRecordDealerPayment = async (e: React.FormEvent) => {
      e.preventDefault();
      const res = await runAction(
        'RECORD_PAYMENT',
        {
          dealer_id: payDealerId,
          amount: Number(payAmount),
          payment_method: payMethod,
          reference_number: payRef,
          direction: 'INCOMING_FROM_DEALER',
        },
        'Dealer payment received.'
      );
      if (res?.ok) {
        setPayAmount('');
        setPayRef('');
      }
    };

    const handleRecordSupplierPayment = async (e: React.FormEvent) => {
      e.preventDefault();
      const res = await runAction(
        'RECORD_SUPPLIER_PAYMENT',
        {
          supplier_id: supPayId,
          amount: Number(supPayAmount),
          payment_method: supPayMethod,
          reference_number: supPayRef,
        },
        'Supplier payment recorded.'
      );
      if (res?.ok) {
        setSupPayAmount('');
        setSupPayRef('');
      }
    };

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 no-print">
          {/* Receive Dealer Payment */}
          <form
            onSubmit={handleRecordDealerPayment}
            className="bg-white border border-slate-200 rounded p-4 space-y-3"
          >
            <div className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-2">
              Record Payment Received from Dealer
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Dealer *
                </label>
                <select
                  required
                  value={payDealerId}
                  onChange={(e) => setPayDealerId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                >
                  <option value="">Select Dealer *</option>
                  {state.dealers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.shop_name} (Bal: PKR {d.outstanding_balance.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Amount Received (PKR) *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="0"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Deposit Account *
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                >
                  <option value="Cash">Cash Account</option>
                  <option value="Bank Transfer">Bank Account</option>
                  <option value="Cheque">Cheque (Bank)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Receipt / Cheque #
                </label>
                <input
                  type="text"
                  placeholder="Reference #"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busy || state.dealers.length === 0}
                className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold rounded"
              >
                Record Payment
              </button>
            </div>
          </form>

          {/* Pay Supplier */}
          <form
            onSubmit={handleRecordSupplierPayment}
            className="bg-white border border-slate-200 rounded p-4 space-y-3"
          >
            <div className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-2">
              Record Payment Made to Supplier
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Supplier *
                </label>
                <select
                  required
                  value={supPayId}
                  onChange={(e) => setSupPayId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                >
                  <option value="">Select Supplier *</option>
                  {state.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Payable: PKR {s.payable_balance.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Amount Paid (PKR) *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="0"
                  value={supPayAmount}
                  onChange={(e) => setSupPayAmount(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Paid From Account *
                </label>
                <select
                  value={supPayMethod}
                  onChange={(e) => setSupPayMethod(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                >
                  <option value="Cash">Cash Account</option>
                  <option value="Bank Transfer">Bank Account</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Voucher / Reference #
                </label>
                <input
                  type="text"
                  placeholder="Reference #"
                  value={supPayRef}
                  onChange={(e) => setSupPayRef(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busy || state.suppliers.length === 0}
                className="px-4 py-1.5 bg-[#0B192C] hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded"
              >
                Pay Supplier
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Customer Payment Receipts ({state.payments.length})
            </h3>
          </div>
          {state.payments.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No payment receipts recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2 px-3">Receipt #</th>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Dealer</th>
                    <th className="py-2 px-3">Method</th>
                    <th className="py-2 px-3">Reference</th>
                    <th className="py-2 px-3 text-right">Amount</th>
                    <th className="py-2 px-3">Received By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {state.payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-semibold tabular-nums">{p.receipt_number}</td>
                      <td className="py-2 px-3 text-slate-600 tabular-nums">{p.payment_date}</td>
                      <td className="py-2 px-3 font-medium text-slate-900">{p.dealer_name}</td>
                      <td className="py-2 px-3 text-slate-700">{p.payment_method}</td>
                      <td className="py-2 px-3 text-slate-600 tabular-nums">
                        {p.reference_number}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-emerald-700 tabular-nums">
                        PKR {p.amount.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-slate-600">{p.collected_by_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 9. EXPENSES MODULE
  // ---------------------------------------------------------------------------
  if (section === 'EXPENSES') {
    const handleAddExpense = async (e: React.FormEvent) => {
      e.preventDefault();
      const res = await runAction(
        'CREATE_EXPENSE',
        {
          category: expCategory,
          amount: Number(expAmount),
          description: expDesc,
          date: expDate,
          payment_method: expMethod,
        },
        'Expense recorded.'
      );
      if (res?.ok) {
        setExpAmount('');
        setExpDesc('');
      }
    };

    const totalApprovedExpenses = state.expenses
      .filter((e) => e.approval_status === 'Approved')
      .reduce((s, e) => s + e.amount, 0);

    return (
      <div className="space-y-4">
        <form
          onSubmit={handleAddExpense}
          className="bg-white border border-slate-200 rounded p-4 grid grid-cols-1 md:grid-cols-6 gap-2.5 no-print"
        >
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Category *
            </label>
            <select
              value={expCategory}
              onChange={(e) => setExpCategory(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
            >
              <option value="Electricity & Utilities">Electricity & Utilities</option>
              <option value="Generator Fuel & Diesel">Generator Fuel & Diesel</option>
              <option value="Salaries & Wages">Salaries & Wages</option>
              <option value="Transport & Van Fuel">Transport & Van Fuel</option>
              <option value="Machine Maintenance">Machine Maintenance</option>
              <option value="Packaging & Misc">Packaging & Misc</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Amount (PKR) *
            </label>
            <input
              type="number"
              min="1"
              required
              placeholder="0"
              value={expAmount}
              onChange={(e) => setExpAmount(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Paid From *
            </label>
            <select
              value={expMethod}
              onChange={(e) => setExpMethod(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
            >
              <option value="Cash">Cash Account</option>
              <option value="Bank Transfer">Bank Account</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Date *</label>
            <input
              type="date"
              required
              value={expDate}
              onChange={(e) => setExpDate(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Description *
            </label>
            <input
              type="text"
              required
              placeholder="Expense details"
              value={expDesc}
              onChange={(e) => setExpDesc(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={busy}
              className="w-full py-1.5 px-3 bg-[#0B192C] hover:bg-slate-800 text-white text-xs font-semibold rounded"
            >
              Add Expense
            </button>
          </div>
        </form>

        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Factory Operating Expenses ({state.expenses.length})
            </h3>
            <span className="text-xs font-semibold text-slate-800 tabular-nums">
              Approved Total: PKR {totalApprovedExpenses.toLocaleString()}
            </span>
          </div>
          {state.expenses.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">No expenses recorded.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2 px-3">Voucher #</th>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Category</th>
                    <th className="py-2 px-3">Description</th>
                    <th className="py-2 px-3">Account</th>
                    <th className="py-2 px-3 text-right">Amount</th>
                    <th className="py-2 px-3 text-center">Status</th>
                    <th className="py-2 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {state.expenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 tabular-nums font-medium">{exp.expense_number}</td>
                      <td className="py-2 px-3 tabular-nums text-slate-600">{exp.date}</td>
                      <td className="py-2 px-3 font-medium">{exp.category}</td>
                      <td className="py-2 px-3 text-slate-600">{exp.description}</td>
                      <td className="py-2 px-3 text-slate-600">{exp.payment_method}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold">
                        PKR {exp.amount.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
                            exp.approval_status === 'Approved'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : exp.approval_status === 'Rejected'
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {exp.approval_status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right space-x-1">
                        {exp.approval_status === 'Pending' && (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                runAction(
                                  'APPROVE_OR_REJECT_EXPENSE',
                                  {
                                    expense_id: exp.id,
                                    decision: 'Approved',
                                  },
                                  `Expense ${exp.expense_number} approved.`
                                )
                              }
                              className="px-2 py-0.5 text-xs font-semibold text-white bg-emerald-700 rounded"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                runAction(
                                  'APPROVE_OR_REJECT_EXPENSE',
                                  {
                                    expense_id: exp.id,
                                    decision: 'Rejected',
                                  },
                                  `Expense ${exp.expense_number} rejected.`
                                )
                              }
                              className="px-2 py-0.5 text-xs font-semibold text-white bg-red-600 rounded"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 10. CASH & BANK ACCOUNTS MODULE
  // ---------------------------------------------------------------------------
  if (section === 'CASH_AND_BANK') {
    const accounts = state.cash_bank_accounts || [];
    const cashAcc = accounts.find((a) => a.id === 'acc-cash');
    const bankAcc = accounts.find((a) => a.id === 'acc-bank');
    const finTxns = state.financial_transactions || [];

    const handleRecordCashBankTxn = async (e: React.FormEvent) => {
      e.preventDefault();
      const isOutflow =
        cbType === 'BANK_WITHDRAWAL_TO_CASH' && cbAccountId === 'acc-bank'
          ? 'OUTFLOW'
          : cbType === 'CASH_DEPOSIT_TO_BANK' && cbAccountId === 'acc-cash'
          ? 'OUTFLOW'
          : 'INFLOW';
      const res = await runAction(
        'RECORD_CASH_BANK_TRANSACTION',
        {
          account_id: cbAccountId,
          transaction_type: cbType,
          direction: isOutflow,
          amount: Number(cbAmount),
          payment_method: cbAccountId === 'acc-bank' ? 'Bank Transfer' : 'Cash',
          party_name: cbParty,
          reference_number: cbRef || undefined,
          notes: cbNotes,
          date: today,
        },
        'Cash/Bank entry posted.'
      );
      if (res?.ok) {
        setCbAmount('');
        setCbRef('');
        setCbNotes('');
      }
    };

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 bg-white border border-slate-200 rounded divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <div className="p-3.5">
            <div className="text-[11px] font-medium text-slate-500">
              {cashAcc?.account_name || 'Factory Cash in Hand'}
            </div>
            <div className="text-base font-bold tabular-nums text-slate-900 mt-1">
              PKR {(cashAcc?.current_balance || 0).toLocaleString()}
            </div>
          </div>
          <div className="p-3.5">
            <div className="text-[11px] font-medium text-slate-500">
              {bankAcc?.account_name || 'Meezan Bank Corporate Account'}
            </div>
            <div className="text-base font-bold tabular-nums text-slate-900 mt-1">
              PKR {(bankAcc?.current_balance || 0).toLocaleString()}
            </div>
          </div>
          <div className="p-3.5 bg-slate-50">
            <div className="text-[11px] font-semibold text-slate-700">
              Total Liquid Funds (Cash + Bank)
            </div>
            <div className="text-base font-bold tabular-nums text-emerald-700 mt-1">
              PKR{' '}
              {(
                (cashAcc?.current_balance || 0) + (bankAcc?.current_balance || 0)
              ).toLocaleString()}
            </div>
          </div>
        </div>

        <form
          onSubmit={handleRecordCashBankTxn}
          className="bg-white border border-slate-200 rounded p-4 grid grid-cols-1 md:grid-cols-6 gap-2.5 no-print"
        >
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Target Account *
            </label>
            <select
              value={cbAccountId}
              onChange={(e) => setCbAccountId(e.target.value as 'acc-cash' | 'acc-bank')}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
            >
              <option value="acc-cash">Factory Cash in Hand</option>
              <option value="acc-bank">Meezan Bank Corporate Account</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Transaction Type *
            </label>
            <select
              value={cbType}
              onChange={(e) => setCbType(e.target.value as FinancialTransactionType)}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
            >
              <option value="OPENING_BALANCE">Opening Balance</option>
              <option value="CAPITAL_INJECTION">Owner Capital Injection</option>
              <option value="CASH_DEPOSIT_TO_BANK">Cash Deposit to Bank</option>
              <option value="BANK_WITHDRAWAL_TO_CASH">Bank Withdrawal to Cash</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Amount (PKR) *
            </label>
            <input
              type="number"
              min="1"
              required
              placeholder="0"
              value={cbAmount}
              onChange={(e) => setCbAmount(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Party / Depositor
            </label>
            <input
              type="text"
              value={cbParty}
              onChange={(e) => setCbParty(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Remarks / Reference
            </label>
            <input
              type="text"
              placeholder="Voucher or note"
              value={cbNotes}
              onChange={(e) => setCbNotes(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={busy}
              className="w-full py-1.5 px-3 bg-[#0B192C] hover:bg-slate-800 text-white text-xs font-semibold rounded"
            >
              Post Entry
            </button>
          </div>
        </form>

        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Cash &amp; Bank Transaction Ledger ({finTxns.length})
            </h3>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded no-print"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
          </div>
          {finTxns.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No cash or bank transactions recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Reference #</th>
                    <th className="py-2 px-3">Account</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3">Party</th>
                    <th className="py-2 px-3 text-right">Inflow (+)</th>
                    <th className="py-2 px-3 text-right">Outflow (-)</th>
                    <th className="py-2 px-3 text-right">Balance After</th>
                    <th className="py-2 px-3">Entered By</th>
                    <th className="py-2 px-3 text-right no-print">Reversal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {finTxns.map((txn) => {
                    const isRev = txn.transaction_type === 'REVERSAL_ENTRY';
                    return (
                      <tr key={txn.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 tabular-nums text-slate-600">{txn.transaction_date}</td>
                        <td className="py-2 px-3 tabular-nums font-medium text-slate-800">
                          {txn.reference_number}
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-900">{txn.account_name}</td>
                        <td className="py-2 px-3">
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 border border-slate-300 rounded">
                            {txn.transaction_type.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-700">{txn.related_party_name}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-emerald-700 font-semibold">
                          {txn.direction === 'INFLOW'
                            ? `+PKR ${txn.amount.toLocaleString()}`
                            : '—'}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-red-700 font-semibold">
                          {txn.direction === 'OUTFLOW'
                            ? `-PKR ${txn.amount.toLocaleString()}`
                            : '—'}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums font-bold text-slate-900">
                          PKR {txn.balance_after.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-slate-600">{txn.entered_by_name}</td>
                        <td className="py-2 px-3 text-right no-print">
                          {!isRev && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                runAction(
                                  'REVERSE_FINANCIAL_TRANSACTION',
                                  {
                                    transaction_id: txn.id,
                                    reason: 'Admin financial reversal',
                                  },
                                  'Financial transaction reversed.'
                                )
                              }
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded"
                            >
                              <RotateCcw className="w-3 h-3" /> Reverse
                            </button>
                          )}
                        </td>
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

  // ---------------------------------------------------------------------------
  // 11. PROFIT & LOSS STATEMENT MODULE
  // ---------------------------------------------------------------------------
  if (section === 'PROFIT_AND_LOSS') {
    const finalizedOrders = state.orders.filter(
      (o) => o.status === 'Dispatched' || o.status === 'Delivered'
    );
    const pendingOrders = state.orders.filter(
      (o) => o.status === 'Pending' || o.status === 'Approved'
    );
    const grossSales = finalizedOrders.reduce(
      (s, o) => s + (o.total_amount + (o.discount_total || 0)),
      0
    );
    const totalDiscounts = finalizedOrders.reduce((s, o) => s + (o.discount_total || 0), 0);
    const totalReturns = (state.sales_returns || []).reduce((s, r) => s + (r.credit_amount || 0), 0);
    const netSales = grossSales - totalDiscounts - totalReturns;
    const totalCogs = finalizedOrders.reduce((s, o) => s + (o.total_cogs || 0), 0);
    const grossProfit = netSales - totalCogs;
    const finalizedExpenses = state.expenses
      .filter((e) => e.approval_status === 'Approved')
      .reduce((s, e) => s + e.amount, 0);
    const pendingExpenses = state.expenses
      .filter((e) => e.approval_status === 'Pending')
      .reduce((s, e) => s + e.amount, 0);
    const netProfit = grossProfit - finalizedExpenses;

    const pendingOrderRevenue = pendingOrders.reduce((s, o) => s + o.total_amount, 0);
    const totalPurchases = state.purchases.reduce((s, p) => s + p.total_amount, 0);
    const totalReceivables = state.dealers.reduce((s, d) => s + d.outstanding_balance, 0);
    const totalPayables = state.suppliers.reduce((s, sup) => s + sup.payable_balance, 0);

    return (
      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Profit &amp; Loss Statement — Finalized Accounting Results
              </h2>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded no-print"
            >
              <Printer className="w-3.5 h-3.5" /> Print Statement
            </button>
          </div>

          <div className="p-4">
            <table className="w-full text-left border-collapse text-xs">
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="py-2.5 px-3 font-medium text-slate-700">
                    Gross Dispatched Sales Revenue
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-slate-900">
                    PKR {grossSales.toLocaleString()}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 text-slate-600 pl-6">
                    Less: Sales Discounts &amp; Allowances
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-slate-600">
                    (PKR {totalDiscounts.toLocaleString()})
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 text-slate-600 pl-6">Less: Sales Returns</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-slate-600">
                    (PKR {totalReturns.toLocaleString()})
                  </td>
                </tr>
                <tr className="bg-slate-50 font-bold">
                  <td className="py-2.5 px-3 text-slate-900">Net Sales Revenue</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-slate-900">
                    PKR {netSales.toLocaleString()}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 text-slate-700">
                    Less: Cost of Goods Sold (Verified Production Material &amp; Packaging Cost)
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-slate-700">
                    (PKR {totalCogs.toLocaleString()})
                  </td>
                </tr>
                <tr className="bg-emerald-50/50 font-bold">
                  <td className="py-2.5 px-3 text-emerald-900">
                    Gross Profit (Net Sales − Cost of Goods Sold)
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-emerald-800">
                    PKR {grossProfit.toLocaleString()}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 text-slate-700">
                    Less: Approved Factory Operating Expenses
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-slate-700">
                    (PKR {finalizedExpenses.toLocaleString()})
                  </td>
                </tr>
                <tr className="bg-[#0B192C] text-white font-bold text-sm">
                  <td className="py-3 px-3">
                    Finalized Net {netProfit >= 0 ? 'Profit' : 'Loss'} (Gross Profit − Operating Expenses)
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums">
                    PKR {netProfit.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Working Capital & Pending Figures */}
        <div className="grid grid-cols-1 md:grid-cols-4 bg-white border border-slate-200 rounded divide-y md:divide-y-0 md:divide-x divide-slate-200">
          <div className="p-3.5">
            <div className="text-[11px] font-medium text-slate-500">
              Total Raw Material Purchases
            </div>
            <div className="text-sm font-bold tabular-nums text-slate-900 mt-1">
              PKR {totalPurchases.toLocaleString()}
            </div>
          </div>
          <div className="p-3.5">
            <div className="text-[11px] font-medium text-slate-500">
              Customer Receivables (Dealers)
            </div>
            <div className="text-sm font-bold tabular-nums text-slate-900 mt-1">
              PKR {totalReceivables.toLocaleString()}
            </div>
          </div>
          <div className="p-3.5">
            <div className="text-[11px] font-medium text-slate-500">
              Supplier Payables (Outstanding)
            </div>
            <div className="text-sm font-bold tabular-nums text-amber-800 mt-1">
              PKR {totalPayables.toLocaleString()}
            </div>
          </div>
          <div className="p-3.5 bg-amber-50/40">
            <div className="text-[11px] font-medium text-amber-900">
              Pending / Unfinalized Orders &amp; Expenses
            </div>
            <div className="text-xs font-semibold tabular-nums text-amber-800 mt-1">
              Orders: PKR {pendingOrderRevenue.toLocaleString()} | Expenses: PKR{' '}
              {pendingExpenses.toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 12. REPORTS MODULE (12 REPORT TYPES + CSV EXPORT + PRINT)
  // ---------------------------------------------------------------------------
  if (section === 'REPORTS') {
    const reportRows = useMemo(() => {
      const inRange = (d: string) => {
        if (repDateFrom && d < repDateFrom) return false;
        if (repDateTo && d > repDateTo) return false;
        return true;
      };

      switch (reportType) {
        case 'DAILY_PRODUCTION':
        case 'MONTHLY_PRODUCTION':
          return state.production_batches
            .filter((b) => inRange(b.production_date))
            .map((b) => ({
              Date: b.production_date,
              Batch: b.batch_number,
              Product: b.product_name,
              Status: b.status,
              Target_Bottles: b.target_bottles || b.target_cartons * (b.units_per_carton || 24),
              Produced_Bottles:
                b.produced_bottles || b.actual_bottles || b.actual_cartons * (b.units_per_carton || 24),
              Damaged_Bottles:
                b.wastage_bottles || b.wastage_cartons * (b.units_per_carton || 24),
              Produced_Cartons: b.actual_cartons,
            }));
        case 'MATERIAL_CONSUMPTION':
          return (state.stock_ledger || [])
            .filter((l) => l.transaction_type === 'PRODUCTION_CONSUMPTION' && inRange(l.date))
            .map((l) => ({
              Date: l.date,
              Reference: l.reference_number,
              Material: l.material_name,
              Consumed_Qty: l.quantity_consumed,
              Unit: l.unit,
              Closing_Stock: l.closing_quantity,
              Entered_By: l.entered_by_name,
            }));
        case 'RAW_MATERIAL_STOCK':
          return state.raw_materials.map((m) => ({
            Code: m.code,
            Material: m.name,
            Category: m.category,
            Unit: m.unit,
            Opening: m.opening_stock || 0,
            Received: m.stock_received || 0,
            Consumed: m.stock_consumed || 0,
            Closing_Stock: m.current_stock,
            Avg_Cost_PKR: m.average_cost_per_unit || 0,
          }));
        case 'FINISHED_GOODS_STOCK':
          return state.finished_goods.map((f) => ({
            SKU: f.sku,
            Product: f.product_name,
            Bottle_Size: f.bottle_size_label,
            Available_Bottles: f.available_bottles || 0,
            Opening_Cartons: f.opening_stock_cartons,
            Produced_Cartons: f.verified_production_cartons,
            Dispatched_Cartons: f.dispatched_cartons,
            Closing_Cartons: f.closing_stock_cartons,
          }));
        case 'PURCHASES':
          return state.purchases
            .filter((p) => inRange(p.purchase_date))
            .map((p) => ({
              Date: p.purchase_date,
              Invoice: p.purchase_number,
              Supplier: p.supplier_name,
              Material: p.items?.[0]?.raw_material_name || '',
              Quantity: p.items?.[0]?.quantity || 0,
              Unit: p.items?.[0]?.unit || '',
              Total_PKR: p.total_amount,
              Paid_PKR: p.amount_paid,
            }));
        case 'SALES':
          return state.orders
            .filter((o) => inRange(o.order_date))
            .map((o) => ({
              Date: o.order_date,
              Order_No: o.order_number,
              Dealer: o.shop_name,
              Status: o.status,
              Total_PKR: o.total_amount,
              COGS_PKR: o.total_cogs,
            }));
        case 'DEALER_OUTSTANDING':
          return state.dealers.map((d) => ({
            Code: d.code,
            Shop_Name: d.shop_name,
            Contact: d.dealer_name,
            Phone: d.contact_number,
            Area: d.area_name,
            Credit_Limit_PKR: d.credit_limit,
            Outstanding_Balance_PKR: d.outstanding_balance,
          }));
        case 'SUPPLIER_PAYABLES':
          return state.suppliers.map((s) => ({
            Supplier: s.name,
            Contact: s.contact_person,
            Phone: s.phone,
            Payable_Balance_PKR: s.payable_balance,
          }));
        case 'EXPENSES':
          return state.expenses
            .filter((e) => inRange(e.date))
            .map((e) => ({
              Date: e.date,
              Voucher: e.expense_number,
              Category: e.category,
              Description: e.description,
              Method: e.payment_method,
              Amount_PKR: e.amount,
              Status: e.approval_status,
            }));
        case 'CASH_AND_BANK':
          return (state.financial_transactions || [])
            .filter((t) => inRange(t.transaction_date))
            .map((t) => ({
              Date: t.transaction_date,
              Reference: t.reference_number,
              Account: t.account_name,
              Type: t.transaction_type,
              Direction: t.direction,
              Amount_PKR: t.amount,
              Balance_After_PKR: t.balance_after,
              Party: t.related_party_name,
            }));
        default: {
          const disp = state.orders.filter(
            (o) =>
              (o.status === 'Dispatched' || o.status === 'Delivered') && inRange(o.order_date)
          );
          const sales = disp.reduce((s, o) => s + o.total_amount, 0);
          const cogs = disp.reduce((s, o) => s + o.total_cogs, 0);
          const exp = state.expenses
            .filter((e) => e.approval_status === 'Approved' && inRange(e.date))
            .reduce((s, e) => s + e.amount, 0);
          return [
            {
              Metric: 'Net Dispatched Sales',
              Amount_PKR: sales,
            },
            {
              Metric: 'Cost of Goods Sold (COGS)',
              Amount_PKR: cogs,
            },
            {
              Metric: 'Gross Profit',
              Amount_PKR: sales - cogs,
            },
            {
              Metric: 'Approved Operating Expenses',
              Amount_PKR: exp,
            },
            {
              Metric: 'Net Profit / Loss',
              Amount_PKR: sales - cogs - exp,
            },
          ];
        }
      }
    }, [reportType, repDateFrom, repDateTo, state]);

    const handleDownloadCsv = () => {
      if (reportRows.length === 0) return;
      const headers = Object.keys(reportRows[0]);
      const csvLines = [
        headers.join(','),
        ...reportRows.map((row) =>
          headers
            .map((h) => `"${String((row as Record<string, any>)[h] ?? '').replace(/"/g, '""')}"`)
            .join(',')
        ),
      ];
      const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FruityFun_${reportType}_${today}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };

    const columns = reportRows.length > 0 ? Object.keys(reportRows[0]) : [];

    return (
      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded p-4 flex flex-wrap items-end justify-between gap-3 no-print">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Report Type
              </label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded font-medium"
              >
                <option value="DAILY_PRODUCTION">1. Daily Production Report</option>
                <option value="MONTHLY_PRODUCTION">2. Monthly Production Report</option>
                <option value="MATERIAL_CONSUMPTION">3. Material Consumption Report</option>
                <option value="RAW_MATERIAL_STOCK">4. Raw Material Stock Report</option>
                <option value="FINISHED_GOODS_STOCK">5. Finished Goods Stock Report</option>
                <option value="PURCHASES">6. Purchases Report</option>
                <option value="SALES">7. Sales Report</option>
                <option value="DEALER_OUTSTANDING">8. Dealer Outstanding Report</option>
                <option value="SUPPLIER_PAYABLES">9. Supplier Payables Report</option>
                <option value="EXPENSES">10. Expenses Report</option>
                <option value="CASH_AND_BANK">11. Cash &amp; Bank Report</option>
                <option value="PROFIT_AND_LOSS">12. Profit &amp; Loss Summary</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                From Date
              </label>
              <input
                type="date"
                value={repDateFrom}
                onChange={(e) => setRepDateFrom(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                To Date
              </label>
              <input
                type="date"
                value={repDateTo}
                onChange={(e) => setRepDateTo(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={reportRows.length === 0}
              onClick={handleDownloadCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded"
            >
              <Printer className="w-3.5 h-3.5" /> Print / PDF
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              {reportType.replace(/_/g, ' ')} ({reportRows.length} rows)
            </h3>
            <span className="text-[11px] text-slate-500">
              Fruity Fun Juice Factory — Owner: Sikandar Raja
            </span>
          </div>
          {reportRows.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No records match the selected report criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    {columns.map((col) => (
                      <th key={col} className="py-2 px-3">
                        {col.replace(/_/g, ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {reportRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      {columns.map((col) => {
                        const val = (row as Record<string, any>)[col];
                        return (
                          <td key={col} className="py-2 px-3 tabular-nums text-slate-800">
                            {typeof val === 'number' ? val.toLocaleString() : String(val ?? '—')}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 13. SETTINGS & CATALOG CONFIGURATION MODULE
  // ---------------------------------------------------------------------------
  if (section === 'SETTINGS') {
    const handleSaveSettings = async (e: React.FormEvent) => {
      e.preventDefault();
      await runAction(
        'UPDATE_FACTORY_SETTINGS',
        {
          company_name: companyName,
          owner_name: ownerName,
          phone: companyPhone,
          address: companyAddress,
        },
        'Factory settings updated.'
      );
    };

    const handleAddProductSku = async (e: React.FormEvent) => {
      e.preventDefault();
      const res = await runAction(
        'CREATE_PRODUCT',
        {
          name: newSkuName,
          sku: newSkuCode,
          flavour_id: newSkuFlavourId,
          bottle_size_id: newSkuSizeId,
          units_per_carton: Number(newSkuUpc || 24),
          wholesale_price_per_carton: Number(newSkuPrice),
          production_cost_per_carton: Number(newSkuCost),
        },
        `Finished good SKU "${newSkuName}" created.`
      );
      if (res?.ok) {
        setNewSkuName('');
        setNewSkuCode('');
      }
    };

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Company Profile Settings */}
          <form
            onSubmit={handleSaveSettings}
            className="bg-white border border-slate-200 rounded p-4 space-y-3"
          >
            <div className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-2">
              Company &amp; Owner Configuration
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Official Factory Name *
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Company Owner / Super Admin *
                </label>
                <input
                  type="text"
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Factory Phone
                </label>
                <input
                  type="text"
                  value={companyPhone}
                  onChange={(e) => setCompanyPhone(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Factory Address
                </label>
                <input
                  type="text"
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-1.5 bg-[#0B192C] text-white text-xs font-semibold rounded"
              >
                Save Company Settings
              </button>
            </div>
          </form>

          {/* Add Finished Good SKU */}
          <form
            onSubmit={handleAddProductSku}
            className="bg-white border border-slate-200 rounded p-4 space-y-3"
          >
            <div className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-2">
              Add Finished Good SKU (e.g. 200 ML / 250 ML / 500 ML / 1L)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apple Juice 250 ML"
                  value={newSkuName}
                  onChange={(e) => setNewSkuName(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  SKU Code *
                </label>
                <input
                  type="text"
                  required
                  placeholder="FF-APP-250"
                  value={newSkuCode}
                  onChange={(e) => setNewSkuCode(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Bottle Size *
                </label>
                <select
                  value={newSkuSizeId}
                  onChange={(e) => setNewSkuSizeId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                >
                  {state.bottle_sizes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Flavour *
                </label>
                <select
                  value={newSkuFlavourId}
                  onChange={(e) => setNewSkuFlavourId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                >
                  {state.flavours.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Bottles / Carton *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={newSkuUpc}
                  onChange={(e) => setNewSkuUpc(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Wholesale / Ctn (PKR) *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={newSkuPrice}
                  onChange={(e) => setNewSkuPrice(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded tabular-nums"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-1.5 bg-emerald-700 text-white text-xs font-semibold rounded"
              >
                Add Product SKU
              </button>
            </div>
          </form>
        </div>

        {/* Registered Product SKUs */}
        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Configured Finished Good SKUs ({state.products.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-2 px-3">SKU</th>
                  <th className="py-2 px-3">Product Name</th>
                  <th className="py-2 px-3">Flavour</th>
                  <th className="py-2 px-3">Bottle Size</th>
                  <th className="py-2 px-3 text-right">Bottles / Carton</th>
                  <th className="py-2 px-3 text-right">Wholesale / Ctn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {state.products.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 tabular-nums text-slate-600">{p.sku}</td>
                    <td className="py-2 px-3 font-semibold text-slate-900">{p.name}</td>
                    <td className="py-2 px-3 text-slate-600">{p.flavour_name}</td>
                    <td className="py-2 px-3 text-slate-600">{p.bottle_size_label}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{p.units_per_carton}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold">
                      PKR {p.wholesale_price_per_carton.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 14. MACHINES & MAINTENANCE MODULE
  // ---------------------------------------------------------------------------
  if (section === 'MACHINES') {
    const handleReportIssue = async (e: React.FormEvent) => {
      e.preventDefault();
      const res = await runAction(
        'REPORT_MACHINE_ISSUE',
        {
          machine_id: machId,
          priority: machPriority,
          problem_description: machProblem,
          maintenance_cost: Number(machCost || 0),
          issue_date: today,
        },
        'Machine issue logged.'
      );
      if (res?.ok) {
        setMachProblem('');
        setMachCost('0');
      }
    };

    return (
      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded p-4 no-print">
          <div className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-2 mb-3">
            Report Machine Issue
          </div>

          <form onSubmit={handleReportIssue} className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Machine *
              </label>
              <select
                value={machId}
                onChange={(e) => setMachId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
              >
                {state.machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.machine_number} — {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Priority *
              </label>
              <select
                value={machPriority}
                onChange={(e) => setMachPriority(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Issue Description *
              </label>
              <input
                type="text"
                required
                placeholder="Describe machine fault or maintenance required"
                value={machProblem}
                onChange={(e) => setMachProblem(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={busy}
                className="w-full py-1.5 px-3 bg-[#0B192C] hover:bg-slate-800 text-white text-xs font-semibold rounded"
              >
                Submit Issue
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Machine Maintenance Tickets ({state.maintenance_records.length})
            </h3>
          </div>
          {state.maintenance_records.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No active machine issues.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2 px-3">Ticket #</th>
                    <th className="py-2 px-3">Machine</th>
                    <th className="py-2 px-3">Issue</th>
                    <th className="py-2 px-3">Priority</th>
                    <th className="py-2 px-3">Reported By</th>
                    <th className="py-2 px-3 text-center">Status</th>
                    <th className="py-2 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {state.maintenance_records.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 tabular-nums font-semibold">{t.ticket_number}</td>
                      <td className="py-2 px-3 font-medium">{t.machine_name}</td>
                      <td className="py-2 px-3 text-slate-700">{t.problem_description}</td>
                      <td className="py-2 px-3 font-semibold text-amber-800">{t.priority}</td>
                      <td className="py-2 px-3 text-slate-600">{t.reported_by_name}</td>
                      <td className="py-2 px-3 text-center">{t.status}</td>
                      <td className="py-2 px-3 text-right">
                        {t.status !== 'Resolved' && (
                          <button
                            type="button"
                            onClick={() =>
                              runAction(
                                'RESOLVE_MACHINE_ISSUE',
                                { ticket_id: t.id },
                                `Ticket ${t.ticket_number} resolved.`
                              )
                            }
                            className="px-2 py-0.5 text-xs font-semibold text-white bg-emerald-700 rounded"
                          >
                            Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 15. MY PROFILE MODULE (FOR LOGGED-IN USER)
  // ---------------------------------------------------------------------------
  if (section === 'MY_PROFILE') {
    const handleUpdateMyProfile = async (e: React.FormEvent) => {
      e.preventDefault();
      const res = await runAction(
        'UPDATE_MY_PROFILE',
        {
          full_name: profName,
          phone: profPhone,
          department: profDept,
          current_password: profCurrentPassword || undefined,
          new_password: profNewPassword || undefined,
        },
        'Profile updated.'
      );
      if (res?.ok) {
        setProfCurrentPassword('');
        setProfNewPassword('');
      }
    };

    const myLogs = (state.audit_logs || []).filter((l) => l.actor_id === actor.id).slice(0, 20);

    return (
      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-2 mb-3">
            My User Profile &amp; Security Settings
          </div>
          <form onSubmit={handleUpdateMyProfile} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={profName}
                onChange={(e) => setProfName(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Login Email (Read-only)
              </label>
              <input
                type="email"
                readOnly
                value={actor.email}
                className="w-full px-2.5 py-1.5 text-xs bg-slate-100 text-slate-600 border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Role
              </label>
              <input
                type="text"
                readOnly
                value={
                  actor.role === 'OWNER'
                    ? 'Owner / Super Admin'
                    : actor.role === 'PRODUCTION_MANAGER'
                    ? 'Production Manager'
                    : 'Booker'
                }
                className="w-full px-2.5 py-1.5 text-xs bg-slate-100 text-slate-600 border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Phone Number *
              </label>
              <input
                type="text"
                required
                value={profPhone}
                onChange={(e) => setProfPhone(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Department
              </label>
              <input
                type="text"
                value={profDept}
                onChange={(e) => setProfDept(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                New Password (Optional)
              </label>
              <input
                type="password"
                placeholder="Leave blank to keep current password"
                value={profNewPassword}
                onChange={(e) => setProfNewPassword(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
              />
            </div>
            <div className="md:col-span-3 flex justify-end pt-1">
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-1.5 bg-[#0B192C] hover:bg-slate-800 text-white text-xs font-semibold rounded"
              >
                Save Profile Changes
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              My Recent Activity ({myLogs.length})
            </h3>
          </div>
          {myLogs.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No recent activity recorded for this account.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2 px-3">Timestamp</th>
                    <th className="py-2 px-3">Action</th>
                    <th className="py-2 px-3">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {myLogs.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 tabular-nums text-slate-500 whitespace-nowrap">
                        {new Date(l.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 px-3 font-semibold text-slate-800">{l.action}</td>
                      <td className="py-2 px-3 text-slate-700">{l.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 16. AUDIT LOGS MODULE
  // ---------------------------------------------------------------------------
  const filteredAudit = state.audit_logs.filter((log) => {
    if (!auditSearch.trim()) return true;
    const q = auditSearch.toLowerCase();
    return (
      log.actor_name.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      log.summary.toLowerCase().includes(q)
    );
  });

  return (
    <div className="bg-white border border-slate-200 rounded overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
          Audit History ({filteredAudit.length})
        </h2>
        <input
          type="text"
          placeholder="Search user, action, or details..."
          value={auditSearch}
          onChange={(e) => setAuditSearch(e.target.value)}
          className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded w-64 no-print"
        />
      </div>

      {filteredAudit.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500">No audit records found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                <th className="py-2 px-3">Timestamp</th>
                <th className="py-2 px-3">User</th>
                <th className="py-2 px-3">Role</th>
                <th className="py-2 px-3">Action</th>
                <th className="py-2 px-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredAudit.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="py-2 px-3 tabular-nums text-slate-500 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="py-2 px-3 font-medium text-slate-900">{log.actor_name}</td>
                  <td className="py-2 px-3">
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 border border-slate-300 rounded">
                      {log.actor_role === 'OWNER' ? 'Owner / Super Admin' : log.actor_role}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-semibold text-slate-800">{log.action}</td>
                  <td className="py-2 px-3 text-slate-700">{log.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
