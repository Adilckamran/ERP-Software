'use client';

import React, { useState } from 'react';
import type { ErpDatabaseState } from '@/lib/db/store';
import type {
  UserProfile,
  ParsedVoiceTransaction,
  MaterialUnit,
} from '@juice-erp/shared-types';
import {
  Mic,
  MicOff,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';

interface VoiceHistoryItem {
  id: string;
  timestamp: string;
  transcript: string;
  intent: string;
  reference: string;
  summary: string;
}

interface Props {
  state: ErpDatabaseState;
  actor: UserProfile;
  busy: boolean;
  runAction: (
    action: string,
    payload: Record<string, any>,
    successMessage?: string
  ) => Promise<any>;
  mode?: 'VOICE_ONLY' | 'AI_ONLY' | 'COMBINED';
}

export function VoiceAndAiModule({
  state,
  actor,
  busy,
  runAction,
}: Props) {
  const isAdmin = actor.role === 'OWNER';

  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parsing, setParsing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<ParsedVoiceTransaction | null>(null);

  // Editable Preview Overrides
  const [editMaterialName, setEditMaterialName] = useState('');
  const [editSupplierName, setEditSupplierName] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editUnit, setEditUnit] = useState<MaterialUnit>('KG');
  const [editAmountPkr, setEditAmountPkr] = useState('');
  const [editInvoiceNo, setEditInvoiceNo] = useState('');
  const [editDealerId, setEditDealerId] = useState('');
  const [editProductId, setEditProductId] = useState('');
  const [editProductName, setEditProductName] = useState('Mango Juice');
  const [editBottleSize, setEditBottleSize] = useState('250 ML');
  const [editConsumedMaterials, setEditConsumedMaterials] = useState<
    Array<{
      raw_material_id: string;
      raw_material_name: string;
      entered_quantity: number;
      entered_unit: string;
    }>
  >([]);
  const [editMachineId, setEditMachineId] = useState('');
  const [editProblemDesc, setEditProblemDesc] = useState('');

  const [voiceHistory, setVoiceHistory] = useState<VoiceHistoryItem[]>([]);

  const handleToggleMicrophone = () => {
    if (isRecording) {
      setIsRecording(false);
      return;
    }

    const SpeechRecognition =
      (typeof window !== 'undefined' && (window as any).SpeechRecognition) ||
      (typeof window !== 'undefined' && (window as any).webkitSpeechRecognition);

    if (!SpeechRecognition) {
      setIsRecording(true);
      setTimeout(() => {
        setIsRecording(false);
      }, 1500);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'ur-PK';
      recognition.interimResults = false;
      setIsRecording(true);
      recognition.onresult = (event: any) => {
        const spokenText = event.results?.[0]?.[0]?.transcript || '';
        if (spokenText) {
          setTranscript(spokenText);
        }
        setIsRecording(false);
      };
      recognition.onerror = () => {
        setIsRecording(false);
      };
      recognition.onend = () => {
        setIsRecording(false);
      };
      recognition.start();
    } catch {
      setIsRecording(false);
    }
  };

  const handleParseTranscript = async (textToParse?: string) => {
    const input = (textToParse ?? transcript).trim();
    if (!input) return;
    setTranscript(input);
    setParsing(true);
    setVoiceError(null);
    setParsedPreview(null);

    try {
      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: input, actorId: actor.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Voice command rejected.');
      }

      const p: ParsedVoiceTransaction = json.parsed;
      setParsedPreview(p);

      setEditMaterialName(
        p.extracted.matched_raw_material_name || p.extracted.raw_material_query || 'Juice Chemical'
      );
      setEditSupplierName(p.extracted.matched_supplier_name || 'ABC Supplier');
      setEditQty(String(p.extracted.quantity ?? 1));
      setEditUnit(((p.extracted.unit || 'KG').toUpperCase() as MaterialUnit));
      setEditAmountPkr(String(p.extracted.amount_pkr ?? 5000));
      setEditInvoiceNo(`INV-${Date.now().toString().slice(-4)}`);
      setEditDealerId(p.extracted.matched_dealer_id || state.dealers[0]?.id || '');
      setEditProductId(p.extracted.matched_product_id || state.products[0]?.id || '');
      setEditProductName(p.extracted.matched_product_name || 'Mango Juice');
      setEditBottleSize(p.extracted.bottle_size_label || '250 ML');
      setEditConsumedMaterials(p.extracted.consumed_materials || []);
      setEditMachineId(
        p.extracted.machine_id || state.machines[1]?.id || state.machines[0]?.id || 'mach-2'
      );
      setEditProblemDesc(p.extracted.problem_description || input);
    } catch (err: any) {
      setVoiceError(err?.message || 'Unable to parse voice command.');
    } finally {
      setParsing(false);
    }
  };

  const handleConfirmAndSaveVoiceTransaction = async () => {
    if (!parsedPreview) return;
    const today = new Date().toISOString().split('T')[0];
    const intent = parsedPreview.intent;

    if (intent === 'RAW_MATERIAL_STOCK_RECEIPT' || intent === 'RAW_MATERIAL_PURCHASE') {
      const res = await runAction(
        'ADD_RAW_MATERIAL_STOCK_RECEIPT',
        {
          material_name: editMaterialName,
          category: editMaterialName.toLowerCase().includes('sugar')
            ? 'Sweetener'
            : editMaterialName.toLowerCase().includes('concentrate')
            ? 'Concentrate'
            : 'Chemical',
          quantity: Number(editQty),
          unit: editUnit,
          supplier_name: editSupplierName,
          purchase_price_total: Number(editAmountPkr),
          purchase_date: today,
          invoice_number: editInvoiceNo,
          notes: `Voice: "${parsedPreview.transcript}"`,
        },
        `Receipt saved (${editInvoiceNo}): +${editQty} ${editUnit} ${editMaterialName}`
      );
      if (res?.ok) {
        const ref = res.data?.receipt?.invoice_number || editInvoiceNo;
        setVoiceHistory((prev) => [
          {
            id: `vh-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            transcript: parsedPreview.transcript,
            intent,
            reference: ref,
            summary: `+${editQty} ${editUnit} ${editMaterialName} (${editSupplierName})`,
          },
          ...prev,
        ]);
        setParsedPreview(null);
      }
      return;
    }

    if (intent === 'PRODUCTION_BATCH_REPORT') {
      const res = await runAction(
        'SAVE_PRODUCTION_BATCH',
        {
          product_name: editProductName,
          bottle_size_label: editBottleSize,
          actual_bottles: Number(editQty),
          target_bottles: Number(editQty),
          wastage_bottles: 0,
          production_date: today,
          status: 'SUBMITTED',
          remarks: `Voice: "${parsedPreview.transcript}"`,
          consumed_materials: editConsumedMaterials,
        },
        `Production batch submitted (${editQty} Bottles ${editProductName}).`
      );
      if (res?.ok) {
        const ref = res.data?.batch_number || 'BATCH-SUBMITTED';
        setVoiceHistory((prev) => [
          {
            id: `vh-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            transcript: parsedPreview.transcript,
            intent,
            reference: ref,
            summary: `${editQty} Bottles ${editProductName} (${editBottleSize})`,
          },
          ...prev,
        ]);
        setParsedPreview(null);
      }
      return;
    }

    if (intent === 'MACHINE_ISSUE_REPORT') {
      const res = await runAction(
        'REPORT_MACHINE_ISSUE',
        {
          machine_id: editMachineId,
          priority: parsedPreview.extracted.priority || 'High',
          problem_description: editProblemDesc,
          issue_date: today,
        },
        'Maintenance ticket logged.'
      );
      if (res?.ok) {
        const ref = res.data?.ticket_number || 'MNT-TICKET';
        setVoiceHistory((prev) => [
          {
            id: `vh-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            transcript: parsedPreview.transcript,
            intent,
            reference: ref,
            summary: editProblemDesc,
          },
          ...prev,
        ]);
        setParsedPreview(null);
      }
      return;
    }

    if (intent === 'PAYMENT_GIVEN_TO_PARTY' || intent === 'PAYMENT_RECEIVED_FROM_DEALER') {
      const direction =
        intent === 'PAYMENT_GIVEN_TO_PARTY' ? 'OUTGOING_TO_PERSON' : 'INCOMING_FROM_DEALER';
      const res = await runAction(
        'RECORD_PAYMENT',
        {
          dealer_id: editDealerId,
          amount: Number(editAmountPkr),
          direction,
          payment_method: 'Cash',
          description: `Voice: "${parsedPreview.transcript}"`,
        },
        `Payment recorded (PKR ${Number(editAmountPkr).toLocaleString()}).`
      );
      if (res?.ok) {
        const ref = res.data?.receipt_number || 'RCPT-VOICE';
        setVoiceHistory((prev) => [
          {
            id: `vh-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            transcript: parsedPreview.transcript,
            intent,
            reference: ref,
            summary: `PKR ${Number(editAmountPkr).toLocaleString()}`,
          },
          ...prev,
        ]);
        setParsedPreview(null);
      }
      return;
    }

    if (intent === 'PAYMENT_RECEIVABLE_RECORD') {
      const res = await runAction(
        'RECORD_DEALER_RECEIVABLE_ADJUSTMENT',
        {
          dealer_id: editDealerId,
          amount: Number(editAmountPkr),
          description: `Voice: "${parsedPreview.transcript}"`,
        },
        `Receivable recorded (PKR ${Number(editAmountPkr).toLocaleString()}).`
      );
      if (res?.ok) {
        const ref = res.data?.reference_number || 'RCV-VOICE';
        setVoiceHistory((prev) => [
          {
            id: `vh-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            transcript: parsedPreview.transcript,
            intent,
            reference: ref,
            summary: `Receivable PKR ${Number(editAmountPkr).toLocaleString()}`,
          },
          ...prev,
        ]);
        setParsedPreview(null);
      }
      return;
    }

    if (intent === 'SALES_ORDER_OR_DISPATCH') {
      const res = await runAction(
        'CREATE_ORDER',
        {
          dealer_id: editDealerId,
          product_id: editProductId,
          quantity_cartons: Number(editQty),
          auto_dispatch: isAdmin,
          delivery_notes: `Voice: "${parsedPreview.transcript}"`,
        },
        `Sales order created (${editQty} Cartons).`
      );
      if (res?.ok) {
        const ref = res.data?.order_number || 'ORD-VOICE';
        setVoiceHistory((prev) => [
          {
            id: `vh-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            transcript: parsedPreview.transcript,
            intent,
            reference: ref,
            summary: `${editQty} Cartons (${ref})`,
          },
          ...prev,
        ]);
        setParsedPreview(null);
      }
      return;
    }

    if (intent === 'EXPENSE_PAYMENT') {
      const res = await runAction(
        'CREATE_EXPENSE',
        {
          category: parsedPreview.extracted.expense_category || 'Electricity',
          amount: Number(editAmountPkr),
          description: `Voice: "${parsedPreview.transcript}"`,
          date: today,
        },
        `Expense recorded (PKR ${Number(editAmountPkr).toLocaleString()}).`
      );
      if (res?.ok) {
        const ref = res.data?.expense_number || 'EXP-VOICE';
        setVoiceHistory((prev) => [
          {
            id: `vh-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            transcript: parsedPreview.transcript,
            intent,
            reference: ref,
            summary: `Expense PKR ${Number(editAmountPkr).toLocaleString()}`,
          },
          ...prev,
        ]);
        setParsedPreview(null);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Voice Transaction
          </h2>
          <span className="text-[11px] font-medium text-slate-500">
            Urdu / Roman Urdu / English
          </span>
        </div>

        <div className="p-4 space-y-3">
          {/* Microphone & Transcript Input */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <button
              type="button"
              onClick={handleToggleMicrophone}
              className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded border transition shrink-0 ${
                isRecording
                  ? 'bg-red-600 text-white border-red-700'
                  : 'bg-[#0B192C] hover:bg-slate-800 text-white border-[#0B192C]'
              }`}
            >
              {isRecording ? (
                <>
                  <MicOff className="w-3.5 h-3.5" /> Stop
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5" /> Microphone
                </>
              )}
            </button>

            <input
              type="text"
              placeholder={
                isAdmin
                  ? 'Transcript (e.g., Factory mein 2 kilo chemical receive hua hai)...'
                  : 'Transcript (e.g., Aaj 500 bottles mango juice produce hui hain)...'
              }
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleParseTranscript();
              }}
              className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-900"
            />

            <button
              type="button"
              disabled={parsing || !transcript.trim()}
              onClick={() => handleParseTranscript()}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded shrink-0"
            >
              {parsing ? 'Parsing...' : 'Preview Transaction'}
            </button>
          </div>

          {voiceError && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded text-xs font-medium text-red-800 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
              {voiceError}
            </div>
          )}

          {/* Editable Transaction Preview */}
          {parsedPreview && (
            <div className="bg-slate-50 border border-slate-300 rounded p-3.5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="text-xs font-bold text-slate-900">
                  Transaction Preview — {parsedPreview.intent.replace(/_/g, ' ')}
                </div>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-300 rounded">
                  Pending Confirmation
                </span>
              </div>

              {parsedPreview.clarification_question && (
                <div className="p-2 bg-amber-50 border border-amber-300 rounded text-xs text-amber-900">
                  {parsedPreview.clarification_question}
                </div>
              )}

              {(parsedPreview.intent === 'RAW_MATERIAL_STOCK_RECEIPT' ||
                parsedPreview.intent === 'RAW_MATERIAL_PURCHASE') && (
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Material
                    </label>
                    <input
                      type="text"
                      value={editMaterialName}
                      onChange={(e) => setEditMaterialName(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Supplier
                    </label>
                    <input
                      type="text"
                      value={editSupplierName}
                      onChange={(e) => setEditSupplierName(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Quantity
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={editQty}
                      onChange={(e) => setEditQty(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Unit
                    </label>
                    <select
                      value={editUnit}
                      onChange={(e) => setEditUnit(e.target.value as MaterialUnit)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                    >
                      <option value="KG">KG</option>
                      <option value="GRAM">GRAM</option>
                      <option value="LITRE">LITRE</option>
                      <option value="ML">ML</option>
                      <option value="PIECES">PIECES</option>
                      <option value="CARTONS">CARTONS</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Amount (PKR)
                    </label>
                    <input
                      type="number"
                      value={editAmountPkr}
                      onChange={(e) => setEditAmountPkr(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums"
                    />
                  </div>
                </div>
              )}

              {parsedPreview.intent === 'PRODUCTION_BATCH_REPORT' && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Product
                      </label>
                      <input
                        type="text"
                        value={editProductName}
                        onChange={(e) => setEditProductName(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Size
                      </label>
                      <input
                        type="text"
                        value={editBottleSize}
                        onChange={(e) => setEditBottleSize(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Quantity (Bottles)
                      </label>
                      <input
                        type="number"
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums"
                      />
                    </div>
                  </div>

                  {editConsumedMaterials.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded p-2.5">
                      <div className="text-[11px] font-semibold text-slate-600 mb-1.5">
                        Material Consumption
                      </div>
                      <div className="space-y-1.5">
                        {editConsumedMaterials.map((item, idx) => (
                          <div
                            key={idx}
                            className="grid grid-cols-3 gap-2 items-center text-xs"
                          >
                            <span className="font-medium text-slate-900">
                              {item.raw_material_name}
                            </span>
                            <input
                              type="number"
                              step="any"
                              value={item.entered_quantity}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setEditConsumedMaterials((prev) =>
                                  prev.map((m, i) =>
                                    i === idx ? { ...m, entered_quantity: val } : m
                                  )
                                );
                              }}
                              className="px-2 py-1 bg-white border border-slate-300 rounded tabular-nums"
                            />
                            <span className="text-slate-700">{item.entered_unit}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(parsedPreview.intent === 'PAYMENT_GIVEN_TO_PARTY' ||
                parsedPreview.intent === 'PAYMENT_RECEIVABLE_RECORD' ||
                parsedPreview.intent === 'PAYMENT_RECEIVED_FROM_DEALER') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Dealer / Party
                    </label>
                    <select
                      value={editDealerId}
                      onChange={(e) => setEditDealerId(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                    >
                      <option value="">Select Dealer</option>
                      {state.dealers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.dealer_name} ({d.shop_name})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Amount (PKR)
                    </label>
                    <input
                      type="number"
                      value={editAmountPkr}
                      onChange={(e) => setEditAmountPkr(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums"
                    />
                  </div>
                </div>
              )}

              {parsedPreview.intent === 'SALES_ORDER_OR_DISPATCH' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Dealer
                    </label>
                    <select
                      value={editDealerId}
                      onChange={(e) => setEditDealerId(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                    >
                      <option value="">Select Dealer</option>
                      {state.dealers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.dealer_name} ({d.shop_name})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Product
                    </label>
                    <select
                      value={editProductId}
                      onChange={(e) => setEditProductId(e.target.value)}
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
                      Cartons
                    </label>
                    <input
                      type="number"
                      value={editQty}
                      onChange={(e) => setEditQty(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums"
                    />
                  </div>
                </div>
              )}

              {parsedPreview.intent === 'MACHINE_ISSUE_REPORT' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Machine
                    </label>
                    <select
                      value={editMachineId}
                      onChange={(e) => setEditMachineId(e.target.value)}
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
                      Issue
                    </label>
                    <input
                      type="text"
                      value={editProblemDesc}
                      onChange={(e) => setEditProblemDesc(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setParsedPreview(null)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded"
                >
                  <XCircle className="w-3.5 h-3.5" /> Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || parsedPreview.intent === 'AMBIGUOUS_OR_INCOMPLETE'}
                  onClick={handleConfirmAndSaveVoiceTransaction}
                  className="inline-flex items-center gap-1 px-4 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Confirm
                </button>
              </div>
            </div>
          )}

          {voiceHistory.length > 0 && (
            <div className="border-t border-slate-200 pt-3">
              <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
                Confirmed Voice Transactions
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                      <th className="py-1.5 px-2.5">Time</th>
                      <th className="py-1.5 px-2.5">Transcript</th>
                      <th className="py-1.5 px-2.5">Reference</th>
                      <th className="py-1.5 px-2.5">Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {voiceHistory.map((item) => (
                      <tr key={item.id}>
                        <td className="py-1.5 px-2.5 text-slate-500 tabular-nums">
                          {item.timestamp}
                        </td>
                        <td className="py-1.5 px-2.5 text-slate-800">{item.transcript}</td>
                        <td className="py-1.5 px-2.5 font-semibold text-emerald-700 tabular-nums">
                          {item.reference}
                        </td>
                        <td className="py-1.5 px-2.5 text-slate-700">{item.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
