'use client';

import React, { useState, useMemo } from 'react';
import type { ErpDatabaseState } from '@/lib/db/store';
import type { UserProfile, MaterialUnit, RawMaterial } from '@juice-erp/shared-types';
import {
  Search,
  Printer,
  AlertTriangle,
  SlidersHorizontal,
  CheckCircle2,
  Plus,
  Eye,
  PackagePlus,
  Settings2,
  X,
} from 'lucide-react';

const SUPPORTED_UNITS: MaterialUnit[] = [
  'KG',
  'GRAM',
  'LITRE',
  'ML',
  'BOX',
  'PIECE',
  'PACKET',
  'CARTONS',
];

interface Props {
  state: ErpDatabaseState;
  actor: UserProfile;
  busy: boolean;
  runAction: (action: string, payload: Record<string, any>, msg?: string) => Promise<any>;
  mode: 'RAW_MATERIALS' | 'PURCHASES' | 'SUPPLIERS' | 'STOCK_LEDGER';
}

export function RawMaterialAndStockLedgerModule({
  state,
  actor,
  busy,
  runAction,
  mode,
}: Props) {
  const isOwner = actor.role === 'OWNER';
  const isManager = actor.role === 'PRODUCTION_MANAGER';
  const today = new Date().toISOString().split('T')[0];

  // Active Owner action panel: 'NONE' | 'OPENING_STOCK' | 'ADJUSTMENT' | 'THRESHOLD'
  const [ownerPanel, setOwnerPanel] = useState<
    'NONE' | 'OPENING_STOCK' | 'ADJUSTMENT' | 'THRESHOLD'
  >('NONE');

  // Detail modal / drawer for a specific material
  const [inspectMaterialId, setInspectMaterialId] = useState<string | null>(null);

  // 1. Owner Opening Stock Entry state
  const [openMatId, setOpenMatId] = useState<string>(state.raw_materials[0]?.id || 'rm-01');
  const [openQty, setOpenQty] = useState<string>('');
  const [openUnit, setOpenUnit] = useState<MaterialUnit>('KG');
  const [openDate, setOpenDate] = useState<string>(today);
  const [openNotes, setOpenNotes] = useState<string>('');

  // 2. Owner Stock Adjustment state
  const [adjMaterialId, setAdjMaterialId] = useState<string>(
    state.raw_materials[0]?.id || 'rm-01'
  );
  const [adjType, setAdjType] = useState<'INCREASE' | 'DECREASE'>('INCREASE');
  const [adjQuantity, setAdjQuantity] = useState<string>('');
  const [adjUnit, setAdjUnit] = useState<MaterialUnit>('KG');
  const [adjReason, setAdjReason] = useState<string>('');
  const [adjDate, setAdjDate] = useState<string>(today);

  // 3. Owner Minimum Threshold & Box-to-Piece Conversion Config state
  const [cfgMaterialId, setCfgMaterialId] = useState<string>(
    state.raw_materials[0]?.id || 'rm-01'
  );
  const [cfgMinStock, setCfgMinStock] = useState<string>('0');
  const [cfgBoxFactor, setCfgBoxFactor] = useState<string>('');

  // 4. Manager Cash Purchase Form state
  const [purMaterialId, setPurMaterialId] = useState<string>(
    state.raw_materials[0]?.id || 'rm-03'
  );
  const [purQuantity, setPurQuantity] = useState<string>('');
  const [purUnit, setPurUnit] = useState<MaterialUnit>('KG');
  const [purTotalAmount, setPurTotalAmount] = useState<string>('');
  const [purDate, setPurDate] = useState<string>(today);
  const [purDescription, setPurDescription] = useState<string>('');

  // 5. Inventory Table Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LOW_STOCK' | 'OUT_OF_STOCK'>('ALL');

  // 6. Stock Movement Ledger Filters
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Manager's current available cash balance
  const myCashBalance = useMemo(() => {
    if (!isManager) return 0;
    const acc = (state.manager_cash_accounts || []).find((a) => a.manager_id === actor.id);
    return acc?.available_balance || 0;
  }, [isManager, state.manager_cash_accounts, actor.id]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const m of state.raw_materials) {
      if (m.category) set.add(m.category);
    }
    return Array.from(set);
  }, [state.raw_materials]);

  // Helper to get allowed units for a selected material
  const getUnitsForMaterial = (mat?: RawMaterial): MaterialUnit[] => {
    if (!mat) return SUPPORTED_UNITS;
    if (mat.allowed_units && mat.allowed_units.length > 0) {
      return mat.allowed_units.map((u) => String(u).toUpperCase() as MaterialUnit);
    }
    return [String(mat.unit).toUpperCase() as MaterialUnit];
  };

  // Filtered 27 Raw Materials
  const filteredMaterials = useMemo(() => {
    return state.raw_materials.filter((rm) => {
      if (categoryFilter !== 'ALL' && rm.category !== categoryFilter) return false;
      const isOut = rm.current_stock <= 0;
      const isLow = rm.minimum_stock_level > 0 && rm.current_stock <= rm.minimum_stock_level;
      if (statusFilter === 'OUT_OF_STOCK' && !isOut) return false;
      if (statusFilter === 'LOW_STOCK' && !isLow) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          rm.name.toLowerCase().includes(q) ||
          rm.code.toLowerCase().includes(q) ||
          rm.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [state.raw_materials, categoryFilter, statusFilter, searchTerm]);

  // Filtered Stock Movements Ledger
  const filteredLedger = useMemo(() => {
    return (state.stock_ledger || []).filter((entry) => {
      if (movementTypeFilter !== 'ALL') {
        if (
          movementTypeFilter === 'OPENING_STOCK' &&
          entry.transaction_type !== 'OPENING_STOCK' &&
          entry.transaction_type !== 'OPENING_BALANCE'
        ) {
          return false;
        } else if (
          movementTypeFilter === 'PURCHASE' &&
          entry.transaction_type !== 'PURCHASE' &&
          entry.transaction_type !== 'PURCHASE_RECEIPT'
        ) {
          return false;
        } else if (
          movementTypeFilter !== 'OPENING_STOCK' &&
          movementTypeFilter !== 'PURCHASE' &&
          entry.transaction_type !== movementTypeFilter
        ) {
          return false;
        }
      }
      if (dateFrom && entry.date < dateFrom) return false;
      if (dateTo && entry.date > dateTo) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          entry.material_name.toLowerCase().includes(q) ||
          entry.reference_number.toLowerCase().includes(q) ||
          (entry.entered_by_name || entry.entered_by || '').toLowerCase().includes(q) ||
          (entry.notes || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [state.stock_ledger, movementTypeFilter, dateFrom, dateTo, searchTerm]);

  const inspectedMaterial = useMemo(
    () => state.raw_materials.find((m) => m.id === inspectMaterialId) || null,
    [state.raw_materials, inspectMaterialId]
  );

  const inspectedMovements = useMemo(() => {
    if (!inspectedMaterial) return [];
    return (state.stock_ledger || []).filter(
      (e) =>
        e.material_id === inspectedMaterial.id ||
        e.raw_material_id === inspectedMaterial.id ||
        e.material_name.toLowerCase() === inspectedMaterial.name.toLowerCase()
    );
  }, [state.stock_ledger, inspectedMaterial]);

  // Handlers
  const handleSaveOpeningStock = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetMat = state.raw_materials.find((m) => m.id === openMatId);
    const res = await runAction(
      'SET_RAW_MATERIAL_OPENING_STOCK',
      {
        material_id: openMatId,
        opening_quantity: Number(openQty),
        unit: openUnit,
        opening_date: openDate,
        notes: openNotes.trim() || undefined,
      },
      `Opening stock saved for ${targetMat?.name || 'material'}: +${openQty} ${openUnit}.`
    );
    if (res?.ok) {
      setOpenQty('');
      setOpenNotes('');
      setOwnerPanel('NONE');
    }
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetMat = state.raw_materials.find((m) => m.id === adjMaterialId);
    const res = await runAction(
      'ADMIN_ADJUST_RAW_MATERIAL_STOCK',
      {
        material_id: adjMaterialId,
        adjustment_type: adjType,
        adjustment_quantity: Number(adjQuantity),
        unit: adjUnit,
        reason: adjReason.trim(),
        adjustment_date: adjDate,
      },
      `Stock adjustment saved for ${targetMat?.name || 'material'} (${adjType} ${adjQuantity} ${adjUnit}).`
    );
    if (res?.ok) {
      setAdjQuantity('');
      setAdjReason('');
      setOwnerPanel('NONE');
    }
  };

  const handleSaveThresholdConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetMat = state.raw_materials.find((m) => m.id === cfgMaterialId);
    const res = await runAction(
      'CONFIGURE_RAW_MATERIAL_SETTINGS',
      {
        material_id: cfgMaterialId,
        minimum_stock_level: Number(cfgMinStock || 0),
        box_to_piece_factor: cfgBoxFactor.trim() ? Number(cfgBoxFactor) : null,
      },
      `Updated threshold & unit settings for ${targetMat?.name || 'material'}.`
    );
    if (res?.ok) {
      setOwnerPanel('NONE');
    }
  };

  const handleManagerRecordPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetMat = state.raw_materials.find((m) => m.id === purMaterialId);
    if (!targetMat) return;
    const res = await runAction(
      'RECORD_MANAGER_CASH_PURCHASE',
      {
        material_id: targetMat.id,
        material_name: targetMat.name,
        category: targetMat.category,
        quantity: Number(purQuantity),
        unit: purUnit,
        total_amount: Number(purTotalAmount),
        purchase_date: purDate,
        description: purDescription.trim() || undefined,
        idempotency_key: `INV-PUR-${actor.id}-${Date.now()}`,
      },
      `Purchase saved: +${purQuantity} ${purUnit} ${targetMat.name} (Rs. ${Number(purTotalAmount).toLocaleString()} deducted from your cash).`
    );
    if (res?.ok) {
      setPurQuantity('');
      setPurTotalAmount('');
      setPurDescription('');
    }
  };

  const lowStockCount = useMemo(
    () =>
      state.raw_materials.filter(
        (m) => m.minimum_stock_level > 0 && m.current_stock <= m.minimum_stock_level
      ).length,
    [state.raw_materials]
  );
  const outOfStockCount = useMemo(
    () => state.raw_materials.filter((m) => m.current_stock <= 0).length,
    [state.raw_materials]
  );

  return (
    <div className="space-y-4">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded px-4 py-2.5">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            {mode === 'STOCK_LEDGER'
              ? 'Raw Material Stock Movement Ledger'
              : mode === 'PURCHASES'
              ? 'Raw Material Purchases'
              : 'Raw Material Inventory Master (27 Factory Materials)'}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          {isOwner && (
            <>
              <button
                type="button"
                onClick={() =>
                  setOwnerPanel(ownerPanel === 'OPENING_STOCK' ? 'NONE' : 'OPENING_STOCK')
                }
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded border ${
                  ownerPanel === 'OPENING_STOCK'
                    ? 'bg-[#0B192C] text-white border-[#0B192C]'
                    : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300'
                }`}
              >
                <PackagePlus className="w-3.5 h-3.5" />
                Enter Opening Stock
              </button>

              <button
                type="button"
                onClick={() =>
                  setOwnerPanel(ownerPanel === 'ADJUSTMENT' ? 'NONE' : 'ADJUSTMENT')
                }
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded border ${
                  ownerPanel === 'ADJUSTMENT'
                    ? 'bg-[#0B192C] text-white border-[#0B192C]'
                    : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Stock Adjustment
              </button>

              <button
                type="button"
                onClick={() =>
                  setOwnerPanel(ownerPanel === 'THRESHOLD' ? 'NONE' : 'THRESHOLD')
                }
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded border ${
                  ownerPanel === 'THRESHOLD'
                    ? 'bg-[#0B192C] text-white border-[#0B192C]'
                    : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300'
                }`}
              >
                <Settings2 className="w-3.5 h-3.5" />
                Min Stock &amp; Units
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded"
          >
            <Printer className="w-3.5 h-3.5" />
            Print
          </button>
        </div>
      </div>

      {/* OWNER PANEL 1: OPENING STOCK ENTRY */}
      {isOwner && ownerPanel === 'OPENING_STOCK' && (
        <div className="bg-white border border-slate-300 rounded p-4 no-print">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Owner Opening Stock Entry
              </div>
              <div className="text-[11px] text-slate-500">
                Opening stock can only be entered once per material. Subsequent corrections require a Stock Adjustment.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOwnerPanel('NONE')}
              className="text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form
            onSubmit={handleSaveOpeningStock}
            className="grid grid-cols-1 md:grid-cols-6 gap-3"
          >
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Select Material *
              </label>
              <select
                required
                value={openMatId}
                onChange={(e) => {
                  setOpenMatId(e.target.value);
                  const found = state.raw_materials.find((m) => m.id === e.target.value);
                  if (found) {
                    setOpenUnit(String(found.unit).toUpperCase() as MaterialUnit);
                  }
                }}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded font-medium"
              >
                {state.raw_materials.map((m) => (
                  <option key={m.id} value={m.id} disabled={Boolean(m.opening_stock_set)}>
                    {m.name} ({m.unit}){m.opening_stock_set ? ' — [Opening Stock Set]' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Opening Quantity *
              </label>
              <input
                type="number"
                step="any"
                min="0.001"
                required
                placeholder="0"
                value={openQty}
                onChange={(e) => setOpenQty(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums font-semibold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Unit *
              </label>
              <select
                value={openUnit}
                onChange={(e) => setOpenUnit(e.target.value as MaterialUnit)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
              >
                {getUnitsForMaterial(
                  state.raw_materials.find((m) => m.id === openMatId)
                ).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Opening Date *
              </label>
              <input
                type="date"
                required
                value={openDate}
                onChange={(e) => setOpenDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={busy}
                className="w-full py-1.5 px-3 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-semibold text-xs rounded"
              >
                Save Opening Stock
              </button>
            </div>
          </form>
        </div>
      )}

      {/* OWNER PANEL 2: AUTHORIZED STOCK ADJUSTMENT */}
      {isOwner && ownerPanel === 'ADJUSTMENT' && (
        <div className="bg-white border border-slate-300 rounded p-4 no-print">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Owner Authorized Stock Adjustment
              </div>
              <div className="text-[11px] text-slate-500">
                Record physical inventory increases or decreases with a mandatory audit reason.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOwnerPanel('NONE')}
              className="text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form
            onSubmit={handleSaveAdjustment}
            className="grid grid-cols-1 md:grid-cols-7 gap-2.5"
          >
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Material *
              </label>
              <select
                required
                value={adjMaterialId}
                onChange={(e) => {
                  setAdjMaterialId(e.target.value);
                  const found = state.raw_materials.find((m) => m.id === e.target.value);
                  if (found) setAdjUnit(String(found.unit).toUpperCase() as MaterialUnit);
                }}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
              >
                {state.raw_materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} (Avail: {m.current_stock} {m.unit})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Adjustment Type *
              </label>
              <select
                value={adjType}
                onChange={(e) => setAdjType(e.target.value as 'INCREASE' | 'DECREASE')}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded font-semibold"
              >
                <option value="INCREASE">Increase (+)</option>
                <option value="DECREASE">Decrease (-)</option>
              </select>
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
                placeholder="0"
                value={adjQuantity}
                onChange={(e) => setAdjQuantity(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums font-semibold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Unit *
              </label>
              <select
                value={adjUnit}
                onChange={(e) => setAdjUnit(e.target.value as MaterialUnit)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
              >
                {getUnitsForMaterial(
                  state.raw_materials.find((m) => m.id === adjMaterialId)
                ).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Reason *
              </label>
              <input
                type="text"
                required
                placeholder="Physical count reason"
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={busy}
                className="w-full py-1.5 px-3 bg-[#0B192C] hover:bg-slate-800 text-white font-semibold text-xs rounded"
              >
                Apply Adjustment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* OWNER PANEL 3: CONFIGURE MINIMUM STOCK THRESHOLD & BOX-TO-PIECE CONVERSION */}
      {isOwner && ownerPanel === 'THRESHOLD' && (
        <div className="bg-white border border-slate-300 rounded p-4 no-print">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Configure Minimum Stock Threshold &amp; Box-to-Piece Conversion
              </div>
              <div className="text-[11px] text-slate-500">
                Set minimum stock alert level (0 = no alert) and optional pieces-per-box ratio for Box/Piece materials (mask, cap, gluffs).
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOwnerPanel('NONE')}
              className="text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form
            onSubmit={handleSaveThresholdConfig}
            className="grid grid-cols-1 md:grid-cols-5 gap-3"
          >
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Select Material *
              </label>
              <select
                required
                value={cfgMaterialId}
                onChange={(e) => {
                  setCfgMaterialId(e.target.value);
                  const found = state.raw_materials.find((m) => m.id === e.target.value);
                  if (found) {
                    setCfgMinStock(String(found.minimum_stock_level || 0));
                    setCfgBoxFactor(
                      found.box_to_piece_factor ? String(found.box_to_piece_factor) : ''
                    );
                  }
                }}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded font-medium"
              >
                {state.raw_materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} (Unit: {m.unit} | Min: {m.minimum_stock_level || 0})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Minimum Stock Alert Threshold
              </label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={cfgMinStock}
                onChange={(e) => setCfgMinStock(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Pieces per Box (Optional)
              </label>
              <input
                type="number"
                step="any"
                min="1"
                placeholder="Not configured"
                value={cfgBoxFactor}
                onChange={(e) => setCfgBoxFactor(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={busy}
                className="w-full py-1.5 px-3 bg-[#0B192C] hover:bg-slate-800 text-white font-semibold text-xs rounded"
              >
                Save Configuration
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MANAGER PURCHASE FORM (Integrated with Phase 1 Manager Cash Ledger) */}
      {isManager && (mode === 'RAW_MATERIALS' || mode === 'PURCHASES') && (
        <div className="bg-white border border-slate-200 rounded p-4 no-print">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2 mb-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Record Raw Material Purchase ({actor.full_name})
              </div>
              <div className="text-[11px] text-slate-500">
                Deducts from your available cash balance and adds quantity to factory inventory (no supplier required)
              </div>
            </div>
            <div className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded text-xs font-bold text-emerald-800 tabular-nums">
              Your Available Cash: Rs. {myCashBalance.toLocaleString()}
            </div>
          </div>

          <form
            onSubmit={handleManagerRecordPurchase}
            className="grid grid-cols-1 md:grid-cols-6 gap-3"
          >
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Material *
              </label>
              <select
                required
                value={purMaterialId}
                onChange={(e) => {
                  setPurMaterialId(e.target.value);
                  const found = state.raw_materials.find((m) => m.id === e.target.value);
                  if (found) {
                    setPurUnit(String(found.unit).toUpperCase() as MaterialUnit);
                  }
                }}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded font-medium"
              >
                {state.raw_materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.current_stock} {m.unit})
                  </option>
                ))}
              </select>
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
                {getUnitsForMaterial(
                  state.raw_materials.find((m) => m.id === purMaterialId)
                ).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Total Purchase Amount (Rs.) *
              </label>
              <input
                type="number"
                step="any"
                min="1"
                required
                placeholder="e.g. 1500"
                value={purTotalAmount}
                onChange={(e) => setPurTotalAmount(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded tabular-nums font-semibold"
              />
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

            <div className="flex items-end">
              <button
                type="submit"
                disabled={busy || myCashBalance <= 0}
                className="w-full py-1.5 px-3 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-semibold text-xs rounded inline-flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                {busy ? 'Saving...' : 'Confirm Purchase'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MATERIAL DETAIL DRAWER / PANEL */}
      {inspectedMaterial && (
        <div className="bg-white border-2 border-[#0B192C] rounded p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Material Detail View — {inspectedMaterial.name} ({inspectedMaterial.code})
              </div>
              <div className="text-[11px] text-slate-500">
                Category: {inspectedMaterial.category} | Base Unit: {inspectedMaterial.unit} | Allowed Units:{' '}
                {(inspectedMaterial.allowed_units || [inspectedMaterial.unit]).join(' / ')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setInspectMaterialId(null)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
            >
              <X className="w-3.5 h-3.5" /> Close Detail View
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
              <div className="text-[11px] text-slate-500">Opening Stock</div>
              <div className="font-bold tabular-nums text-slate-900 mt-0.5">
                {inspectedMaterial.opening_stock || 0} {inspectedMaterial.unit}
              </div>
            </div>
            <div className="p-2.5 bg-emerald-50/60 border border-emerald-200 rounded">
              <div className="text-[11px] text-emerald-800">Total Purchased</div>
              <div className="font-bold tabular-nums text-emerald-700 mt-0.5">
                +{inspectedMaterial.stock_received || 0} {inspectedMaterial.unit}
              </div>
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
              <div className="text-[11px] text-slate-500">Total Consumed</div>
              <div className="font-bold tabular-nums text-slate-800 mt-0.5">
                -{inspectedMaterial.stock_consumed || 0} {inspectedMaterial.unit}
              </div>
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
              <div className="text-[11px] text-slate-500">Total Adjustments</div>
              <div className="font-bold tabular-nums text-slate-800 mt-0.5">
                {(inspectedMaterial.stock_adjusted || 0) > 0
                  ? `+${inspectedMaterial.stock_adjusted}`
                  : inspectedMaterial.stock_adjusted || 0}{' '}
                {inspectedMaterial.unit}
              </div>
            </div>
            <div className="p-2.5 bg-[#0B192C] text-white rounded">
              <div className="text-[11px] text-slate-300">Current Stock</div>
              <div className="font-bold tabular-nums text-white mt-0.5">
                {inspectedMaterial.current_stock} {inspectedMaterial.unit}
              </div>
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
              <div className="text-[11px] text-slate-500">Min Alert Threshold</div>
              <div className="font-bold tabular-nums text-slate-800 mt-0.5">
                {inspectedMaterial.minimum_stock_level > 0
                  ? `${inspectedMaterial.minimum_stock_level} ${inspectedMaterial.unit}`
                  : 'Not Configured'}
              </div>
            </div>
          </div>

          <div className="border border-slate-200 rounded overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-800">
              Complete Stock Movement History for {inspectedMaterial.name} ({inspectedMovements.length})
            </div>
            {inspectedMovements.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                No stock movements recorded yet for {inspectedMaterial.name}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                      <th className="py-1.5 px-2.5">Date &amp; Time</th>
                      <th className="py-1.5 px-2.5">Type</th>
                      <th className="py-1.5 px-2.5">Reference</th>
                      <th className="py-1.5 px-2.5 text-right">Previous</th>
                      <th className="py-1.5 px-2.5 text-right">Added (+)</th>
                      <th className="py-1.5 px-2.5 text-right">Deducted (-)</th>
                      <th className="py-1.5 px-2.5 text-right">Updated</th>
                      <th className="py-1.5 px-2.5">Created By</th>
                      <th className="py-1.5 px-2.5">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {inspectedMovements.map((m) => {
                      const prev = m.previous_stock ?? m.opening_quantity ?? 0;
                      const added =
                        m.quantity_added ??
                        (m.stock_received > 0
                          ? m.stock_received
                          : m.adjustment_quantity > 0
                          ? m.adjustment_quantity
                          : 0);
                      const deducted =
                        m.quantity_deducted ??
                        (m.quantity_consumed > 0
                          ? m.quantity_consumed
                          : m.adjustment_quantity < 0
                          ? Math.abs(m.adjustment_quantity)
                          : 0);
                      const updated = m.updated_stock ?? m.closing_quantity ?? 0;

                      return (
                        <tr key={m.id}>
                          <td className="py-1.5 px-2.5 tabular-nums text-slate-600">
                            {m.date}{' '}
                            <span className="text-[10px] text-slate-400">
                              {new Date(m.created_at).toLocaleTimeString()}
                            </span>
                          </td>
                          <td className="py-1.5 px-2.5 font-semibold text-slate-800">
                            {m.transaction_type.replace(/_/g, ' ')}
                          </td>
                          <td className="py-1.5 px-2.5 tabular-nums">{m.reference_number}</td>
                          <td className="py-1.5 px-2.5 text-right tabular-nums">
                            {prev} {m.unit}
                          </td>
                          <td className="py-1.5 px-2.5 text-right tabular-nums text-emerald-700 font-semibold">
                            {added > 0 ? `+${added}` : '0'}
                          </td>
                          <td className="py-1.5 px-2.5 text-right tabular-nums text-red-700 font-semibold">
                            {deducted > 0 ? `-${deducted}` : '0'}
                          </td>
                          <td className="py-1.5 px-2.5 text-right tabular-nums font-bold">
                            {updated} {m.unit}
                          </td>
                          <td className="py-1.5 px-2.5 text-slate-600">
                            {m.entered_by_name || m.entered_by}
                          </td>
                          <td className="py-1.5 px-2.5 text-slate-600">{m.notes || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 27 RAW MATERIALS INVENTORY MASTER TABLE */}
      {(mode === 'RAW_MATERIALS' || mode === 'STOCK_LEDGER') && (
        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Raw Material Inventory ({filteredMaterials.length} of {state.raw_materials.length})
              </h3>
              {lowStockCount > 0 && (
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300 rounded">
                  {lowStockCount} Low Stock Alert{lowStockCount > 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 no-print">
              <div className="relative w-52">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  placeholder="Search material name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1 text-xs bg-white border border-slate-300 rounded"
                />
              </div>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded"
              >
                <option value="ALL">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as 'ALL' | 'LOW_STOCK' | 'OUT_OF_STOCK')
                }
                className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded font-medium"
              >
                <option value="ALL">All Stock Statuses</option>
                <option value="LOW_STOCK">Low Stock Alerts ({lowStockCount})</option>
                <option value="OUT_OF_STOCK">Out of Stock ({outOfStockCount})</option>
              </select>
            </div>
          </div>

          {filteredMaterials.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No raw materials match the current search or filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2 px-3">Code</th>
                    <th className="py-2 px-3">Material Name</th>
                    <th className="py-2 px-3">Category</th>
                    <th className="py-2 px-3">Allowed Units</th>
                    <th className="py-2 px-3 text-right">Opening</th>
                    <th className="py-2 px-3 text-right">Purchased</th>
                    <th className="py-2 px-3 text-right">Consumed</th>
                    <th className="py-2 px-3 text-right">Adjusted</th>
                    <th className="py-2 px-3 text-right">Available Quantity</th>
                    <th className="py-2 px-3 text-center">Stock Status</th>
                    <th className="py-2 px-3">Last Updated</th>
                    <th className="py-2 px-3 text-right no-print">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredMaterials.map((rm) => {
                    const unitUpper = String(rm.unit).toUpperCase();
                    const allowedDisplay = (rm.allowed_units || [rm.unit])
                      .map((u) => String(u).toUpperCase())
                      .join(' / ');
                    const hasThreshold = rm.minimum_stock_level > 0;
                    const isLow = hasThreshold && rm.current_stock <= rm.minimum_stock_level;
                    const isOut = rm.current_stock <= 0;

                    return (
                      <tr key={rm.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 text-slate-500 tabular-nums">{rm.code}</td>
                        <td className="py-2 px-3 font-semibold text-slate-900">{rm.name}</td>
                        <td className="py-2 px-3 text-slate-600">{rm.category}</td>
                        <td className="py-2 px-3 text-slate-600 font-medium">{allowedDisplay}</td>
                        <td className="py-2 px-3 text-right text-slate-600 tabular-nums">
                          {rm.opening_stock ?? 0}
                        </td>
                        <td className="py-2 px-3 text-right text-emerald-700 font-medium tabular-nums">
                          +{rm.stock_received ?? 0}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-700 tabular-nums">
                          -{rm.stock_consumed ?? 0}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600 tabular-nums">
                          {(rm.stock_adjusted ?? 0) > 0
                            ? `+${rm.stock_adjusted}`
                            : rm.stock_adjusted ?? 0}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900 bg-slate-50/70 tabular-nums">
                          {rm.current_stock} {unitUpper}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {isLow ? (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-300 rounded"
                              title={`Available: ${rm.current_stock} ${unitUpper} | Min: ${rm.minimum_stock_level} ${unitUpper}`}
                            >
                              <AlertTriangle className="w-3 h-3" /> Low Stock (Min:{' '}
                              {rm.minimum_stock_level})
                            </span>
                          ) : isOut ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-300 rounded">
                              0 Stock
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                              <CheckCircle2 className="w-3 h-3" /> In Stock
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-500 tabular-nums whitespace-nowrap">
                          {rm.updated_at ? rm.updated_at.split('T')[0] : today}
                        </td>
                        <td className="py-2 px-3 text-right no-print">
                          <button
                            type="button"
                            onClick={() =>
                              setInspectMaterialId(inspectMaterialId === rm.id ? null : rm.id)
                            }
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded"
                          >
                            <Eye className="w-3 h-3" /> Details
                          </button>
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

      {/* PERMANENT STOCK MOVEMENT LEDGER TABLE */}
      {(mode === 'STOCK_LEDGER' || mode === 'RAW_MATERIALS') && (
        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Permanent Stock Movement Ledger ({filteredLedger.length})
            </h3>

            <div className="flex flex-wrap items-center gap-2 no-print">
              <select
                value={movementTypeFilter}
                onChange={(e) => setMovementTypeFilter(e.target.value)}
                className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded"
              >
                <option value="ALL">All Movement Types</option>
                <option value="OPENING_STOCK">Opening Stock</option>
                <option value="PURCHASE">Purchase</option>
                <option value="PRODUCTION_CONSUMPTION">Production Consumption</option>
                <option value="STOCK_ADJUSTMENT">Stock Adjustment</option>
                <option value="STOCK_CORRECTION">Stock Correction</option>
              </select>

              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-2 py-1 text-xs bg-white border border-slate-300 rounded tabular-nums"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2 py-1 text-xs bg-white border border-slate-300 rounded tabular-nums"
              />
            </div>
          </div>

          {filteredLedger.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No stock movement entries recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2 px-3">Date &amp; Time</th>
                    <th className="py-2 px-3">Material</th>
                    <th className="py-2 px-3">Movement Type</th>
                    <th className="py-2 px-3">Reference</th>
                    <th className="py-2 px-3 text-right">Previous Stock</th>
                    <th className="py-2 px-3 text-right">Qty Added (+)</th>
                    <th className="py-2 px-3 text-right">Qty Deducted (-)</th>
                    <th className="py-2 px-3 text-right">Updated Stock</th>
                    <th className="py-2 px-3">Created By</th>
                    <th className="py-2 px-3">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredLedger.map((row) => {
                    const prev = row.previous_stock ?? row.opening_quantity ?? 0;
                    const added =
                      row.quantity_added ??
                      (row.stock_received > 0
                        ? row.stock_received
                        : row.adjustment_quantity > 0
                        ? row.adjustment_quantity
                        : 0);
                    const deducted =
                      row.quantity_deducted ??
                      (row.quantity_consumed > 0
                        ? row.quantity_consumed
                        : row.adjustment_quantity < 0
                        ? Math.abs(row.adjustment_quantity)
                        : 0);
                    const updated = row.updated_stock ?? row.closing_quantity ?? 0;

                    return (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 text-slate-600 whitespace-nowrap tabular-nums">
                          <div>{row.date}</div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(row.created_at).toLocaleTimeString()}
                          </div>
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-900">
                          {row.material_name}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
                              row.transaction_type === 'PURCHASE' ||
                              row.transaction_type === 'PURCHASE_RECEIPT' ||
                              row.transaction_type === 'OPENING_STOCK' ||
                              row.transaction_type === 'OPENING_BALANCE'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : row.transaction_type === 'PRODUCTION_CONSUMPTION'
                                ? 'bg-slate-100 text-slate-700 border-slate-300'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            {row.transaction_type.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-800 tabular-nums">
                          {row.reference_number}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600 tabular-nums">
                          {prev} {row.unit}
                        </td>
                        <td className="py-2 px-3 text-right text-emerald-700 font-semibold tabular-nums">
                          {added > 0 ? `+${added} ${row.unit}` : '0'}
                        </td>
                        <td className="py-2 px-3 text-right text-red-700 font-semibold tabular-nums">
                          {deducted > 0 ? `-${deducted} ${row.unit}` : '0'}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900 bg-slate-50/70 tabular-nums">
                          {updated} {row.unit}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {row.entered_by_name || row.entered_by}
                        </td>
                        <td className="py-2 px-3 text-slate-600">{row.notes || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
