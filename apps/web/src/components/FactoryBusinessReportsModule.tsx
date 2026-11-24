'use client';

import React, { useState, useMemo } from 'react';
import type { ErpDatabaseState } from '@/lib/db/store';
import type { UserProfile } from '@juice-erp/shared-types';
import { Printer, Download } from 'lucide-react';

type ReportCategory =
  | 'DAILY_FACTORY_REPORT'
  | 'MONTHLY_FACTORY_REPORT'
  | 'MANAGER_WISE_REPORT'
  | 'INVENTORY_REPORT'
  | 'BOOKER_REPORT';

type DatePreset = 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'CUSTOM';

interface Props {
  state: ErpDatabaseState;
  actor: UserProfile;
}

export function FactoryBusinessReportsModule({ state, actor }: Props) {
  const todayStr = new Date().toISOString().split('T')[0];
  const currentMonthStr = todayStr.slice(0, 7);

  const [reportCategory, setReportCategory] = useState<ReportCategory>('DAILY_FACTORY_REPORT');
  const [datePreset, setDatePreset] = useState<DatePreset>('TODAY');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [dateFrom, setDateFrom] = useState<string>(todayStr);
  const [dateTo, setDateTo] = useState<string>(todayStr);

  // Additional filters (Section 3)
  const [managerFilter, setManagerFilter] = useState<string>('ALL');
  const [productFilter, setProductFilter] = useState<'ALL' | 'Apple Juice' | 'Mango Juice'>('ALL');
  const [bookerFilter, setBookerFilter] = useState<string>('ALL');
  const [materialFilter, setMaterialFilter] = useState<string>('ALL');

  const applyDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    const now = new Date();
    const toIsoDate = (d: Date) => d.toISOString().split('T')[0];

    if (preset === 'TODAY') {
      const t = toIsoDate(now);
      setSelectedDate(t);
      setDateFrom(t);
      setDateTo(t);
    } else if (preset === 'YESTERDAY') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = toIsoDate(y);
      setSelectedDate(yStr);
      setDateFrom(yStr);
      setDateTo(yStr);
    } else if (preset === 'THIS_WEEK') {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      setDateFrom(toIsoDate(start));
      setDateTo(toIsoDate(now));
    } else if (preset === 'THIS_MONTH') {
      const firstOfMonth = `${toIsoDate(now).slice(0, 7)}-01`;
      setSelectedMonth(toIsoDate(now).slice(0, 7));
      setDateFrom(firstOfMonth);
      setDateTo(toIsoDate(now));
    }
  };

  const inDateRange = (d: string) => {
    if (reportCategory === 'DAILY_FACTORY_REPORT') {
      return d === selectedDate;
    }
    if (reportCategory === 'MONTHLY_FACTORY_REPORT' && datePreset === 'THIS_MONTH') {
      return d.startsWith(selectedMonth);
    }
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  };

  const dateRangeLabel = useMemo(() => {
    if (reportCategory === 'DAILY_FACTORY_REPORT') {
      return `Date: ${selectedDate}`;
    }
    if (reportCategory === 'MONTHLY_FACTORY_REPORT' && datePreset === 'THIS_MONTH') {
      return `Month: ${selectedMonth}`;
    }
    return `${dateFrom || 'Start'} to ${dateTo || 'Present'}`;
  }, [reportCategory, datePreset, selectedDate, selectedMonth, dateFrom, dateTo]);

  // ---------------------------------------------------------------------------
  // A. DAILY FACTORY REPORT DATA
  // ---------------------------------------------------------------------------
  const dailyReport = useMemo(() => {
    const activeCashTxs = (state.manager_cash_transactions || []).filter(
      (t) =>
        !t.is_reversed &&
        t.transaction_type !== 'REVERSAL_ADJUSTMENT' &&
        t.transaction_date === selectedDate &&
        (managerFilter === 'ALL' ||
          t.manager_id === managerFilter ||
          t.manager_name.toLowerCase().includes(managerFilter.toLowerCase()))
    );

    const cashIssued = activeCashTxs.filter(
      (t) => t.transaction_type === 'CASH_ISSUED_BY_OWNER'
    );
    const purchases = activeCashTxs.filter((t) => t.transaction_type === 'MATERIAL_PURCHASE');
    const expenses = activeCashTxs.filter((t) => t.transaction_type === 'FACTORY_EXPENSE');

    const stockChanges = (state.stock_ledger || []).filter(
      (l) =>
        l.date === selectedDate &&
        (materialFilter === 'ALL' ||
          l.material_id === materialFilter ||
          l.raw_material_id === materialFilter)
    );

    const confirmedBatches = (state.production_batches || []).filter(
      (b) =>
        !b.is_reversed &&
        b.status !== 'REVERSED' &&
        (b.status === 'CONFIRMED' || b.status === 'APPROVED' || b.status === 'Completed') &&
        b.production_date === selectedDate &&
        (managerFilter === 'ALL' ||
          b.created_by === managerFilter ||
          b.submitted_by === managerFilter ||
          (b.submitted_by_name || b.created_by_name || '')
            .toLowerCase()
            .includes(managerFilter.toLowerCase())) &&
        (productFilter === 'ALL' ||
          (b.juice_type || b.product_name || '')
            .toLowerCase()
            .includes(productFilter.split(' ')[0].toLowerCase()))
    );

    const appleCartons = confirmedBatches
      .filter((b) => (b.juice_type || b.product_name || '').toLowerCase().includes('apple'))
      .reduce((s, b) => s + b.actual_cartons, 0);
    const mangoCartons = confirmedBatches
      .filter((b) => (b.juice_type || b.product_name || '').toLowerCase().includes('mango'))
      .reduce((s, b) => s + b.actual_cartons, 0);

    const materialConsumption = confirmedBatches.flatMap((b) =>
      b.material_usage
        .filter(
          (u) => materialFilter === 'ALL' || u.raw_material_id === materialFilter
        )
        .map((u) => ({
          batch_number: b.batch_number,
          product: b.juice_type || b.product_name,
          manager: b.submitted_by_name || b.created_by_name || 'Manager',
          material_name: u.raw_material_name,
          entered_qty: u.entered_quantity ?? u.quantity_entered ?? u.actual_quantity,
          entered_unit: u.entered_unit ?? u.unit_entered ?? u.unit,
          base_qty: u.actual_quantity,
          base_unit: u.unit,
        }))
    );

    const activeBookerTxs = (state.booker_transactions || []).filter(
      (t) =>
        !t.is_reversed &&
        t.transaction_type !== 'REVERSAL_ENTRY' &&
        t.transaction_date === selectedDate &&
        (bookerFilter === 'ALL' || t.booker_id === bookerFilter) &&
        (productFilter === 'ALL' ||
          !t.juice_type ||
          t.juice_type === productFilter)
    );

    const bookerAllocations = activeBookerTxs.filter(
      (t) => t.transaction_type === 'CARTONS_GIVEN'
    );
    const bookerPayments = activeBookerTxs.filter(
      (t) => t.transaction_type === 'PAYMENT_RECEIVED'
    );

    return {
      cashIssued,
      cashIssuedTotal: cashIssued.reduce((s, t) => s + t.amount, 0),
      purchases,
      purchasesTotal: purchases.reduce((s, t) => s + t.amount, 0),
      expenses,
      expensesTotal: expenses.reduce((s, t) => s + t.amount, 0),
      stockChanges,
      appleCartons,
      applePieces: appleCartons * 24,
      mangoCartons,
      mangoPieces: mangoCartons * 24,
      totalCartons: appleCartons + mangoCartons,
      totalPieces: (appleCartons + mangoCartons) * 24,
      materialConsumption,
      bookerAllocations,
      bookerAllocationsCartons: bookerAllocations.reduce((s, t) => s + t.cartons_given, 0),
      bookerAllocationsPayable: bookerAllocations.reduce((s, t) => s + t.amount_payable, 0),
      bookerPayments,
      bookerPaymentsTotal: bookerPayments.reduce((s, t) => s + t.payment_received, 0),
    };
  }, [
    state,
    selectedDate,
    managerFilter,
    productFilter,
    bookerFilter,
    materialFilter,
  ]);

  // ---------------------------------------------------------------------------
  // B. MONTHLY FACTORY REPORT DATA
  // ---------------------------------------------------------------------------
  const monthlyReport = useMemo(() => {
    const matchMonth = (d: string) =>
      datePreset === 'CUSTOM' ? inDateRange(d) : d.startsWith(selectedMonth);

    const confirmedBatches = (state.production_batches || []).filter(
      (b) =>
        !b.is_reversed &&
        b.status !== 'REVERSED' &&
        (b.status === 'CONFIRMED' || b.status === 'APPROVED' || b.status === 'Completed') &&
        matchMonth(b.production_date) &&
        (productFilter === 'ALL' ||
          (b.juice_type || b.product_name || '')
            .toLowerCase()
            .includes(productFilter.split(' ')[0].toLowerCase()))
    );

    const appleCartons = confirmedBatches
      .filter((b) => (b.juice_type || b.product_name || '').toLowerCase().includes('apple'))
      .reduce((s, b) => s + b.actual_cartons, 0);
    const mangoCartons = confirmedBatches
      .filter((b) => (b.juice_type || b.product_name || '').toLowerCase().includes('mango'))
      .reduce((s, b) => s + b.actual_cartons, 0);
    const totalCartons = appleCartons + mangoCartons;
    const totalPieces = totalCartons * 24;

    const activeCashTxs = (state.manager_cash_transactions || []).filter(
      (t) =>
        !t.is_reversed &&
        t.transaction_type !== 'REVERSAL_ADJUSTMENT' &&
        matchMonth(t.transaction_date)
    );

    const purchasesTotal = activeCashTxs
      .filter((t) => t.transaction_type === 'MATERIAL_PURCHASE')
      .reduce((s, t) => s + t.amount, 0);
    const expensesTotal = activeCashTxs
      .filter((t) => t.transaction_type === 'FACTORY_EXPENSE')
      .reduce((s, t) => s + t.amount, 0);

    return {
      totalCartons,
      appleCartons,
      mangoCartons,
      totalPieces,
      purchasesTotal,
      expensesTotal,
      managerAccounts: state.manager_cash_accounts || [],
      bookers: state.bookers || [],
    };
  }, [state, selectedMonth, datePreset, productFilter, dateFrom, dateTo]);

  // ---------------------------------------------------------------------------
  // C. MANAGER-WISE REPORT DATA (Kamran Bhai & Imran Bhai)
  // ---------------------------------------------------------------------------
  const managerWiseReports = useMemo(() => {
    const managers = (state.users || []).filter(
      (u) =>
        u.role === 'PRODUCTION_MANAGER' &&
        (managerFilter === 'ALL' ||
          u.id === managerFilter ||
          u.full_name.toLowerCase().includes(managerFilter.toLowerCase()))
    );

    return managers.map((mgr) => {
      const account = (state.manager_cash_accounts || []).find((a) => a.manager_id === mgr.id);
      const cashTxs = (state.manager_cash_transactions || []).filter(
        (t) =>
          t.manager_id === mgr.id &&
          !t.is_reversed &&
          t.transaction_type !== 'REVERSAL_ADJUSTMENT' &&
          inDateRange(t.transaction_date)
      );

      const cashReceived = cashTxs
        .filter((t) => t.transaction_type === 'CASH_ISSUED_BY_OWNER')
        .reduce((s, t) => s + t.amount, 0);
      const purchases = cashTxs
        .filter((t) => t.transaction_type === 'MATERIAL_PURCHASE')
        .reduce((s, t) => s + t.amount, 0);
      const expenses = cashTxs
        .filter((t) => t.transaction_type === 'FACTORY_EXPENSE')
        .reduce((s, t) => s + t.amount, 0);

      const batches = (state.production_batches || []).filter(
        (b) =>
          !b.is_reversed &&
          b.status !== 'REVERSED' &&
          (b.status === 'CONFIRMED' || b.status === 'APPROVED' || b.status === 'Completed') &&
          (b.created_by === mgr.id ||
            b.submitted_by === mgr.id ||
            b.submitted_by_id === mgr.id ||
            (b.submitted_by_name || b.created_by_name || '')
              .toLowerCase()
              .includes(mgr.full_name.toLowerCase())) &&
          inDateRange(b.production_date) &&
          (productFilter === 'ALL' ||
            (b.juice_type || b.product_name || '')
              .toLowerCase()
              .includes(productFilter.split(' ')[0].toLowerCase()))
      );

      const appleCartons = batches
        .filter((b) => (b.juice_type || b.product_name || '').toLowerCase().includes('apple'))
        .reduce((s, b) => s + b.actual_cartons, 0);
      const mangoCartons = batches
        .filter((b) => (b.juice_type || b.product_name || '').toLowerCase().includes('mango'))
        .reduce((s, b) => s + b.actual_cartons, 0);

      const consumptionMap = new Map<
        string,
        { material_name: string; quantity: number; unit: string }
      >();
      for (const b of batches) {
        for (const u of b.material_usage) {
          if (materialFilter !== 'ALL' && u.raw_material_id !== materialFilter) continue;
          const prev = consumptionMap.get(u.raw_material_id);
          if (prev) {
            prev.quantity = Number((prev.quantity + u.actual_quantity).toFixed(4));
          } else {
            consumptionMap.set(u.raw_material_id, {
              material_name: u.raw_material_name,
              quantity: u.actual_quantity,
              unit: String(u.unit),
            });
          }
        }
      }

      const transactionsByDate = [
        ...cashTxs.map((t) => ({
          date: t.transaction_date,
          reference: t.reference_number,
          type: t.transaction_type,
          description: t.description,
          amount: `Rs. ${t.amount.toLocaleString()}`,
        })),
        ...batches.map((b) => ({
          date: b.production_date,
          reference: b.batch_number,
          type: 'PRODUCTION_CONFIRMED',
          description: `${b.actual_cartons} Cartons (${(b.actual_cartons * 24).toLocaleString()} Pieces) ${
            b.juice_type || b.product_name
          }`,
          amount: `${b.actual_cartons} Cartons`,
        })),
      ].sort((a, b) => (a.date < b.date ? 1 : -1));

      return {
        manager: mgr,
        totalCashReceived: cashReceived,
        purchasesTotal: purchases,
        expensesTotal: expenses,
        currentBalance: account?.available_balance ?? 0,
        productionEntriesCount: batches.length,
        appleCartons,
        mangoCartons,
        totalCartons: appleCartons + mangoCartons,
        totalPieces: (appleCartons + mangoCartons) * 24,
        materialConsumption: Array.from(consumptionMap.values()),
        transactionsByDate,
      };
    });
  }, [state, managerFilter, productFilter, materialFilter, dateFrom, dateTo, selectedDate, selectedMonth, reportCategory, datePreset]);

  // ---------------------------------------------------------------------------
  // D. INVENTORY REPORT DATA
  // ---------------------------------------------------------------------------
  const inventoryRows = useMemo(() => {
    return (state.raw_materials || [])
      .filter((rm) => materialFilter === 'ALL' || rm.id === materialFilter)
      .map((rm) => ({
        code: rm.code,
        material_name: rm.name,
        category: rm.category,
        opening_stock: rm.opening_stock ?? 0,
        total_purchases: rm.stock_received ?? 0,
        total_consumption: rm.stock_consumed ?? 0,
        adjustments: rm.stock_adjusted ?? 0,
        current_available_stock: rm.current_stock ?? 0,
        minimum_stock_level: rm.minimum_stock_level ?? 0,
        unit: String(rm.unit),
      }));
  }, [state.raw_materials, materialFilter]);

  // ---------------------------------------------------------------------------
  // E. BOOKER REPORT DATA
  // ---------------------------------------------------------------------------
  const bookerRows = useMemo(() => {
    const activeTxs = (state.booker_transactions || []).filter(
      (t) =>
        !t.is_reversed &&
        t.transaction_type !== 'REVERSAL_ENTRY' &&
        inDateRange(t.transaction_date) &&
        (productFilter === 'ALL' || !t.juice_type || t.juice_type === productFilter)
    );

    const filterByDate = datePreset !== 'THIS_MONTH' || Boolean(dateFrom || dateTo);

    return (state.bookers || [])
      .filter((b) => bookerFilter === 'ALL' || b.id === bookerFilter)
      .map((b) => {
        if (!filterByDate && productFilter === 'ALL') {
          return {
            booker_id: b.id,
            booker_name: b.booker_name,
            apple_cartons_given: b.apple_cartons_received,
            mango_cartons_given: b.mango_cartons_received,
            total_cartons: b.total_cartons_received,
            total_pieces: b.total_pieces_received,
            total_amount_payable: b.total_amount_payable,
            payments_received: b.total_payments_received,
            outstanding_balance: b.remaining_outstanding_amount,
          };
        }

        const bTxs = activeTxs.filter((t) => t.booker_id === b.id);
        const appleCtn = bTxs
          .filter(
            (t) => t.transaction_type === 'CARTONS_GIVEN' && t.juice_type === 'Apple Juice'
          )
          .reduce((s, t) => s + t.cartons_given, 0);
        const mangoCtn = bTxs
          .filter(
            (t) => t.transaction_type === 'CARTONS_GIVEN' && t.juice_type === 'Mango Juice'
          )
          .reduce((s, t) => s + t.cartons_given, 0);
        const totalCtn = appleCtn + mangoCtn;
        const payable = bTxs
          .filter((t) => t.transaction_type === 'CARTONS_GIVEN')
          .reduce((s, t) => s + t.amount_payable, 0);
        const received = bTxs
          .filter((t) => t.transaction_type === 'PAYMENT_RECEIVED')
          .reduce((s, t) => s + t.payment_received, 0);

        return {
          booker_id: b.id,
          booker_name: b.booker_name,
          apple_cartons_given: appleCtn,
          mango_cartons_given: mangoCtn,
          total_cartons: totalCtn,
          total_pieces: totalCtn * 24,
          total_amount_payable: payable,
          payments_received: received,
          outstanding_balance: b.remaining_outstanding_amount,
        };
      });
  }, [state.bookers, state.booker_transactions, bookerFilter, productFilter, datePreset, dateFrom, dateTo, selectedDate, selectedMonth, reportCategory]);

  // ---------------------------------------------------------------------------
  // CSV EXPORT IMPLEMENTATION (Section 4)
  // ---------------------------------------------------------------------------
  const handleExportCsv = () => {
    const generatedAt = new Date().toISOString();
    const lines: string[] = [
      `"FRUITY FUN JUICE FACTORY"`,
      `"Report Title","${reportCategory.replace(/_/g, ' ')}"`,
      `"Selected Period","${dateRangeLabel}"`,
      `"Generated Date","${generatedAt}"`,
      `"Generated By","${actor.full_name} (${actor.role})"`,
      '',
    ];

    if (reportCategory === 'DAILY_FACTORY_REPORT') {
      lines.push(
        `"Metric","Value"`,
        `"Cash Issued to Managers (Rs.)","${dailyReport.cashIssuedTotal}"`,
        `"Manager Purchases (Rs.)","${dailyReport.purchasesTotal}"`,
        `"General Factory Expenses (Rs.)","${dailyReport.expensesTotal}"`,
        `"Apple Juice Production (Cartons)","${dailyReport.appleCartons}"`,
        `"Apple Juice Production (Pieces)","${dailyReport.applePieces}"`,
        `"Mango Juice Production (Cartons)","${dailyReport.mangoCartons}"`,
        `"Mango Juice Production (Pieces)","${dailyReport.mangoPieces}"`,
        `"Combined Production (Cartons)","${dailyReport.totalCartons}"`,
        `"Combined Production (Pieces)","${dailyReport.totalPieces}"`,
        `"Booker Carton Allocations (Cartons)","${dailyReport.bookerAllocationsCartons}"`,
        `"Booker Allocations Amount Payable (Rs.)","${dailyReport.bookerAllocationsPayable}"`,
        `"Booker Payments Received (Rs.)","${dailyReport.bookerPaymentsTotal}"`,
        '',
        `"Material Consumption Batch","Product","Manager","Material","Entered Qty","Entered Unit","Base Deduction","Base Unit"`
      );
      for (const mc of dailyReport.materialConsumption) {
        lines.push(
          `"${mc.batch_number}","${mc.product}","${mc.manager}","${mc.material_name}","${mc.entered_qty}","${mc.entered_unit}","${mc.base_qty}","${mc.base_unit}"`
        );
      }
    } else if (reportCategory === 'MONTHLY_FACTORY_REPORT') {
      lines.push(
        `"Metric","Value"`,
        `"Total Production Cartons","${monthlyReport.totalCartons}"`,
        `"Apple Cartons Produced","${monthlyReport.appleCartons}"`,
        `"Mango Cartons Produced","${monthlyReport.mangoCartons}"`,
        `"Total Pieces Produced","${monthlyReport.totalPieces}"`,
        `"Raw Material Purchases (Rs.)","${monthlyReport.purchasesTotal}"`,
        `"Factory Expenses (Rs.)","${monthlyReport.expensesTotal}"`,
        '',
        `"Manager Name","Total Cash Received (Rs.)","Purchases (Rs.)","Expenses (Rs.)","Current Available Balance (Rs.)"`
      );
      for (const ma of monthlyReport.managerAccounts) {
        lines.push(
          `"${ma.manager_name}","${ma.total_cash_received}","${ma.total_spent_purchases}","${ma.total_spent_expenses}","${ma.available_balance}"`
        );
      }
      lines.push(
        '',
        `"Booker Name","Total Cartons Given","Total Amount Payable (Rs.)","Payments Received (Rs.)","Remaining Outstanding (Rs.)"`
      );
      for (const b of monthlyReport.bookers) {
        lines.push(
          `"${b.booker_name}","${b.total_cartons_received}","${b.total_amount_payable}","${b.total_payments_received}","${b.remaining_outstanding_amount}"`
        );
      }
    } else if (reportCategory === 'MANAGER_WISE_REPORT') {
      lines.push(
        `"Manager","Cash Received (Rs.)","Purchases (Rs.)","General Expenses (Rs.)","Current Available Cash (Rs.)","Production Entries","Apple Cartons","Mango Cartons","Total Cartons","Total Pieces"`
      );
      for (const mr of managerWiseReports) {
        lines.push(
          `"${mr.manager.full_name}","${mr.totalCashReceived}","${mr.purchasesTotal}","${mr.expensesTotal}","${mr.currentBalance}","${mr.productionEntriesCount}","${mr.appleCartons}","${mr.mangoCartons}","${mr.totalCartons}","${mr.totalPieces}"`
        );
      }
    } else if (reportCategory === 'INVENTORY_REPORT') {
      lines.push(
        `"Code","Material Name","Category","Opening Stock","Total Purchases","Total Consumption","Adjustments","Current Available Stock","Unit"`
      );
      for (const r of inventoryRows) {
        lines.push(
          `"${r.code}","${r.material_name}","${r.category}","${r.opening_stock}","${r.total_purchases}","${r.total_consumption}","${r.adjustments}","${r.current_available_stock}","${r.unit}"`
        );
      }
    } else if (reportCategory === 'BOOKER_REPORT') {
      lines.push(
        `"Booker Name","Apple Cartons Given","Mango Cartons Given","Total Cartons","Total Pieces","Total Amount Payable (Rs.)","Payments Received (Rs.)","Outstanding Balance (Rs.)"`
      );
      for (const b of bookerRows) {
        lines.push(
          `"${b.booker_name}","${b.apple_cartons_given}","${b.mango_cartons_given}","${b.total_cartons}","${b.total_pieces}","${b.total_amount_payable}","${b.payments_received}","${b.outstanding_balance}"`
        );
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FruityFun_${reportCategory}_${todayStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Top Report Selection & Filter Bar */}
      <div className="bg-white border border-slate-200 rounded p-4 space-y-3 no-print">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'DAILY_FACTORY_REPORT', label: 'A. Daily Factory Report' },
                { id: 'MONTHLY_FACTORY_REPORT', label: 'B. Monthly Factory Report' },
                { id: 'MANAGER_WISE_REPORT', label: 'C. Manager-Wise Report' },
                { id: 'INVENTORY_REPORT', label: 'D. Inventory Report' },
                { id: 'BOOKER_REPORT', label: 'E. Booker Report' },
              ] as Array<{ id: ReportCategory; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setReportCategory(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded transition ${
                  reportCategory === tab.id
                    ? 'bg-[#0B192C] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded"
            >
              <Printer className="w-3.5 h-3.5" /> Print Report
            </button>
          </div>
        </div>

        {/* Section 3: Report Filters */}
        <div className="flex flex-wrap items-end gap-3 text-xs">
          {/* Date Presets */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Quick Date Preset
            </label>
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'TODAY', label: 'Today' },
                  { id: 'YESTERDAY', label: 'Yesterday' },
                  { id: 'THIS_WEEK', label: 'This Week' },
                  { id: 'THIS_MONTH', label: 'This Month' },
                  { id: 'CUSTOM', label: 'Custom Range' },
                ] as Array<{ id: DatePreset; label: string }>
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyDatePreset(p.id)}
                  className={`px-2 py-1 text-[11px] font-semibold rounded border ${
                    datePreset === p.id
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {reportCategory === 'DAILY_FACTORY_REPORT' ? (
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Report Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setDatePreset('CUSTOM');
                }}
                className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded tabular-nums"
              />
            </div>
          ) : reportCategory === 'MONTHLY_FACTORY_REPORT' && datePreset === 'THIS_MONTH' ? (
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Selected Month
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded tabular-nums"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setDatePreset('CUSTOM');
                  }}
                  className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setDatePreset('CUSTOM');
                  }}
                  className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded tabular-nums"
                />
              </div>
            </div>
          )}

          {/* Manager Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Manager
            </label>
            <select
              value={managerFilter}
              onChange={(e) => setManagerFilter(e.target.value)}
              className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded font-medium"
            >
              <option value="ALL">All Managers (Kamran &amp; Imran)</option>
              <option value="Kamran Bhai">Kamran Bhai</option>
              <option value="Imran Bhai">Imran Bhai</option>
            </select>
          </div>

          {/* Product Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Product
            </label>
            <select
              value={productFilter}
              onChange={(e) =>
                setProductFilter(e.target.value as 'ALL' | 'Apple Juice' | 'Mango Juice')
              }
              className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded font-medium"
            >
              <option value="ALL">All Products (Apple &amp; Mango)</option>
              <option value="Apple Juice">Apple Juice</option>
              <option value="Mango Juice">Mango Juice</option>
            </select>
          </div>

          {/* Booker Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Booker
            </label>
            <select
              value={bookerFilter}
              onChange={(e) => setBookerFilter(e.target.value)}
              className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded font-medium"
            >
              <option value="ALL">All Bookers</option>
              {(state.bookers || []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.booker_name}
                </option>
              ))}
            </select>
          </div>

          {/* Material Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Material
            </label>
            <select
              value={materialFilter}
              onChange={(e) => setMaterialFilter(e.target.value)}
              className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded font-medium"
            >
              <option value="ALL">All 27 Raw Materials</option>
              {(state.raw_materials || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.unit})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Printable Official Report Document Container */}
      <div className="bg-white border border-slate-200 rounded p-5 space-y-5">
        {/* Official Report Header (Section 4) */}
        <div className="border-b border-slate-300 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="text-sm font-bold tracking-tight text-slate-900">
              FRUITY FUN JUICE FACTORY
            </div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mt-0.5">
              {reportCategory.replace(/_/g, ' ')}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Company Owner: <strong>Sikandar Raja</strong> | Packaging Standard:{' '}
              <strong>1 Carton = 24 Pieces</strong>
            </div>
          </div>
          <div className="text-xs text-right tabular-nums space-y-0.5">
            <div className="font-semibold text-slate-900">{dateRangeLabel}</div>
            <div className="text-slate-500">Generated Date: {todayStr}</div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* A. DAILY FACTORY REPORT */}
        {/* ================================================================= */}
        {reportCategory === 'DAILY_FACTORY_REPORT' && (
          <div className="space-y-4">
            {/* Summary Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs">
              <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">Cash Issued</div>
                <div className="font-bold tabular-nums text-slate-900 mt-0.5">
                  Rs. {dailyReport.cashIssuedTotal.toLocaleString()}
                </div>
              </div>
              <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">Manager Purchases</div>
                <div className="font-bold tabular-nums text-slate-900 mt-0.5">
                  Rs. {dailyReport.purchasesTotal.toLocaleString()}
                </div>
              </div>
              <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">General Expenses</div>
                <div className="font-bold tabular-nums text-slate-900 mt-0.5">
                  Rs. {dailyReport.expensesTotal.toLocaleString()}
                </div>
              </div>
              <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">Apple Production</div>
                <div className="font-bold tabular-nums text-emerald-700 mt-0.5">
                  {dailyReport.appleCartons.toLocaleString()} Ctn (
                  {dailyReport.applePieces.toLocaleString()} Pcs)
                </div>
              </div>
              <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">Mango Production</div>
                <div className="font-bold tabular-nums text-emerald-700 mt-0.5">
                  {dailyReport.mangoCartons.toLocaleString()} Ctn (
                  {dailyReport.mangoPieces.toLocaleString()} Pcs)
                </div>
              </div>
              <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">Booker Allocations</div>
                <div className="font-bold tabular-nums text-slate-900 mt-0.5">
                  {dailyReport.bookerAllocationsCartons.toLocaleString()} Ctn (Rs.{' '}
                  {dailyReport.bookerAllocationsPayable.toLocaleString()})
                </div>
              </div>
              <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">Booker Payments</div>
                <div className="font-bold tabular-nums text-emerald-700 mt-0.5">
                  Rs. {dailyReport.bookerPaymentsTotal.toLocaleString()}
                </div>
              </div>
            </div>

            {/* 1. Material Consumption Table */}
            <div className="border border-slate-200 rounded overflow-hidden">
              <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 text-xs font-bold text-slate-800 uppercase">
                Daily Material Consumption ({dailyReport.materialConsumption.length})
              </div>
              {dailyReport.materialConsumption.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  No material consumption recorded on {selectedDate}.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                      <th className="py-1.5 px-3">Batch Ref</th>
                      <th className="py-1.5 px-3">Product</th>
                      <th className="py-1.5 px-3">Manager</th>
                      <th className="py-1.5 px-3">Material</th>
                      <th className="py-1.5 px-3 text-right">Quantity Used</th>
                      <th className="py-1.5 px-3 text-right">Base Stock Deduction</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {dailyReport.materialConsumption.map((mc, i) => (
                      <tr key={i}>
                        <td className="py-1.5 px-3 font-semibold tabular-nums">
                          {mc.batch_number}
                        </td>
                        <td className="py-1.5 px-3">{mc.product}</td>
                        <td className="py-1.5 px-3">{mc.manager}</td>
                        <td className="py-1.5 px-3 font-semibold">{mc.material_name}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums">
                          {mc.entered_qty} {mc.entered_unit}
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums font-bold">
                          -{mc.base_qty} {mc.base_unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* 2. Raw Material Stock Changes */}
            <div className="border border-slate-200 rounded overflow-hidden">
              <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 text-xs font-bold text-slate-800 uppercase">
                Raw Material Stock Movements ({dailyReport.stockChanges.length})
              </div>
              {dailyReport.stockChanges.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  No stock movements recorded on {selectedDate}.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                      <th className="py-1.5 px-3">Ref</th>
                      <th className="py-1.5 px-3">Material</th>
                      <th className="py-1.5 px-3">Type</th>
                      <th className="py-1.5 px-3 text-right">Previous</th>
                      <th className="py-1.5 px-3 text-right">Added</th>
                      <th className="py-1.5 px-3 text-right">Deducted</th>
                      <th className="py-1.5 px-3 text-right">Updated</th>
                      <th className="py-1.5 px-3">Entered By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {dailyReport.stockChanges.map((sc) => (
                      <tr key={sc.id}>
                        <td className="py-1.5 px-3 tabular-nums font-semibold">
                          {sc.reference_number}
                        </td>
                        <td className="py-1.5 px-3 font-semibold">{sc.material_name}</td>
                        <td className="py-1.5 px-3">{sc.transaction_type}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums">
                          {sc.previous_stock ?? sc.opening_quantity} {sc.unit}
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-emerald-700">
                          +{sc.quantity_added ?? sc.stock_received} {sc.unit}
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-red-700">
                          -{sc.quantity_deducted ?? sc.quantity_consumed} {sc.unit}
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums font-bold">
                          {sc.updated_stock ?? sc.closing_quantity} {sc.unit}
                        </td>
                        <td className="py-1.5 px-3">{sc.entered_by_name || sc.entered_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* B. MONTHLY FACTORY REPORT */}
        {/* ================================================================= */}
        {reportCategory === 'MONTHLY_FACTORY_REPORT' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
              <div className="bg-slate-50 p-3 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">Total Production Cartons</div>
                <div className="text-sm font-bold tabular-nums text-slate-900 mt-0.5">
                  {monthlyReport.totalCartons.toLocaleString()} Cartons
                </div>
              </div>
              <div className="bg-slate-50 p-3 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">Apple Cartons Produced</div>
                <div className="text-sm font-bold tabular-nums text-slate-900 mt-0.5">
                  {monthlyReport.appleCartons.toLocaleString()} Cartons
                </div>
              </div>
              <div className="bg-slate-50 p-3 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">Mango Cartons Produced</div>
                <div className="text-sm font-bold tabular-nums text-slate-900 mt-0.5">
                  {monthlyReport.mangoCartons.toLocaleString()} Cartons
                </div>
              </div>
              <div className="bg-slate-50 p-3 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">Total Pieces Produced (×24)</div>
                <div className="text-sm font-bold tabular-nums text-emerald-700 mt-0.5">
                  {monthlyReport.totalPieces.toLocaleString()} Pieces
                </div>
              </div>
              <div className="bg-slate-50 p-3 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">Raw Material Purchases</div>
                <div className="text-sm font-bold tabular-nums text-slate-900 mt-0.5">
                  Rs. {monthlyReport.purchasesTotal.toLocaleString()}
                </div>
              </div>
              <div className="bg-slate-50 p-3 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">Factory Expenses</div>
                <div className="text-sm font-bold tabular-nums text-slate-900 mt-0.5">
                  Rs. {monthlyReport.expensesTotal.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Manager Cash Balances Table */}
            <div className="border border-slate-200 rounded overflow-hidden">
              <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 text-xs font-bold text-slate-800 uppercase">
                Manager Cash Balances
              </div>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2 px-3">Manager Name</th>
                    <th className="py-2 px-3 text-right">Total Cash Received</th>
                    <th className="py-2 px-3 text-right">Total Purchases</th>
                    <th className="py-2 px-3 text-right">Total General Expenses</th>
                    <th className="py-2 px-3 text-right">Current Available Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {monthlyReport.managerAccounts.map((ma) => (
                    <tr key={ma.manager_id}>
                      <td className="py-2 px-3 font-bold text-slate-900">{ma.manager_name}</td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        Rs. {ma.total_cash_received.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        Rs. {ma.total_spent_purchases.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        Rs. {ma.total_spent_expenses.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-emerald-700">
                        Rs. {ma.available_balance.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Booker Outstanding Balances Table */}
            <div className="border border-slate-200 rounded overflow-hidden">
              <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 text-xs font-bold text-slate-800 uppercase">
                Booker Outstanding Balances ({monthlyReport.bookers.length})
              </div>
              {monthlyReport.bookers.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  No booker accounts recorded.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                      <th className="py-2 px-3">Booker Name</th>
                      <th className="py-2 px-3 text-right">Total Cartons Given</th>
                      <th className="py-2 px-3 text-right">Total Amount Payable</th>
                      <th className="py-2 px-3 text-right">Total Payments Received</th>
                      <th className="py-2 px-3 text-right">Remaining Outstanding</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {monthlyReport.bookers.map((b) => (
                      <tr key={b.id}>
                        <td className="py-2 px-3 font-bold text-slate-900">{b.booker_name}</td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {b.total_cartons_received.toLocaleString()} Ctn
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          Rs. {b.total_amount_payable.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-emerald-700">
                          Rs. {b.total_payments_received.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums font-bold text-amber-800">
                          Rs. {b.remaining_outstanding_amount.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* C. MANAGER-WISE REPORT (Kamran Bhai & Imran Bhai) */}
        {/* ================================================================= */}
        {reportCategory === 'MANAGER_WISE_REPORT' && (
          <div className="space-y-5">
            {managerWiseReports.map((mr) => (
              <div
                key={mr.manager.id}
                className="border border-slate-300 rounded overflow-hidden space-y-3 p-4"
              >
                <div className="border-b border-slate-200 pb-2 flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Manager Report: {mr.manager.full_name} ({mr.manager.email})
                  </div>
                  <span className="text-xs font-bold text-emerald-800 tabular-nums">
                    Current Available Cash: Rs. {mr.currentBalance.toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-xs">
                  <div className="bg-slate-50 p-2 rounded border border-slate-200">
                    <div className="text-[10px] text-slate-500">Total Cash Received</div>
                    <div className="font-bold tabular-nums text-slate-900">
                      Rs. {mr.totalCashReceived.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-2 rounded border border-slate-200">
                    <div className="text-[10px] text-slate-500">Purchases</div>
                    <div className="font-bold tabular-nums text-slate-900">
                      Rs. {mr.purchasesTotal.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-2 rounded border border-slate-200">
                    <div className="text-[10px] text-slate-500">General Expenses</div>
                    <div className="font-bold tabular-nums text-slate-900">
                      Rs. {mr.expensesTotal.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-2 rounded border border-slate-200">
                    <div className="text-[10px] text-slate-500">Current Balance</div>
                    <div className="font-bold tabular-nums text-emerald-700">
                      Rs. {mr.currentBalance.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-2 rounded border border-slate-200">
                    <div className="text-[10px] text-slate-500">Production Entries</div>
                    <div className="font-bold tabular-nums text-slate-900">
                      {mr.productionEntriesCount} Batches
                    </div>
                  </div>
                  <div className="bg-slate-50 p-2 rounded border border-slate-200">
                    <div className="text-[10px] text-slate-500">Apple Cartons</div>
                    <div className="font-bold tabular-nums text-slate-900">
                      {mr.appleCartons.toLocaleString()} Ctn
                    </div>
                  </div>
                  <div className="bg-slate-50 p-2 rounded border border-slate-200">
                    <div className="text-[10px] text-slate-500">Mango Cartons</div>
                    <div className="font-bold tabular-nums text-slate-900">
                      {mr.mangoCartons.toLocaleString()} Ctn
                    </div>
                  </div>
                </div>

                {/* Material Consumption Breakdown */}
                <div className="border border-slate-200 rounded overflow-hidden">
                  <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase">
                    Material Consumption by {mr.manager.full_name}
                  </div>
                  {mr.materialConsumption.length === 0 ? (
                    <div className="p-3 text-xs text-slate-500">
                      No material consumption in selected period.
                    </div>
                  ) : (
                    <div className="p-2.5 flex flex-wrap gap-2 text-xs">
                      {mr.materialConsumption.map((mc, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded font-medium tabular-nums"
                        >
                          <strong>{mc.material_name}:</strong> {mc.quantity} {mc.unit}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Transactions by Date */}
                <div className="border border-slate-200 rounded overflow-hidden">
                  <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase">
                    Transactions by Date ({mr.transactionsByDate.length})
                  </div>
                  {mr.transactionsByDate.length === 0 ? (
                    <div className="p-3 text-xs text-slate-500">
                      No transactions recorded for {mr.manager.full_name} in selected period.
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                          <th className="py-1.5 px-3">Date</th>
                          <th className="py-1.5 px-3">Reference</th>
                          <th className="py-1.5 px-3">Type</th>
                          <th className="py-1.5 px-3">Details</th>
                          <th className="py-1.5 px-3 text-right">Amount / Output</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {mr.transactionsByDate.map((t, i) => (
                          <tr key={i}>
                            <td className="py-1.5 px-3 tabular-nums">{t.date}</td>
                            <td className="py-1.5 px-3 tabular-nums font-semibold">
                              {t.reference}
                            </td>
                            <td className="py-1.5 px-3">{t.type}</td>
                            <td className="py-1.5 px-3">{t.description}</td>
                            <td className="py-1.5 px-3 text-right tabular-nums font-bold">
                              {t.amount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ================================================================= */}
        {/* D. INVENTORY REPORT */}
        {/* ================================================================= */}
        {reportCategory === 'INVENTORY_REPORT' && (
          <div className="overflow-x-auto border border-slate-200 rounded">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2 px-3">Code</th>
                  <th className="py-2 px-3">Material Name</th>
                  <th className="py-2 px-3 text-right">Opening Stock</th>
                  <th className="py-2 px-3 text-right">Total Purchases</th>
                  <th className="py-2 px-3 text-right">Total Consumption</th>
                  <th className="py-2 px-3 text-right">Adjustments</th>
                  <th className="py-2 px-3 text-right">Current Available Stock</th>
                  <th className="py-2 px-3">Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {inventoryRows.map((row) => (
                  <tr key={row.code} className="hover:bg-slate-50">
                    <td className="py-2 px-3 tabular-nums text-slate-500">{row.code}</td>
                    <td className="py-2 px-3 font-bold text-slate-900">{row.material_name}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{row.opening_stock}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-emerald-700 font-medium">
                      +{row.total_purchases}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-700">
                      -{row.total_consumption}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-700">
                      {row.adjustments > 0 ? `+${row.adjustments}` : row.adjustments}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums font-bold text-slate-900 bg-slate-50/60">
                      {row.current_available_stock}
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-700">{row.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ================================================================= */}
        {/* E. BOOKER REPORT */}
        {/* ================================================================= */}
        {reportCategory === 'BOOKER_REPORT' && (
          <div className="overflow-x-auto border border-slate-200 rounded">
            {bookerRows.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No booker records match the selected filters.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2 px-3">Booker Name</th>
                    <th className="py-2 px-3 text-right">Apple Cartons Given</th>
                    <th className="py-2 px-3 text-right">Mango Cartons Given</th>
                    <th className="py-2 px-3 text-right">Total Cartons (Pieces)</th>
                    <th className="py-2 px-3 text-right">Total Amount Payable</th>
                    <th className="py-2 px-3 text-right">Payments Received</th>
                    <th className="py-2 px-3 text-right">Outstanding Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {bookerRows.map((b) => (
                    <tr key={b.booker_id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-bold text-slate-900">{b.booker_name}</td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {b.apple_cartons_given.toLocaleString()} Ctn
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {b.mango_cartons_given.toLocaleString()} Ctn
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-slate-900">
                        {b.total_cartons.toLocaleString()} Ctn ({b.total_pieces.toLocaleString()}{' '}
                        Pcs)
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold text-slate-900">
                        Rs. {b.total_amount_payable.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold text-emerald-700">
                        Rs. {b.payments_received.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-amber-800">
                        Rs. {b.outstanding_balance.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
