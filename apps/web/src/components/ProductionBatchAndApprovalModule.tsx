'use client';

import React, { useState, useMemo, useEffect } from 'react';
import type { ErpDatabaseState } from '@/lib/db/store';
import type {
  UserProfile,
  RawMaterialUnit,
  ProductionBatch,
  JuiceType,
} from '@juice-erp/shared-types';
import {
  Plus,
  Trash2,
  CheckCircle2,
  Eye,
  Printer,
  Search,
  AlertTriangle,
  RotateCcw,
  FileText,
} from 'lucide-react';

const PIECES_PER_CARTON = 24;

function normalizeUnitCode(u: string): RawMaterialUnit {
  const up = (u || '').trim().toUpperCase();
  if (up === 'GRAM' || up === 'GRAMS' || up === 'G') return 'GRAM';
  if (up === 'KG' || up === 'KGS' || up === 'KILO' || up === 'KILOGRAM') return 'KG';
  if (up === 'ML' || up === 'MILLILITER' || up === 'MILLILITRE') return 'ML';
  if (up === 'LITRE' || up === 'LITER' || up === 'L') return 'LITRE';
  if (up === 'BOX' || up === 'BOXES') return 'BOX';
  if (up === 'PIECE' || up === 'PIECES' || up === 'PC' || up === 'PCS') return 'PIECE';
  if (up === 'PACKET' || up === 'PACKETS' || up === 'PKT') return 'PACKET';
  return (up as RawMaterialUnit) || 'KG';
}

function previewConvertToBaseUnit(
  qty: number,
  fromUnitRaw: string,
  targetUnitRaw: string,
  boxToPieceFactor?: number | null
): number | null {
  const fromUnit = normalizeUnitCode(fromUnitRaw);
  const targetUnit = normalizeUnitCode(targetUnitRaw);
  if (fromUnit === targetUnit) return Number(qty.toFixed(4));
  if (fromUnit === 'GRAM' && targetUnit === 'KG') return Number((qty / 1000).toFixed(4));
  if (fromUnit === 'KG' && targetUnit === 'GRAM') return Number((qty * 1000).toFixed(4));
  if (fromUnit === 'ML' && targetUnit === 'LITRE') return Number((qty / 1000).toFixed(4));
  if (fromUnit === 'LITRE' && targetUnit === 'ML') return Number((qty * 1000).toFixed(4));
  const factor = Number(boxToPieceFactor || 0);
  if (fromUnit === 'PIECE' && targetUnit === 'BOX' && factor > 0) {
    return Number((qty / factor).toFixed(4));
  }
  if (fromUnit === 'BOX' && targetUnit === 'PIECE' && factor > 0) {
    return Number((qty * factor).toFixed(4));
  }
  return null;
}

interface ConsumptionRowInput {
  raw_material_id: string;
  entered_quantity: string;
  entered_unit: RawMaterialUnit;
}

interface Props {
  state: ErpDatabaseState;
  actor: UserProfile;
  busy: boolean;
  runAction: (action: string, payload: Record<string, any>, msg?: string) => Promise<any>;
  viewMode?: 'ALL' | 'APPROVALS' | 'ENTRY' | 'CONSUMPTION' | 'HISTORY';
}

export function ProductionBatchAndApprovalModule({
  state,
  actor,
  busy,
  runAction,
  viewMode = 'ALL',
}: Props) {
  const isOwner = actor.role === 'OWNER';
  const today = new Date().toISOString().split('T')[0];

  // Production Entry Form State
  const [juiceType, setJuiceType] = useState<JuiceType>('Apple Juice');
  const [cartonsProduced, setCartonsProduced] = useState<string>('');
  const [productionDate, setProductionDate] = useState<string>(today);
  const [notes, setNotes] = useState<string>('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>(
    () => `prod-key-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const [rows, setRows] = useState<ConsumptionRowInput[]>(() => {
    const first = state.raw_materials[0];
    return [
      {
        raw_material_id: first?.id || '',
        entered_quantity: '',
        entered_unit: normalizeUnitCode(String(first?.unit || 'KG')),
      },
    ];
  });

  useEffect(() => {
    if (state.raw_materials.length > 0) {
      setRows((prev) => {
        if (prev.length === 1 && !prev[0].raw_material_id) {
          const first = state.raw_materials[0];
          return [
            {
              raw_material_id: first.id,
              entered_quantity: '',
              entered_unit: normalizeUnitCode(String(first.unit || 'KG')),
            },
          ];
        }
        return prev;
      });
    }
  }, [state.raw_materials]);

  // Daily Production Report Modal State
  const [activeReportBatch, setActiveReportBatch] = useState<ProductionBatch | null>(null);

  // Correction / Reversal Modal State
  const [correctingBatch, setCorrectingBatch] = useState<ProductionBatch | null>(null);
  const [correctionMode, setCorrectionMode] = useState<'REVERSE_ONLY' | 'REPLACE'>('REPLACE');
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [corrJuiceType, setCorrJuiceType] = useState<JuiceType>('Apple Juice');
  const [corrCartons, setCorrCartons] = useState<string>('');
  const [corrDate, setCorrDate] = useState<string>(today);
  const [corrNotes, setCorrNotes] = useState<string>('');
  const [corrRows, setCorrRows] = useState<ConsumptionRowInput[]>([]);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  // Production History Filters
  const [productFilter, setProductFilter] = useState<'ALL' | 'Apple Juice' | 'Mango Juice'>('ALL');
  const [managerFilter, setManagerFilter] = useState<string>('ALL');
  const [dateFromFilter, setDateFromFilter] = useState<string>('');
  const [dateToFilter, setDateToFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const numericCartons = Number(cartonsProduced);
  const validCartons =
    Number.isFinite(numericCartons) && numericCartons > 0 && Number.isInteger(numericCartons)
      ? numericCartons
      : 0;
  const calculatedTotalPieces = validCartons * PIECES_PER_CARTON;

  const addMaterialRow = () => {
    const firstUnused =
      state.raw_materials.find((m) => !rows.some((r) => r.raw_material_id === m.id)) ||
      state.raw_materials[0];
    setRows((prev) => [
      ...prev,
      {
        raw_material_id: firstUnused?.id || '',
        entered_quantity: '',
        entered_unit: normalizeUnitCode(String(firstUnused?.unit || 'KG')),
      },
    ]);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, patch: Partial<ConsumptionRowInput>) => {
    setLocalError(null);
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  // Real-time stock shortage & unit validation (aggregates duplicate rows for same material)
  const stockValidation = useMemo(() => {
    const shortages: Array<{
      materialName: string;
      unit: string;
      available: number;
      required: number;
      shortage: number;
    }> = [];
    const unitErrors: string[] = [];

    const aggregated = new Map<
      string,
      { name: string; unit: string; available: number; required: number }
    >();

    for (const r of rows) {
      const qty = Number(r.entered_quantity);
      if (!r.raw_material_id || !Number.isFinite(qty) || qty <= 0) continue;
      const rm = state.raw_materials.find((m) => m.id === r.raw_material_id);
      if (!rm) continue;

      const canonical = normalizeUnitCode(String(rm.unit));
      const conv = previewConvertToBaseUnit(qty, r.entered_unit, canonical, rm.box_to_piece_factor);
      if (conv === null) {
        unitErrors.push(
          `Cannot convert ${qty} ${r.entered_unit} into ${canonical} for "${rm.name}".`
        );
      } else {
        const existing = aggregated.get(rm.id);
        if (existing) {
          existing.required = Number((existing.required + conv).toFixed(4));
        } else {
          aggregated.set(rm.id, {
            name: rm.name,
            unit: canonical,
            available: Number((rm.current_stock ?? 0).toFixed(4)),
            required: conv,
          });
        }
      }
    }

    for (const item of aggregated.values()) {
      if (item.required > item.available) {
        shortages.push({
          materialName: item.name,
          unit: item.unit,
          available: item.available,
          required: item.required,
          shortage: Number((item.required - item.available).toFixed(4)),
        });
      }
    }

    return { shortages, unitErrors };
  }, [rows, state.raw_materials]);

  const handleConfirmProduction = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (validCartons <= 0) {
      setLocalError('Please enter a valid whole number of cartons produced (greater than zero).');
      return;
    }

    const validMaterials = rows
      .filter((r) => r.raw_material_id && Number(r.entered_quantity) > 0)
      .map((r) => ({
        raw_material_id: r.raw_material_id,
        entered_quantity: Number(r.entered_quantity),
        entered_unit: r.entered_unit,
      }));

    if (validMaterials.length === 0) {
      setLocalError(
        'Please select at least one raw material from the inventory master and enter actual quantity consumed.'
      );
      return;
    }

    if (stockValidation.unitErrors.length > 0) {
      setLocalError(stockValidation.unitErrors.join(' '));
      return;
    }

    if (stockValidation.shortages.length > 0) {
      const formattedShortages = stockValidation.shortages
        .map(
          (s) =>
            `Insufficient ${s.materialName} Stock. Available: ${s.available} ${s.unit}. Required: ${s.required} ${s.unit}. Shortage: ${s.shortage} ${s.unit}.`
        )
        .join(' ');
      setLocalError(formattedShortages);
      return;
    }

    const res = await runAction(
      'CONFIRM_PRODUCTION_BATCH',
      {
        production_date: productionDate,
        juice_type: juiceType,
        cartons_produced: validCartons,
        consumed_materials: validMaterials,
        notes: notes.trim(),
        idempotency_key: idempotencyKey,
      },
      `Production confirmed: ${validCartons} cartons (${calculatedTotalPieces.toLocaleString()} pieces) of ${juiceType}. Stock updated.`
    );

    if (res?.ok) {
      if (res.data?.batch) {
        setActiveReportBatch(res.data.batch);
      }
      setCartonsProduced('');
      setNotes('');
      setIdempotencyKey(`prod-key-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
      const first = state.raw_materials[0];
      setRows([
        {
          raw_material_id: first?.id || '',
          entered_quantity: '',
          entered_unit: normalizeUnitCode(String(first?.unit || 'KG')),
        },
      ]);
    }
  };

  const openCorrectionModal = (batch: ProductionBatch) => {
    setCorrectingBatch(batch);
    setCorrectionMode('REPLACE');
    setCorrectionReason('');
    setCorrectionError(null);
    setCorrJuiceType(
      batch.product_name.toLowerCase().includes('apple') ? 'Apple Juice' : 'Mango Juice'
    );
    setCorrCartons(String(batch.actual_cartons));
    setCorrDate(batch.production_date);
    setCorrNotes(batch.remarks || '');
    setCorrRows(
      batch.material_usage.map((u) => ({
        raw_material_id: u.raw_material_id,
        entered_quantity: String(u.entered_quantity ?? u.quantity_entered ?? u.actual_quantity),
        entered_unit: normalizeUnitCode(
          String(u.entered_unit || u.unit_entered || u.unit || 'KG')
        ),
      }))
    );
  };

  const handleExecuteCorrectionOrReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingBatch) return;
    setCorrectionError(null);

    if (!correctionReason.trim()) {
      setCorrectionError('Please enter a reason for this correction or reversal.');
      return;
    }

    let correctedProductionPayload: any = undefined;
    if (correctionMode === 'REPLACE') {
      const cCartons = Number(corrCartons);
      if (!Number.isFinite(cCartons) || cCartons <= 0 || !Number.isInteger(cCartons)) {
        setCorrectionError('Corrected cartons must be a whole number greater than zero.');
        return;
      }
      const validMat = corrRows
        .filter((r) => r.raw_material_id && Number(r.entered_quantity) > 0)
        .map((r) => ({
          raw_material_id: r.raw_material_id,
          entered_quantity: Number(r.entered_quantity),
          entered_unit: r.entered_unit,
        }));
      if (validMat.length === 0) {
        setCorrectionError('Please enter at least one material consumption row for the corrected batch.');
        return;
      }
      correctedProductionPayload = {
        production_date: corrDate,
        juice_type: corrJuiceType,
        cartons_produced: cCartons,
        consumed_materials: validMat,
        notes: corrNotes,
      };
    }

    const res = await runAction(
      'REVERSE_OR_CORRECT_PRODUCTION_BATCH',
      {
        batch_id: correctingBatch.id,
        reason: correctionReason.trim(),
        corrected_production: correctedProductionPayload,
      },
      correctionMode === 'REPLACE'
        ? `Production record ${correctingBatch.batch_number} reversed and replaced with corrected batch.`
        : `Production record ${correctingBatch.batch_number} reversed and inventory restored.`
    );

    if (res?.ok) {
      setCorrectingBatch(null);
      if (res.data?.replacement_batch) {
        setActiveReportBatch(res.data.replacement_batch);
      }
    } else if (res?.error) {
      setCorrectionError(res.error);
    }
  };

  // Filtered production history
  const filteredBatches = useMemo(() => {
    return state.production_batches.filter((b) => {
      const bProduct = b.juice_type || b.product_name;
      if (productFilter !== 'ALL') {
        if (!bProduct.toLowerCase().includes(productFilter.split(' ')[0].toLowerCase())) {
          return false;
        }
      }
      if (managerFilter !== 'ALL') {
        const mgrName = (b.submitted_by_name || b.created_by_name || '').toLowerCase();
        const mgrId = b.submitted_by_id || b.submitted_by || b.created_by;
        if (
          mgrId !== managerFilter &&
          !mgrName.includes(managerFilter.toLowerCase())
        ) {
          return false;
        }
      }
      if (statusFilter !== 'ALL') {
        const isRev = Boolean(b.is_reversed || b.status === 'REVERSED');
        if (statusFilter === 'CONFIRMED' && isRev) return false;
        if (statusFilter === 'REVERSED' && !isRev) return false;
      }
      if (dateFromFilter && b.production_date < dateFromFilter) return false;
      if (dateToFilter && b.production_date > dateToFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          b.batch_number.toLowerCase().includes(q) ||
          bProduct.toLowerCase().includes(q) ||
          (b.submitted_by_name || b.created_by_name || '').toLowerCase().includes(q) ||
          (b.remarks || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [
    state.production_batches,
    productFilter,
    managerFilter,
    statusFilter,
    dateFromFilter,
    dateToFilter,
    searchQuery,
  ]);

  // Summary totals across confirmed (non-reversed) production records in current filter view
  const confirmedSummary = useMemo(() => {
    let appleCartons = 0;
    let mangoCartons = 0;
    for (const b of filteredBatches) {
      if (b.is_reversed || b.status === 'REVERSED' || b.status === 'REJECTED') continue;
      const pName = (b.juice_type || b.product_name || '').toLowerCase();
      if (pName.includes('apple')) {
        appleCartons += b.actual_cartons;
      } else if (pName.includes('mango')) {
        mangoCartons += b.actual_cartons;
      }
    }
    const applePieces = appleCartons * PIECES_PER_CARTON;
    const mangoPieces = mangoCartons * PIECES_PER_CARTON;
    const totalCartons = appleCartons + mangoCartons;
    const totalPieces = applePieces + mangoPieces;
    return {
      appleCartons,
      applePieces,
      mangoCartons,
      mangoPieces,
      totalCartons,
      totalPieces,
    };
  }, [filteredBatches]);

  const showEntryForm =
    viewMode === 'ALL' || viewMode === 'ENTRY' || viewMode === 'CONSUMPTION';
  const showConsumptionRegister = viewMode === 'CONSUMPTION';
  const showHistoryTable =
    viewMode === 'ALL' || viewMode === 'APPROVALS' || viewMode === 'HISTORY';

  return (
    <div className="space-y-4">
      {/* Apple, Mango & Combined Production Summary Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 no-print">
        <div className="bg-white border border-slate-200 rounded p-3.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Apple Juice Production (1 Carton = 24 Pieces)
          </div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <div>
              <span className="text-lg font-bold tabular-nums text-slate-900">
                {confirmedSummary.appleCartons.toLocaleString()}
              </span>
              <span className="text-xs font-semibold text-slate-600 ml-1">Cartons</span>
            </div>
            <div className="text-xs font-bold tabular-nums text-emerald-700">
              {confirmedSummary.applePieces.toLocaleString()} Pieces
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded p-3.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Mango Juice Production (1 Carton = 24 Pieces)
          </div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <div>
              <span className="text-lg font-bold tabular-nums text-slate-900">
                {confirmedSummary.mangoCartons.toLocaleString()}
              </span>
              <span className="text-xs font-semibold text-slate-600 ml-1">Cartons</span>
            </div>
            <div className="text-xs font-bold tabular-nums text-emerald-700">
              {confirmedSummary.mangoPieces.toLocaleString()} Pieces
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded p-3.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Combined Production Output
          </div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <div>
              <span className="text-lg font-bold tabular-nums text-slate-900">
                {confirmedSummary.totalCartons.toLocaleString()}
              </span>
              <span className="text-xs font-semibold text-slate-600 ml-1">Total Cartons</span>
            </div>
            <div className="text-xs font-bold tabular-nums text-slate-900">
              {confirmedSummary.totalPieces.toLocaleString()} Total Pieces
            </div>
          </div>
        </div>
      </div>

      {/* Daily Production Entry & Material Consumption Form */}
      {showEntryForm && (
        <form
          onSubmit={handleConfirmProduction}
          className="bg-white border border-slate-200 rounded p-4 space-y-4 no-print"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Daily Production Entry &amp; Material Consumption
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Recorded by: <strong className="text-slate-800">{actor.full_name}</strong> | Standard
                Packaging: <strong className="text-slate-800">1 Carton = 24 Pieces</strong>
              </p>
            </div>
            <span className="px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-300 rounded">
              Direct Stock Deduction &amp; Finished Goods Update
            </span>
          </div>

          {localError && (
            <div className="p-3 bg-red-50 border border-red-300 rounded text-xs text-red-900 font-medium whitespace-pre-line flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              <span>{localError}</span>
            </div>
          )}

          {stockValidation.shortages.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-300 rounded text-xs text-red-950 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-red-900">
                <AlertTriangle className="w-4 h-4 text-red-700" />
                Insufficient Raw Material Stock — Production Submission Blocked:
              </div>
              {stockValidation.shortages.map((s, i) => (
                <div
                  key={i}
                  className="bg-white border border-red-200 rounded p-2 font-medium text-red-900 leading-relaxed"
                >
                  <div>
                    <strong>Insufficient {s.materialName} Stock.</strong>
                  </div>
                  <div>
                    Available: <strong>{s.available} {s.unit}</strong>.
                  </div>
                  <div>
                    Required: <strong>{s.required} {s.unit}</strong>.
                  </div>
                  <div>
                    Shortage: <strong className="text-red-700">{s.shortage} {s.unit}</strong>.
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Step 1 & 2: Select Product, Date, and Cartons */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Production Date *
              </label>
              <input
                type="date"
                required
                value={productionDate}
                onChange={(e) => setProductionDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs tabular-nums bg-white border border-slate-300 rounded"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Juice Type (Product) *
              </label>
              <select
                value={juiceType}
                onChange={(e) => setJuiceType(e.target.value as JuiceType)}
                className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded"
              >
                <option value="Apple Juice">Apple Juice</option>
                <option value="Mango Juice">Mango Juice</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Number of Cartons Produced *
              </label>
              <input
                type="number"
                min="1"
                step="1"
                required
                placeholder="e.g. 60"
                value={cartonsProduced}
                onChange={(e) => {
                  setLocalError(null);
                  setCartonsProduced(e.target.value);
                }}
                className="w-full px-2.5 py-1.5 text-xs tabular-nums bg-white border border-slate-300 rounded font-bold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Pieces per Carton
              </label>
              <input
                type="text"
                readOnly
                value="24 Pieces"
                className="w-full px-2.5 py-1.5 text-xs tabular-nums bg-slate-100 border border-slate-300 rounded text-slate-700 font-semibold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Total Pieces (Auto-Calculated)
              </label>
              <input
                type="text"
                readOnly
                value={`${calculatedTotalPieces.toLocaleString()} Pieces`}
                className="w-full px-2.5 py-1.5 text-xs tabular-nums bg-emerald-50 border border-emerald-300 rounded text-emerald-900 font-bold"
              />
            </div>
          </div>

          {/* Step 3: Actual Material Consumption Table */}
          <div className="border border-slate-200 rounded overflow-hidden">
            <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Actual Material Consumption ({juiceType})
                </span>
                <span className="text-[11px] text-slate-500 ml-2">
                  Select materials from the 27-item master list and enter actual quantity consumed
                </span>
              </div>
              <button
                type="button"
                onClick={addMaterialRow}
                disabled={state.raw_materials.length === 0}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" /> Add Material Row
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/50">
                    <th className="py-2 px-3">Raw Material *</th>
                    <th className="py-2 px-3 text-right">Available Stock</th>
                    <th className="py-2 px-3">Quantity Consumed *</th>
                    <th className="py-2 px-3">Unit *</th>
                    <th className="py-2 px-3 text-right">Stock Deduction (Base Unit)</th>
                    <th className="py-2 px-3 text-right">Remaining Stock</th>
                    <th className="py-2 px-3 text-center">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rows.map((row, idx) => {
                    const rm = state.raw_materials.find((m) => m.id === row.raw_material_id);
                    const canonicalUnit = rm ? normalizeUnitCode(String(rm.unit)) : 'KG';
                    const allowedUnits: RawMaterialUnit[] =
                      rm?.allowed_units && rm.allowed_units.length > 0
                        ? (rm.allowed_units.map((u) => normalizeUnitCode(String(u))) as RawMaterialUnit[])
                        : [canonicalUnit];
                    const enteredNum = Number(row.entered_quantity || 0);
                    const converted =
                      rm && enteredNum > 0
                        ? previewConvertToBaseUnit(
                            enteredNum,
                            row.entered_unit,
                            canonicalUnit,
                            rm.box_to_piece_factor
                          )
                        : 0;
                    const projectedRemaining =
                      rm && converted !== null
                        ? Number((rm.current_stock - converted).toFixed(4))
                        : null;

                    return (
                      <tr key={idx}>
                        <td className="py-1.5 px-3">
                          <select
                            value={row.raw_material_id}
                            onChange={(e) => {
                              const selected = state.raw_materials.find(
                                (m) => m.id === e.target.value
                              );
                              const defaultUnit = normalizeUnitCode(
                                String(selected?.unit || 'KG')
                              );
                              updateRow(idx, {
                                raw_material_id: e.target.value,
                                entered_unit: defaultUnit,
                              });
                            }}
                            className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded font-medium"
                          >
                            <option value="">Select Material</option>
                            {state.raw_materials.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name} (Available: {m.current_stock}{' '}
                                {String(m.unit).toUpperCase()})
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="py-1.5 px-3 text-right tabular-nums text-slate-700 font-semibold">
                          {rm ? `${rm.current_stock} ${canonicalUnit}` : '—'}
                        </td>

                        <td className="py-1.5 px-3">
                          <input
                            type="number"
                            step="any"
                            min="0.0001"
                            required
                            placeholder="Enter quantity"
                            value={row.entered_quantity}
                            onChange={(e) =>
                              updateRow(idx, { entered_quantity: e.target.value })
                            }
                            className="w-32 px-2 py-1 text-xs bg-white border border-slate-300 rounded tabular-nums font-semibold"
                          />
                        </td>

                        <td className="py-1.5 px-3">
                          <select
                            value={row.entered_unit}
                            onChange={(e) =>
                              updateRow(idx, {
                                entered_unit: e.target.value as RawMaterialUnit,
                              })
                            }
                            className="px-2 py-1 text-xs bg-white border border-slate-300 rounded font-medium"
                          >
                            {allowedUnits.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="py-1.5 px-3 text-right tabular-nums">
                          {converted === null ? (
                            <span className="text-red-600 font-semibold">
                              Configure Box/Piece Factor
                            </span>
                          ) : converted > 0 ? (
                            <span className="text-slate-800 font-semibold">
                              -{converted} {canonicalUnit}
                            </span>
                          ) : (
                            '0'
                          )}
                        </td>

                        <td className="py-1.5 px-3 text-right tabular-nums font-bold">
                          {projectedRemaining === null ? (
                            '—'
                          ) : (
                            <span
                              className={
                                projectedRemaining < 0 ? 'text-red-600' : 'text-emerald-700'
                              }
                            >
                              {projectedRemaining} {canonicalUnit}
                            </span>
                          )}
                        </td>

                        <td className="py-1.5 px-3 text-center">
                          {rows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeRow(idx)}
                              className="p-1 text-slate-400 hover:text-red-600"
                              title="Remove row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Step 4: Review Production Summary & Confirm */}
          <div className="bg-slate-50 border border-slate-200 rounded p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-xs text-slate-700 space-y-0.5">
              <div className="font-bold text-slate-900">
                Production Summary Preview: {juiceType}
              </div>
              <div>
                Cartons: <strong>{validCartons}</strong> × 24 Pieces ={' '}
                <strong className="text-emerald-800">
                  {calculatedTotalPieces.toLocaleString()} Total Pieces
                </strong>{' '}
                | Consumed Materials:{' '}
                <strong>
                  {rows.filter((r) => r.raw_material_id && Number(r.entered_quantity) > 0).length}
                </strong>
              </div>
            </div>

            <div className="flex flex-1 max-w-md items-center gap-2">
              <input
                type="text"
                placeholder="Optional production notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
              />
              <button
                type="submit"
                disabled={busy || stockValidation.shortages.length > 0}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded disabled:opacity-50 shrink-0"
              >
                {busy ? 'Confirming...' : 'Confirm Production'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Material Consumption Register (When in CONSUMPTION view) */}
      {showConsumptionRegister && (
        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Material Consumption Ledger
            </h3>
          </div>
          {state.production_batches.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No material consumption records yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Production Ref</th>
                    <th className="py-2 px-3">Juice Type</th>
                    <th className="py-2 px-3">Manager</th>
                    <th className="py-2 px-3">Raw Material</th>
                    <th className="py-2 px-3 text-right">Entered Quantity</th>
                    <th className="py-2 px-3 text-right">Base Stock Deduction</th>
                    <th className="py-2 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {state.production_batches.flatMap((b) =>
                    b.material_usage.map((u, idx) => (
                      <tr key={`${b.id}-${idx}`} className="hover:bg-slate-50">
                        <td className="py-2 px-3 tabular-nums text-slate-600">
                          {b.production_date}
                        </td>
                        <td className="py-2 px-3 tabular-nums font-semibold text-slate-900">
                          {b.batch_number}
                        </td>
                        <td className="py-2 px-3 text-slate-800 font-medium">
                          {b.juice_type || b.product_name}
                        </td>
                        <td className="py-2 px-3 text-slate-700">
                          {b.submitted_by_name || b.created_by_name || 'Manager'}
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-900">
                          {u.raw_material_name}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {u.entered_quantity ?? u.quantity_entered ?? u.actual_quantity}{' '}
                          {u.entered_unit ?? u.unit_entered ?? u.unit}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums font-bold text-slate-800">
                          -{u.actual_quantity} {u.unit}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
                              b.is_reversed || b.status === 'REVERSED'
                                ? 'bg-red-50 text-red-800 border-red-200'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}
                          >
                            {b.is_reversed || b.status === 'REVERSED' ? 'REVERSED' : 'CONFIRMED'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Production History Table with Filters */}
      {showHistoryTable && (
        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Production History ({filteredBatches.length})
            </h3>

            <div className="flex flex-wrap items-center gap-2 no-print">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  placeholder="Search ref, manager..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-2.5 py-1 text-xs bg-white border border-slate-300 rounded"
                />
              </div>

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

              {isOwner && (
                <select
                  value={managerFilter}
                  onChange={(e) => setManagerFilter(e.target.value)}
                  className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded font-medium"
                >
                  <option value="ALL">All Managers</option>
                  <option value="Kamran Bhai">Kamran Bhai</option>
                  <option value="Imran Bhai">Imran Bhai</option>
                </select>
              )}

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded"
              >
                <option value="ALL">All Statuses</option>
                <option value="CONFIRMED">CONFIRMED</option>
                <option value="REVERSED">REVERSED</option>
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

              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
            </div>
          </div>

          {filteredBatches.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No production records match the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2 px-3">Production Date</th>
                    <th className="py-2 px-3">Production Reference</th>
                    <th className="py-2 px-3">Juice Type</th>
                    <th className="py-2 px-3 text-right">Cartons Produced</th>
                    <th className="py-2 px-3 text-right">Total Pieces (×24)</th>
                    <th className="py-2 px-3">Manager</th>
                    <th className="py-2 px-3">Submission Time</th>
                    <th className="py-2 px-3 text-center">Status</th>
                    <th className="py-2 px-3 text-right no-print">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredBatches.map((batch) => {
                    const pieces =
                      batch.total_pieces ??
                      batch.actual_bottles ??
                      Math.round(batch.actual_cartons * PIECES_PER_CARTON);
                    const isReversed = Boolean(batch.is_reversed || batch.status === 'REVERSED');
                    const subTime = batch.submitted_at || batch.created_at;
                    const formattedTime = subTime
                      ? new Date(subTime).toLocaleString('en-PK', {
                          year: 'numeric',
                          month: 'short',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : batch.production_date;

                    const canReverseOrCorrect =
                      !isReversed &&
                      (isOwner ||
                        batch.created_by === actor.id ||
                        batch.submitted_by === actor.id ||
                        batch.submitted_by_id === actor.id);

                    return (
                      <tr
                        key={batch.id}
                        className={`hover:bg-slate-50 ${
                          isReversed ? 'bg-slate-50/70 text-slate-500' : ''
                        }`}
                      >
                        <td className="py-2 px-3 tabular-nums text-slate-700 font-medium">
                          {batch.production_date}
                        </td>
                        <td className="py-2 px-3 tabular-nums font-bold text-slate-900">
                          {batch.batch_number}
                          {batch.corrects_batch_id && (
                            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-blue-50 text-blue-800 border border-blue-200 rounded">
                              Correction
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-900">
                          {batch.juice_type || batch.product_name}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums font-bold text-slate-900">
                          {batch.actual_cartons.toLocaleString()} Cartons
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums font-bold text-emerald-800">
                          {pieces.toLocaleString()} Pieces
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-800">
                          {batch.submitted_by_name || batch.created_by_name || 'Manager'}
                        </td>
                        <td className="py-2 px-3 tabular-nums text-slate-600">{formattedTime}</td>
                        <td className="py-2 px-3 text-center">
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
                              isReversed
                                ? 'bg-red-50 text-red-800 border-red-200'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}
                          >
                            {isReversed ? 'REVERSED' : 'CONFIRMED'}
                          </span>
                          {isReversed && batch.reversal_reason && (
                            <div className="text-[10px] text-red-700 mt-0.5 max-w-[160px] truncate">
                              Reason: {batch.reversal_reason}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right space-x-1.5 whitespace-nowrap no-print">
                          <button
                            type="button"
                            onClick={() => setActiveReportBatch(batch)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded"
                          >
                            <FileText className="w-3 h-3" /> Report &amp; Details
                          </button>

                          {canReverseOrCorrect && (
                            <button
                              type="button"
                              onClick={() => openCorrectionModal(batch)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded"
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

      {/* Daily Production Report Modal (Printable Official Report) */}
      {activeReportBatch && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded max-w-2xl w-full p-6 shadow-xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 no-print">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                Official Daily Production Report
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-[#0B192C] hover:bg-slate-800 rounded"
                >
                  <Printer className="w-3.5 h-3.5" /> Print Report
                </button>
                <button
                  type="button"
                  onClick={() => setActiveReportBatch(null)}
                  className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Printable Report Body */}
            <div className="border border-slate-300 rounded p-5 space-y-4 bg-white">
              <div className="border-b border-slate-300 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="text-sm font-bold tracking-tight text-slate-900">
                    FRUITY FUN JUICE FACTORY
                  </div>
                  <div className="text-xs font-semibold text-slate-600 mt-0.5">
                    Daily Production Report
                  </div>
                </div>
                <div className="text-xs text-right tabular-nums">
                  <div className="font-bold text-slate-900">
                    Ref: {activeReportBatch.batch_number}
                  </div>
                  <div className="text-slate-500">
                    Submitted:{' '}
                    {new Date(
                      activeReportBatch.submitted_at || activeReportBatch.created_at
                    ).toLocaleString('en-PK')}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-3 rounded border border-slate-200">
                <div>
                  <div className="text-slate-500">Date</div>
                  <div className="font-bold text-slate-900 tabular-nums">
                    {activeReportBatch.production_date}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Manager</div>
                  <div className="font-bold text-slate-900">
                    {activeReportBatch.submitted_by_name ||
                      activeReportBatch.created_by_name ||
                      'Production Manager'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Product</div>
                  <div className="font-bold text-slate-900">
                    {activeReportBatch.juice_type || activeReportBatch.product_name}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Cartons Produced</div>
                  <div className="font-bold text-slate-900 tabular-nums">
                    {activeReportBatch.actual_cartons.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Pieces per Carton</div>
                  <div className="font-bold text-slate-900 tabular-nums">24</div>
                </div>
                <div>
                  <div className="text-slate-500">Total Pieces</div>
                  <div className="font-bold text-emerald-800 tabular-nums">
                    {(
                      activeReportBatch.total_pieces ??
                      activeReportBatch.actual_bottles ??
                      activeReportBatch.actual_cartons * PIECES_PER_CARTON
                    ).toLocaleString()}
                  </div>
                </div>
              </div>

              {activeReportBatch.is_reversed && (
                <div className="p-2.5 bg-red-50 border border-red-300 rounded text-xs text-red-900">
                  <strong>REVERSED RECORD:</strong> Reversed by{' '}
                  {activeReportBatch.reversed_by_name || 'Authorized User'} on{' '}
                  {activeReportBatch.reversed_at
                    ? new Date(activeReportBatch.reversed_at).toLocaleString('en-PK')
                    : '—'}
                  . Reason: <strong>{activeReportBatch.reversal_reason}</strong>
                </div>
              )}

              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
                  Material Consumption
                </div>
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="py-2 px-3">Material Name</th>
                        <th className="py-2 px-3 text-right">Quantity Consumed</th>
                        <th className="py-2 px-3">Unit</th>
                        <th className="py-2 px-3 text-right">Base Stock Deduction</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {activeReportBatch.material_usage.map((u, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-semibold text-slate-900">
                            {u.raw_material_name}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums font-bold text-slate-900">
                            {u.entered_quantity ?? u.quantity_entered ?? u.actual_quantity}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-700">
                            {u.entered_unit ?? u.unit_entered ?? u.unit}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-600">
                            {u.actual_quantity} {u.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {activeReportBatch.remarks && (
                <div className="text-xs text-slate-600 border-t border-slate-200 pt-2">
                  <strong>Notes:</strong> {activeReportBatch.remarks}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Authorized Production Correction / Reversal Modal */}
      {correctingBatch && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 no-print">
          <form
            onSubmit={handleExecuteCorrectionOrReversal}
            className="bg-white border border-slate-300 rounded max-w-2xl w-full p-5 shadow-xl space-y-4 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Authorized Production Correction / Reversal — {correctingBatch.batch_number}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Original Record is preserved for audit trail. Stock movements are reversed atomically.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCorrectingBatch(null)}
                className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 rounded"
              >
                Cancel
              </button>
            </div>

            {correctionError && (
              <div className="p-2.5 bg-red-50 border border-red-300 rounded text-xs text-red-900 font-medium whitespace-pre-line">
                {correctionError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Workflow Action *
                </label>
                <select
                  value={correctionMode}
                  onChange={(e) =>
                    setCorrectionMode(e.target.value as 'REVERSE_ONLY' | 'REPLACE')
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded"
                >
                  <option value="REPLACE">
                    Reverse &amp; Replace with Corrected Quantities
                  </option>
                  <option value="REVERSE_ONLY">
                    Reverse Original Batch Only (Restore Raw Materials)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Correction / Reversal Reason *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter mandatory reason for audit log"
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                />
              </div>
            </div>

            {correctionMode === 'REPLACE' && (
              <div className="space-y-3 border-t border-slate-200 pt-3">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Corrected Replacement Production Details
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Production Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={corrDate}
                      onChange={(e) => setCorrDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Juice Type *
                    </label>
                    <select
                      value={corrJuiceType}
                      onChange={(e) => setCorrJuiceType(e.target.value as JuiceType)}
                      className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded"
                    >
                      <option value="Apple Juice">Apple Juice</option>
                      <option value="Mango Juice">Mango Juice</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Corrected Cartons (×24 Pcs) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={corrCartons}
                      onChange={(e) => setCorrCartons(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-bold tabular-nums bg-white border border-slate-300 rounded"
                    />
                  </div>
                </div>

                <div className="border border-slate-200 rounded overflow-hidden">
                  <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">
                      Corrected Material Consumption
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const first = state.raw_materials[0];
                        setCorrRows((prev) => [
                          ...prev,
                          {
                            raw_material_id: first?.id || '',
                            entered_quantity: '',
                            entered_unit: normalizeUnitCode(String(first?.unit || 'KG')),
                          },
                        ]);
                      }}
                      className="px-2 py-0.5 text-xs font-semibold bg-white border border-slate-300 rounded"
                    >
                      + Add Row
                    </button>
                  </div>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                        <th className="py-1.5 px-2.5">Material</th>
                        <th className="py-1.5 px-2.5">Quantity</th>
                        <th className="py-1.5 px-2.5">Unit</th>
                        <th className="py-1.5 px-2.5"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {corrRows.map((cr, idx) => {
                        const rm = state.raw_materials.find((m) => m.id === cr.raw_material_id);
                        const allowed =
                          rm?.allowed_units && rm.allowed_units.length > 0
                            ? rm.allowed_units.map((u) => normalizeUnitCode(String(u)))
                            : [normalizeUnitCode(String(rm?.unit || 'KG'))];
                        return (
                          <tr key={idx}>
                            <td className="py-1.5 px-2.5">
                              <select
                                value={cr.raw_material_id}
                                onChange={(e) => {
                                  const sel = state.raw_materials.find(
                                    (m) => m.id === e.target.value
                                  );
                                  setCorrRows((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? {
                                            ...item,
                                            raw_material_id: e.target.value,
                                            entered_unit: normalizeUnitCode(
                                              String(sel?.unit || 'KG')
                                            ),
                                          }
                                        : item
                                    )
                                  );
                                }}
                                className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded"
                              >
                                {state.raw_materials.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-1.5 px-2.5">
                              <input
                                type="number"
                                step="any"
                                min="0.0001"
                                required
                                value={cr.entered_quantity}
                                onChange={(e) =>
                                  setCorrRows((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? { ...item, entered_quantity: e.target.value }
                                        : item
                                    )
                                  )
                                }
                                className="w-28 px-2 py-1 text-xs bg-white border border-slate-300 rounded tabular-nums font-semibold"
                              />
                            </td>
                            <td className="py-1.5 px-2.5">
                              <select
                                value={cr.entered_unit}
                                onChange={(e) =>
                                  setCorrRows((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? {
                                            ...item,
                                            entered_unit: e.target.value as RawMaterialUnit,
                                          }
                                        : item
                                    )
                                  )
                                }
                                className="px-2 py-1 text-xs bg-white border border-slate-300 rounded"
                              >
                                {allowed.map((u) => (
                                  <option key={u} value={u}>
                                    {u}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-1.5 px-2.5 text-center">
                              {corrRows.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCorrRows((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                  className="text-slate-400 hover:text-red-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setCorrectingBatch(null)}
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
                  : correctionMode === 'REPLACE'
                  ? 'Confirm Reversal & Replacement'
                  : 'Confirm Batch Reversal'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
