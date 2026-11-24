'use client';

import React, { useState, useMemo } from 'react';
import type { ErpDatabaseState } from '@/lib/db/store';
import type {
  UserProfile,
  BookerAccount,
  BookerTransaction,
  JuiceType,
} from '@juice-erp/shared-types';
import {
  Plus,
  Printer,
  Search,
  AlertTriangle,
  RotateCcw,
  Eye,
  CheckCircle2,
} from 'lucide-react';

const PIECES_PER_CARTON = 24;

type BookerSubView =
  | 'ALL'
  | 'BOOKER_LIST'
  | 'GIVE_CARTONS'
  | 'RECEIVE_PAYMENT'
  | 'BOOKER_LEDGER'
  | 'OUTSTANDING_PAYMENTS';

interface Props {
  state: ErpDatabaseState;
  actor: UserProfile;
  busy: boolean;
  runAction: (action: string, payload: Record<string, any>, msg?: string) => Promise<any>;
  initialView?: BookerSubView;
}

export function BookerManagementModule({
  state,
  actor,
  busy,
  runAction,
  initialView = 'ALL',
}: Props) {
  const isOwner = actor.role === 'OWNER';
  const today = new Date().toISOString().split('T')[0];

  const [subView, setSubView] = useState<BookerSubView>(initialView);
  const [selectedBookerIdForLedger, setSelectedBookerIdForLedger] = useState<string>('ALL');

  // Create Booker Form State
  const [showAddBooker, setShowAddBooker] = useState<boolean>(false);
  const [newBookerName, setNewBookerName] = useState<string>('');
  const [newBookerContact, setNewBookerContact] = useState<string>('');
  const [newBookerDate, setNewBookerDate] = useState<string>(today);
  const [bookerFormError, setBookerFormError] = useState<string | null>(null);

  // Give Cartons to Booker Form State
  const [giveBookerId, setGiveBookerId] = useState<string>(() => state.bookers[0]?.id || '__NEW__');
  const [giveNewBookerName, setGiveNewBookerName] = useState<string>('');
  const [giveNewBookerContact, setGiveNewBookerContact] = useState<string>('');
  const [giveJuiceType, setGiveJuiceType] = useState<JuiceType>('Apple Juice');
  const [giveCartons, setGiveCartons] = useState<string>('');
  const [giveAmountPayable, setGiveAmountPayable] = useState<string>('');
  const [giveDate, setGiveDate] = useState<string>(today);
  const [giveNotes, setGiveNotes] = useState<string>('');
  const [giveIdempKey, setGiveIdempKey] = useState<string>(
    () => `bkr-give-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  );
  const [giveError, setGiveError] = useState<string | null>(null);

  // Receive Payment Form State
  const [payBookerId, setPayBookerId] = useState<string>(() => state.bookers[0]?.id || '');
  const [payAmount, setPayAmount] = useState<string>('');
  const [payDate, setPayDate] = useState<string>(today);
  const [payNotes, setPayNotes] = useState<string>('');
  const [payIdempKey, setPayIdempKey] = useState<string>(
    () => `bkr-pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  );
  const [payError, setPayError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFromFilter, setDateFromFilter] = useState<string>('');
  const [dateToFilter, setDateToFilter] = useState<string>('');

  // Reversal / Correction Modal State
  const [correctingTx, setCorrectingTx] = useState<BookerTransaction | null>(null);
  const [corrMode, setCorrMode] = useState<'REVERSE_ONLY' | 'REPLACE'>('REPLACE');
  const [corrReason, setCorrReason] = useState<string>('');
  const [corrJuiceType, setCorrJuiceType] = useState<JuiceType>('Apple Juice');
  const [corrCartons, setCorrCartons] = useState<string>('');
  const [corrAmountPayable, setCorrAmountPayable] = useState<string>('');
  const [corrPaymentAmount, setCorrPaymentAmount] = useState<string>('');
  const [corrDate, setCorrDate] = useState<string>(today);
  const [corrNotes, setCorrNotes] = useState<string>('');
  const [corrError, setCorrError] = useState<string | null>(null);

  const bookers = state.bookers || [];
  const bookerTransactions = state.booker_transactions || [];

  // Overall Booker Overview Metrics
  const overviewMetrics = useMemo(() => {
    const activeBookers = bookers.filter((b) => b.is_active).length;
    const totalCartons = bookers.reduce((sum, b) => sum + b.total_cartons_received, 0);
    const appleCartons = bookers.reduce((sum, b) => sum + b.apple_cartons_received, 0);
    const mangoCartons = bookers.reduce((sum, b) => sum + b.mango_cartons_received, 0);
    const totalPayable = bookers.reduce((sum, b) => sum + b.total_amount_payable, 0);
    const totalReceived = bookers.reduce((sum, b) => sum + b.total_payments_received, 0);
    const totalOutstanding = bookers.reduce((sum, b) => sum + b.remaining_outstanding_amount, 0);
    return {
      activeBookers,
      totalCartons,
      appleCartons,
      mangoCartons,
      totalPayable,
      totalReceived,
      totalOutstanding,
    };
  }, [bookers]);

  // Available Finished Goods for selected product in "Give Cartons to Booker"
  const selectedFg = useMemo(() => {
    return state.finished_goods.find(
      (f) => f.product_name.toLowerCase() === giveJuiceType.toLowerCase()
    );
  }, [state.finished_goods, giveJuiceType]);

  const availFgCartons = selectedFg?.available_cartons ?? 0;
  const availFgPieces = selectedFg?.available_bottles ?? availFgCartons * PIECES_PER_CARTON;
  const enteredGiveCartons = Number(giveCartons);
  const validGiveCartons =
    Number.isFinite(enteredGiveCartons) &&
    enteredGiveCartons > 0 &&
    Number.isInteger(enteredGiveCartons)
      ? enteredGiveCartons
      : 0;
  const calculatedGivePieces = validGiveCartons * PIECES_PER_CARTON;
  const fgShortageCartons =
    validGiveCartons > availFgCartons ? validGiveCartons - availFgCartons : 0;

  // Selected Booker for Receive Payment
  const selectedPaymentBooker = useMemo(() => {
    return bookers.find((b) => b.id === payBookerId) || null;
  }, [bookers, payBookerId]);

  // Selected Booker for Individual Booker Ledger
  const inspectedBooker = useMemo(() => {
    if (selectedBookerIdForLedger === 'ALL') return null;
    return bookers.find((b) => b.id === selectedBookerIdForLedger) || null;
  }, [bookers, selectedBookerIdForLedger]);

  const filteredBookers = useMemo(() => {
    return bookers.filter((b) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          b.booker_name.toLowerCase().includes(q) ||
          (b.contact_number || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [bookers, searchQuery]);

  const outstandingBookers = useMemo(() => {
    return filteredBookers.filter((b) => b.remaining_outstanding_amount > 0);
  }, [filteredBookers]);

  const filteredTransactions = useMemo(() => {
    return bookerTransactions.filter((tx) => {
      if (selectedBookerIdForLedger !== 'ALL' && tx.booker_id !== selectedBookerIdForLedger) {
        return false;
      }
      if (dateFromFilter && tx.transaction_date < dateFromFilter) return false;
      if (dateToFilter && tx.transaction_date > dateToFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          tx.booker_name.toLowerCase().includes(q) ||
          tx.reference_number.toLowerCase().includes(q) ||
          (tx.juice_type || '').toLowerCase().includes(q) ||
          (tx.notes || '').toLowerCase().includes(q) ||
          tx.entered_by_name.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [
    bookerTransactions,
    selectedBookerIdForLedger,
    dateFromFilter,
    dateToFilter,
    searchQuery,
  ]);

  const handleCreateBooker = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookerFormError(null);
    if (!newBookerName.trim()) {
      setBookerFormError('Booker name is required.');
      return;
    }
    const res = await runAction(
      'CREATE_OR_UPDATE_BOOKER',
      {
        booker_name: newBookerName.trim(),
        contact_number: newBookerContact.trim(),
        created_date: newBookerDate,
      },
      `Booker account created for "${newBookerName.trim()}".`
    );
    if (res?.ok) {
      setNewBookerName('');
      setNewBookerContact('');
      setShowAddBooker(false);
      if (res.data?.id) {
        setGiveBookerId(res.data.id);
        setPayBookerId(res.data.id);
      }
    } else if (res?.error) {
      setBookerFormError(res.error);
    }
  };

  const handleGiveCartonsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGiveError(null);

    if (giveBookerId === '__NEW__' && !giveNewBookerName.trim()) {
      setGiveError('Please enter a booker name or select an existing booker.');
      return;
    }
    if (validGiveCartons <= 0) {
      setGiveError('Number of cartons given must be a whole number greater than zero.');
      return;
    }
    const payableNum = Number(giveAmountPayable);
    if (!Number.isFinite(payableNum) || payableNum <= 0) {
      setGiveError('Please enter a valid total amount payable greater than zero.');
      return;
    }
    if (fgShortageCartons > 0) {
      setGiveError(
        `Insufficient ${giveJuiceType} Finished Goods Stock. Available: ${availFgCartons} Cartons (${availFgPieces.toLocaleString()} Pieces). Required: ${validGiveCartons} Cartons (${calculatedGivePieces.toLocaleString()} Pieces). Shortage: ${fgShortageCartons} Cartons (${(fgShortageCartons * PIECES_PER_CARTON).toLocaleString()} Pieces).`
      );
      return;
    }

    const res = await runAction(
      'GIVE_CARTONS_TO_BOOKER',
      {
        booker_id: giveBookerId === '__NEW__' ? undefined : giveBookerId,
        booker_name: giveBookerId === '__NEW__' ? giveNewBookerName.trim() : undefined,
        contact_number: giveBookerId === '__NEW__' ? giveNewBookerContact.trim() : undefined,
        juice_type: giveJuiceType,
        cartons_given: validGiveCartons,
        amount_payable: payableNum,
        transaction_date: giveDate,
        notes: giveNotes.trim(),
        idempotency_key: giveIdempKey,
      },
      `Gave ${validGiveCartons} cartons (${calculatedGivePieces.toLocaleString()} pieces) of ${giveJuiceType} (Payable: Rs. ${payableNum.toLocaleString()}).`
    );

    if (res?.ok) {
      setGiveCartons('');
      setGiveAmountPayable('');
      setGiveNotes('');
      setGiveNewBookerName('');
      setGiveNewBookerContact('');
      setGiveIdempKey(`bkr-give-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
      if (res.data?.booker?.id) {
        setGiveBookerId(res.data.booker.id);
        setPayBookerId(res.data.booker.id);
      }
    } else if (res?.error) {
      setGiveError(res.error);
    }
  };

  const handleReceivePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayError(null);

    if (!payBookerId) {
      setPayError('Please select a booker.');
      return;
    }
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setPayError('Payment amount must be greater than zero.');
      return;
    }
    if (selectedPaymentBooker && amt > selectedPaymentBooker.remaining_outstanding_amount) {
      setPayError(
        `Payment amount Rs. ${amt.toLocaleString()} exceeds ${selectedPaymentBooker.booker_name}'s remaining outstanding balance of Rs. ${selectedPaymentBooker.remaining_outstanding_amount.toLocaleString()}.`
      );
      return;
    }

    const res = await runAction(
      'RECEIVE_BOOKER_PAYMENT',
      {
        booker_id: payBookerId,
        payment_amount: amt,
        payment_date: payDate,
        notes: payNotes.trim(),
        idempotency_key: payIdempKey,
      },
      `Payment of Rs. ${amt.toLocaleString()} received and booker balance updated.`
    );

    if (res?.ok) {
      setPayAmount('');
      setPayNotes('');
      setPayIdempKey(`bkr-pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    } else if (res?.error) {
      setPayError(res.error);
    }
  };

  const openCorrectionModal = (tx: BookerTransaction) => {
    setCorrectingTx(tx);
    setCorrMode('REPLACE');
    setCorrReason('');
    setCorrError(null);
    setCorrJuiceType(tx.juice_type === 'Mango Juice' ? 'Mango Juice' : 'Apple Juice');
    setCorrCartons(String(tx.cartons_given || ''));
    setCorrAmountPayable(String(tx.amount_payable || ''));
    setCorrPaymentAmount(String(tx.payment_received || ''));
    setCorrDate(tx.transaction_date);
    setCorrNotes(tx.notes || '');
  };

  const handleConfirmReversalOrCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingTx) return;
    setCorrError(null);

    if (!corrReason.trim()) {
      setCorrError('Please enter a mandatory reason for this reversal or correction.');
      return;
    }

    let correctedAllocation: any = undefined;
    let correctedPayment: any = undefined;

    if (corrMode === 'REPLACE') {
      if (correctingTx.transaction_type === 'CARTONS_GIVEN') {
        const ctn = Number(corrCartons);
        const pay = Number(corrAmountPayable);
        if (!Number.isFinite(ctn) || ctn <= 0 || !Number.isInteger(ctn)) {
          setCorrError('Corrected cartons must be a whole number greater than zero.');
          return;
        }
        if (!Number.isFinite(pay) || pay <= 0) {
          setCorrError('Corrected amount payable must be greater than zero.');
          return;
        }
        correctedAllocation = {
          juice_type: corrJuiceType,
          cartons_given: ctn,
          amount_payable: pay,
          transaction_date: corrDate,
          notes: corrNotes.trim(),
        };
      } else if (correctingTx.transaction_type === 'PAYMENT_RECEIVED') {
        const pAmt = Number(corrPaymentAmount);
        if (!Number.isFinite(pAmt) || pAmt <= 0) {
          setCorrError('Corrected payment amount must be greater than zero.');
          return;
        }
        correctedPayment = {
          payment_amount: pAmt,
          payment_date: corrDate,
          notes: corrNotes.trim(),
        };
      }
    }

    const res = await runAction(
      'REVERSE_OR_CORRECT_BOOKER_TRANSACTION',
      {
        transaction_id: correctingTx.id,
        reason: corrReason.trim(),
        corrected_allocation: correctedAllocation,
        corrected_payment: correctedPayment,
      },
      corrMode === 'REPLACE'
        ? `Transaction ${correctingTx.reference_number} reversed and replaced with corrected entry.`
        : `Transaction ${correctingTx.reference_number} reversed.`
    );

    if (res?.ok) {
      setCorrectingTx(null);
    } else if (res?.error) {
      setCorrError(res.error);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Booker Overview Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 bg-white border border-slate-200 rounded divide-x divide-y sm:divide-y-0 divide-slate-200">
        <div className="p-3">
          <div className="text-[11px] font-medium text-slate-500">Total Active Bookers</div>
          <div className="text-sm font-bold tabular-nums text-slate-900 mt-1">
            {overviewMetrics.activeBookers} Bookers
          </div>
        </div>
        <div className="p-3">
          <div className="text-[11px] font-medium text-slate-500">Total Cartons Given</div>
          <div className="text-sm font-bold tabular-nums text-slate-900 mt-1">
            {overviewMetrics.totalCartons.toLocaleString()} Ctn (
            {(overviewMetrics.totalCartons * PIECES_PER_CARTON).toLocaleString()} Pcs)
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
            Apple: {overviewMetrics.appleCartons} | Mango: {overviewMetrics.mangoCartons}
          </div>
        </div>
        <div className="p-3">
          <div className="text-[11px] font-medium text-slate-500">Total Amount Payable</div>
          <div className="text-sm font-bold tabular-nums text-slate-900 mt-1">
            Rs. {overviewMetrics.totalPayable.toLocaleString()}
          </div>
        </div>
        <div className="p-3">
          <div className="text-[11px] font-medium text-slate-500">Total Payments Received</div>
          <div className="text-sm font-bold tabular-nums text-emerald-700 mt-1">
            Rs. {overviewMetrics.totalReceived.toLocaleString()}
          </div>
        </div>
        <div className="p-3">
          <div className="text-[11px] font-medium text-slate-500">Total Outstanding Amount</div>
          <div className="text-sm font-bold tabular-nums text-amber-800 mt-1">
            Rs. {overviewMetrics.totalOutstanding.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Section Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded p-2 no-print">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'ALL', label: 'All Booker Sections' },
              { id: 'BOOKER_LIST', label: '1. Booker List' },
              { id: 'GIVE_CARTONS', label: '2. Give Cartons to Booker' },
              { id: 'RECEIVE_PAYMENT', label: '3. Receive Payment' },
              { id: 'BOOKER_LEDGER', label: '4. Booker Account Ledger' },
              {
                id: 'OUTSTANDING_PAYMENTS',
                label: `5. Outstanding Payments (${outstandingBookers.length})`,
              },
            ] as Array<{ id: BookerSubView; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubView(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition ${
                subView === tab.id
                  ? 'bg-[#0B192C] text-white'
                  : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddBooker(!showAddBooker)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded"
          >
            <Plus className="w-3.5 h-3.5" /> Add New Booker
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>

      {/* Quick Create Booker Form */}
      {showAddBooker && (
        <form
          onSubmit={handleCreateBooker}
          className="bg-white border border-slate-200 rounded p-4 space-y-3 no-print"
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Create Booker Account (No Separate Login Required)
            </h3>
            <button
              type="button"
              onClick={() => setShowAddBooker(false)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Cancel
            </button>
          </div>
          {bookerFormError && (
            <div className="p-2.5 bg-red-50 border border-red-300 rounded text-xs text-red-900 font-medium">
              {bookerFormError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Booker Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Ahmed"
                value={newBookerName}
                onChange={(e) => setNewBookerName(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded font-semibold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Contact Number (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. 0300-1234567"
                value={newBookerContact}
                onChange={(e) => setNewBookerContact(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Account Creation Date
              </label>
              <input
                type="date"
                value={newBookerDate}
                onChange={(e) => setNewBookerDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={busy}
                className="w-full py-1.5 px-3 bg-[#0B192C] hover:bg-slate-800 text-white text-xs font-semibold rounded"
              >
                Create Booker Account
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Forms Grid: 2. Give Cartons to Booker & 3. Receive Payment */}
      {(subView === 'ALL' || subView === 'GIVE_CARTONS' || subView === 'RECEIVE_PAYMENT') && (
        <div
          className={`grid grid-cols-1 ${
            subView === 'ALL' ? 'lg:grid-cols-2' : ''
          } gap-4 no-print`}
        >
          {/* Form A: Give Cartons to Booker */}
          {(subView === 'ALL' || subView === 'GIVE_CARTONS') && (
            <form
              onSubmit={handleGiveCartonsSubmit}
              className="bg-white border border-slate-200 rounded p-4 space-y-3"
            >
              <div className="border-b border-slate-200 pb-2 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Give Cartons to Booker
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Deducts finished goods cartons (1 carton = 24 pieces) and increases booker payable balance
                  </p>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-300 rounded">
                  1 Carton = 24 Pieces
                </span>
              </div>

              {giveError && (
                <div className="p-2.5 bg-red-50 border border-red-300 rounded text-xs text-red-900 font-medium whitespace-pre-line flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                  <span>{giveError}</span>
                </div>
              )}

              {fgShortageCartons > 0 && (
                <div className="p-2.5 bg-red-50 border border-red-300 rounded text-xs text-red-900 space-y-0.5">
                  <div className="font-bold">
                    Insufficient {giveJuiceType} Finished Goods Stock.
                  </div>
                  <div>
                    Available: <strong>{availFgCartons} Cartons</strong> (
                    {availFgPieces.toLocaleString()} Pieces).
                  </div>
                  <div>
                    Required: <strong>{validGiveCartons} Cartons</strong> (
                    {calculatedGivePieces.toLocaleString()} Pieces).
                  </div>
                  <div>
                    Shortage:{' '}
                    <strong className="text-red-700">
                      {fgShortageCartons} Cartons (
                      {(fgShortageCartons * PIECES_PER_CARTON).toLocaleString()} Pieces)
                    </strong>
                    .
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Select Existing Booker (or Create New) *
                  </label>
                  <select
                    value={giveBookerId}
                    onChange={(e) => {
                      setGiveError(null);
                      setGiveBookerId(e.target.value);
                    }}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded font-semibold"
                  >
                    {bookers.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.booker_name} (Outstanding: Rs.{' '}
                        {b.remaining_outstanding_amount.toLocaleString()})
                      </option>
                    ))}
                    <option value="__NEW__">+ Create a New Booker Account</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Juice Type *
                  </label>
                  <select
                    value={giveJuiceType}
                    onChange={(e) => {
                      setGiveError(null);
                      setGiveJuiceType(e.target.value as JuiceType);
                    }}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded font-semibold"
                  >
                    <option value="Apple Juice">Apple Juice</option>
                    <option value="Mango Juice">Mango Juice</option>
                  </select>
                </div>
              </div>

              {giveBookerId === '__NEW__' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-2.5 rounded border border-slate-200">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      New Booker Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Enter booker name (e.g. Ahmed)"
                      value={giveNewBookerName}
                      onChange={(e) => setGiveNewBookerName(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Contact Number (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="Optional phone"
                      value={giveNewBookerContact}
                      onChange={(e) => setGiveNewBookerContact(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                    />
                  </div>
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded p-2.5 text-xs flex items-center justify-between">
                <span className="text-slate-600">
                  Available <strong>{giveJuiceType}</strong> Stock:
                </span>
                <span className="font-bold tabular-nums text-slate-900">
                  {availFgCartons.toLocaleString()} Cartons ({availFgPieces.toLocaleString()} Pieces)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Number of Cartons Given *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    placeholder="e.g. 100"
                    value={giveCartons}
                    onChange={(e) => {
                      setGiveError(null);
                      setGiveCartons(e.target.value);
                    }}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums font-bold"
                  />
                  {validGiveCartons > 0 && (
                    <div className="text-[10px] font-semibold text-emerald-700 mt-0.5 tabular-nums">
                      = {calculatedGivePieces.toLocaleString()} Pieces (×24)
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Amount Payable (Rs.) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    placeholder="e.g. 50000"
                    value={giveAmountPayable}
                    onChange={(e) => {
                      setGiveError(null);
                      setGiveAmountPayable(e.target.value);
                    }}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={giveDate}
                    onChange={(e) => setGiveDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Optional notes..."
                  value={giveNotes}
                  onChange={(e) => setGiveNotes(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                />
                <button
                  type="submit"
                  disabled={busy || fgShortageCartons > 0}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-[#0B192C] hover:bg-slate-800 rounded disabled:opacity-50 shrink-0"
                >
                  {busy ? 'Saving...' : 'Confirm Cartons Given'}
                </button>
              </div>
            </form>
          )}

          {/* Form B: Receive Payment from Booker */}
          {(subView === 'ALL' || subView === 'RECEIVE_PAYMENT') && (
            <form
              onSubmit={handleReceivePaymentSubmit}
              className="bg-white border border-slate-200 rounded p-4 space-y-3"
            >
              <div className="border-b border-slate-200 pb-2 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Receive Payment
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Record full or partial installment payment from booker and reduce outstanding balance
                  </p>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded">
                  Installment Support
                </span>
              </div>

              {payError && (
                <div className="p-2.5 bg-red-50 border border-red-300 rounded text-xs text-red-900 font-medium flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                  <span>{payError}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Select Booker *
                </label>
                <select
                  required
                  value={payBookerId}
                  onChange={(e) => {
                    setPayError(null);
                    setPayBookerId(e.target.value);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded font-semibold"
                >
                  <option value="">Select Booker Account</option>
                  {bookers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.booker_name} — Outstanding: Rs.{' '}
                      {b.remaining_outstanding_amount.toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              {selectedPaymentBooker && (
                <div className="grid grid-cols-3 gap-2 bg-slate-50 border border-slate-200 rounded p-2.5 text-xs">
                  <div>
                    <div className="text-[10px] text-slate-500">Total Payable</div>
                    <div className="font-bold tabular-nums text-slate-900">
                      Rs. {selectedPaymentBooker.total_amount_payable.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Total Received</div>
                    <div className="font-bold tabular-nums text-emerald-700">
                      Rs. {selectedPaymentBooker.total_payments_received.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Remaining Outstanding</div>
                    <div className="font-bold tabular-nums text-amber-800">
                      Rs. {selectedPaymentBooker.remaining_outstanding_amount.toLocaleString()}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Payment Amount (Rs.) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    placeholder="e.g. 25000"
                    value={payAmount}
                    onChange={(e) => {
                      setPayError(null);
                      setPayAmount(e.target.value);
                    }}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Payment Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Optional payment reference or notes..."
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                />
                <button
                  type="submit"
                  disabled={busy || bookers.length === 0}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded disabled:opacity-50 shrink-0"
                >
                  {busy ? 'Recording...' : 'Confirm Payment Received'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* 1. Booker List & 5. Outstanding Payments Table */}
      {(subView === 'ALL' ||
        subView === 'BOOKER_LIST' ||
        subView === 'OUTSTANDING_PAYMENTS') && (
        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              {subView === 'OUTSTANDING_PAYMENTS'
                ? `Bookers with Outstanding Payments (${outstandingBookers.length})`
                : `Booker Accounts Summary (${filteredBookers.length})`}
            </h3>

            <div className="relative no-print">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                placeholder="Search booker name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-2.5 py-1 text-xs bg-white border border-slate-300 rounded"
              />
            </div>
          </div>

          {(subView === 'OUTSTANDING_PAYMENTS' ? outstandingBookers : filteredBookers).length ===
          0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              {subView === 'OUTSTANDING_PAYMENTS'
                ? 'No bookers currently have outstanding balances.'
                : 'No booker accounts recorded yet. Use "Add New Booker" or "Give Cartons to Booker" to start.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2 px-3">Booker Name</th>
                    <th className="py-2 px-3">Contact</th>
                    <th className="py-2 px-3">Created Date</th>
                    <th className="py-2 px-3 text-right">Apple Cartons</th>
                    <th className="py-2 px-3 text-right">Mango Cartons</th>
                    <th className="py-2 px-3 text-right">Total Cartons (Pieces)</th>
                    <th className="py-2 px-3 text-right">Total Amount Payable</th>
                    <th className="py-2 px-3 text-right">Total Payments Received</th>
                    <th className="py-2 px-3 text-right">Remaining Outstanding</th>
                    <th className="py-2 px-3 text-right no-print">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(subView === 'OUTSTANDING_PAYMENTS'
                    ? outstandingBookers
                    : filteredBookers
                  ).map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-bold text-slate-900">{b.booker_name}</td>
                      <td className="py-2 px-3 text-slate-600">{b.contact_number || '—'}</td>
                      <td className="py-2 px-3 tabular-nums text-slate-600">{b.created_date}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-800 font-medium">
                        {b.apple_cartons_received.toLocaleString()} Ctn
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-800 font-medium">
                        {b.mango_cartons_received.toLocaleString()} Ctn
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-slate-900">
                        {b.total_cartons_received.toLocaleString()} Ctn (
                        {b.total_pieces_received.toLocaleString()} Pcs)
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold text-slate-900">
                        Rs. {b.total_amount_payable.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold text-emerald-700">
                        Rs. {b.total_payments_received.toLocaleString()}
                      </td>
                      <td
                        className={`py-2 px-3 text-right tabular-nums font-bold ${
                          b.remaining_outstanding_amount > 0
                            ? 'text-amber-800'
                            : 'text-emerald-700'
                        }`}
                      >
                        Rs. {b.remaining_outstanding_amount.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right space-x-1.5 whitespace-nowrap no-print">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBookerIdForLedger(b.id);
                            setSubView('BOOKER_LEDGER');
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded"
                        >
                          <Eye className="w-3 h-3" /> Open Ledger
                        </button>
                        {b.remaining_outstanding_amount > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPayBookerId(b.id);
                              setSubView('RECEIVE_PAYMENT');
                            }}
                            className="px-2 py-1 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded"
                          >
                            Receive Payment
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
      )}

      {/* 4. Booker Account Ledger & Complete Transaction History */}
      {(subView === 'ALL' || subView === 'BOOKER_LEDGER') && (
        <div className="bg-white border border-slate-200 rounded overflow-hidden space-y-3">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Booker Account Ledger &amp; Transaction History ({filteredTransactions.length})
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2 no-print">
              <select
                value={selectedBookerIdForLedger}
                onChange={(e) => setSelectedBookerIdForLedger(e.target.value)}
                className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded font-semibold"
              >
                <option value="ALL">All Bookers Combined</option>
                {bookers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.booker_name} (Outstanding: Rs.{' '}
                    {b.remaining_outstanding_amount.toLocaleString()})
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1 text-xs">
                <span className="text-slate-500">From:</span>
                <input
                  type="date"
                  value={dateFromFilter}
                  onChange={(e) => setDateFromFilter(e.target.value)}
                  className="px-2 py-1 text-xs bg-white border border-slate-300 rounded tabular-nums"
                />
                <span className="text-slate-500">To:</span>
                <input
                  type="date"
                  value={dateToFilter}
                  onChange={(e) => setDateToFilter(e.target.value)}
                  className="px-2 py-1 text-xs bg-white border border-slate-300 rounded tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* Individual Booker Account Summary Card when a specific Booker is selected */}
          {inspectedBooker && (
            <div className="mx-4 p-3.5 bg-slate-50 border border-slate-200 rounded space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <div>
                  <span className="text-xs font-bold text-slate-900 uppercase">
                    Booker Account Statement: {inspectedBooker.booker_name}
                  </span>
                  <span className="text-xs text-slate-500 ml-3">
                    Contact: {inspectedBooker.contact_number || 'N/A'} | Created:{' '}
                    {inspectedBooker.created_date}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedBookerIdForLedger('ALL')}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 no-print"
                >
                  Show All Bookers
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
                <div className="bg-white p-2 rounded border border-slate-200">
                  <div className="text-[10px] text-slate-500">Total Cartons Given</div>
                  <div className="font-bold tabular-nums text-slate-900 mt-0.5">
                    {inspectedBooker.total_cartons_received.toLocaleString()} Ctn (
                    {inspectedBooker.total_pieces_received.toLocaleString()} Pcs)
                  </div>
                </div>
                <div className="bg-white p-2 rounded border border-slate-200">
                  <div className="text-[10px] text-slate-500">Apple Cartons Given</div>
                  <div className="font-bold tabular-nums text-slate-900 mt-0.5">
                    {inspectedBooker.apple_cartons_received.toLocaleString()} Cartons
                  </div>
                </div>
                <div className="bg-white p-2 rounded border border-slate-200">
                  <div className="text-[10px] text-slate-500">Mango Cartons Given</div>
                  <div className="font-bold tabular-nums text-slate-900 mt-0.5">
                    {inspectedBooker.mango_cartons_received.toLocaleString()} Cartons
                  </div>
                </div>
                <div className="bg-white p-2 rounded border border-slate-200">
                  <div className="text-[10px] text-slate-500">Total Amount Payable</div>
                  <div className="font-bold tabular-nums text-slate-900 mt-0.5">
                    Rs. {inspectedBooker.total_amount_payable.toLocaleString()}
                  </div>
                </div>
                <div className="bg-white p-2 rounded border border-slate-200">
                  <div className="text-[10px] text-slate-500">Total Payments Received</div>
                  <div className="font-bold tabular-nums text-emerald-700 mt-0.5">
                    Rs. {inspectedBooker.total_payments_received.toLocaleString()}
                  </div>
                </div>
                <div className="bg-white p-2 rounded border border-slate-200">
                  <div className="text-[10px] text-slate-500">Remaining Outstanding</div>
                  <div className="font-bold tabular-nums text-amber-800 mt-0.5">
                    Rs. {inspectedBooker.remaining_outstanding_amount.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {filteredTransactions.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No booker transactions recorded matching the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Reference</th>
                    <th className="py-2 px-3">Booker</th>
                    <th className="py-2 px-3">Transaction Type</th>
                    <th className="py-2 px-3">Product</th>
                    <th className="py-2 px-3 text-right">Cartons Given</th>
                    <th className="py-2 px-3 text-right">Amount Payable</th>
                    <th className="py-2 px-3 text-right">Payment Received</th>
                    <th className="py-2 px-3 text-right">Updated Outstanding Balance</th>
                    <th className="py-2 px-3">Entered By</th>
                    <th className="py-2 px-3 text-right no-print">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredTransactions.map((tx) => {
                    const isRev = Boolean(
                      tx.is_reversed || tx.transaction_type === 'REVERSAL_ENTRY'
                    );
                    const canCorrect =
                      !tx.is_reversed &&
                      tx.transaction_type !== 'REVERSAL_ENTRY' &&
                      (isOwner || tx.entered_by_id === actor.id);

                    return (
                      <tr
                        key={tx.id}
                        className={`hover:bg-slate-50 ${
                          isRev ? 'bg-slate-50/70 text-slate-500' : ''
                        }`}
                      >
                        <td className="py-2 px-3 tabular-nums text-slate-700">
                          {tx.transaction_date}
                        </td>
                        <td className="py-2 px-3 tabular-nums font-bold text-slate-900">
                          {tx.reference_number}
                          {tx.is_reversed && (
                            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-red-50 text-red-800 border border-red-200 rounded">
                              Reversed
                            </span>
                          )}
                          {tx.corrects_transaction_id && (
                            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-blue-50 text-blue-800 border border-blue-200 rounded">
                              Correction
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-900">
                          {tx.booker_name}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
                              tx.transaction_type === 'CARTONS_GIVEN'
                                ? 'bg-blue-50 text-blue-800 border-blue-200'
                                : tx.transaction_type === 'PAYMENT_RECEIVED'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-red-50 text-red-800 border-red-200'
                            }`}
                          >
                            {tx.transaction_type}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-800">
                          {tx.juice_type || '—'}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold">
                          {tx.cartons_given > 0
                            ? `${tx.cartons_given.toLocaleString()} Ctn (${tx.pieces_given.toLocaleString()} Pcs)`
                            : '—'}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold text-slate-900">
                          {tx.amount_payable > 0
                            ? `Rs. ${tx.amount_payable.toLocaleString()}`
                            : '—'}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold text-emerald-700">
                          {tx.payment_received > 0
                            ? `Rs. ${tx.payment_received.toLocaleString()}`
                            : '—'}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums font-bold text-slate-900">
                          Rs. {tx.updated_outstanding_balance.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-slate-700">{tx.entered_by_name}</td>
                        <td className="py-2 px-3 text-right no-print">
                          {canCorrect && (
                            <button
                              type="button"
                              onClick={() => openCorrectionModal(tx)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded"
                            >
                              <RotateCcw className="w-3 h-3" /> Correct / Reverse
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
      )}

      {/* Authorized Booker Transaction Reversal & Correction Modal */}
      {correctingTx && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 no-print">
          <form
            onSubmit={handleConfirmReversalOrCorrection}
            className="bg-white border border-slate-300 rounded max-w-lg w-full p-5 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Authorized Reversal / Correction — {correctingTx.reference_number}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Booker: <strong>{correctingTx.booker_name}</strong> | Original entry is preserved for audit trail.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCorrectingTx(null)}
                className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 rounded"
              >
                Cancel
              </button>
            </div>

            {corrError && (
              <div className="p-2.5 bg-red-50 border border-red-300 rounded text-xs text-red-900 font-medium whitespace-pre-line">
                {corrError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Action *
                </label>
                <select
                  value={corrMode}
                  onChange={(e) => setCorrMode(e.target.value as 'REVERSE_ONLY' | 'REPLACE')}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded font-semibold"
                >
                  <option value="REPLACE">
                    Reverse Original &amp; Apply Corrected Entry
                  </option>
                  <option value="REVERSE_ONLY">
                    Reverse Original Entry Only
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Mandatory Audit Reason *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter reason for reversal or correction..."
                  value={corrReason}
                  onChange={(e) => setCorrReason(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                />
              </div>

              {corrMode === 'REPLACE' &&
                correctingTx.transaction_type === 'CARTONS_GIVEN' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-200">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Juice Type *
                      </label>
                      <select
                        value={corrJuiceType}
                        onChange={(e) => setCorrJuiceType(e.target.value as JuiceType)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded font-semibold"
                      >
                        <option value="Apple Juice">Apple Juice</option>
                        <option value="Mango Juice">Mango Juice</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Corrected Cartons *
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={corrCartons}
                        onChange={(e) => setCorrCartons(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Corrected Payable (Rs.) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        required
                        value={corrAmountPayable}
                        onChange={(e) => setCorrAmountPayable(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums font-bold"
                      />
                    </div>
                  </div>
                )}

              {corrMode === 'REPLACE' &&
                correctingTx.transaction_type === 'PAYMENT_RECEIVED' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-200">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Corrected Payment Amount (Rs.) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        required
                        value={corrPaymentAmount}
                        onChange={(e) => setCorrPaymentAmount(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Payment Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={corrDate}
                        onChange={(e) => setCorrDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums"
                      />
                    </div>
                  </div>
                )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setCorrectingTx(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded disabled:opacity-50"
              >
                {busy
                  ? 'Processing...'
                  : corrMode === 'REPLACE'
                  ? 'Confirm Reversal & Replacement'
                  : 'Confirm Reversal'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
