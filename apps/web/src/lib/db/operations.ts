import {
  readErpDatabase,
  withErpTransaction,
  appendAuditLog,
  createCleanProductionDatabase,
  createInitialSeedDatabase,
  writeErpDatabase,
  type ErpDatabaseState,
} from './store';
import { hashPasswordSecure } from '../auth/session';
import type {
  RoleName,
  UserProfile,
  ProductionBatch,
  ProductionStatus,
  FinishedGoodsInventory,
  Order,
  OrderStatus,
  DealerLedgerEntry,
  PaymentRecord,
  Expense,
  ParsedVoiceTransaction,
  MaterialUnit,
  RawMaterialUnit,
  RawMaterial,
  StockLedgerEntry,
  MaterialPurchaseReceipt,
  BatchMaterialUsage,
  SupplierLedgerEntry,
  FinancialTransaction,
  FinancialTransactionType,
  ManagerCashAccount,
  ManagerCashTransaction,
  BookerAccount,
  BookerTransaction,
} from '@juice-erp/shared-types';

/**
 * Post an auditable financial transaction to Cash or Bank account and update account balances
 */
export function postFinancialTransaction(
  db: ErpDatabaseState,
  params: {
    transaction_date: string;
    reference_number: string;
    transaction_type: FinancialTransactionType;
    payment_method: 'Cash' | 'Bank Transfer' | 'Cheque' | 'Online Transfer' | 'Reversal';
    direction: 'INFLOW' | 'OUTFLOW';
    amount: number;
    account_id?: string;
    related_party_type?: 'DEALER' | 'SUPPLIER' | 'EXPENSE' | 'INTERNAL_TRANSFER' | 'OWNER';
    related_party_id?: string;
    related_party_name: string;
    entered_by_id: string;
    entered_by_name: string;
    remarks: string;
    reverses_transaction_id?: string;
  }
): FinancialTransaction {
  const amt = Number(params.amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error('Financial transaction amount must be greater than zero.');
  }

  const targetAccountId =
    params.account_id ||
    (params.payment_method === 'Cash' ? 'acc-cash' : 'acc-bank');
  let account =
    db.cash_bank_accounts.find((a) => a.id === targetAccountId) ||
    db.cash_bank_accounts[0];

  if (!account) {
    account = {
      id: 'acc-cash',
      account_code: 'CASH-01',
      account_name: 'Factory Cash in Hand',
      account_type: 'CASH',
      opening_balance: 0,
      total_receipts: 0,
      total_payments: 0,
      current_balance: 0,
      updated_at: new Date().toISOString(),
    };
    db.cash_bank_accounts.push(account);
  }

  if (params.direction === 'INFLOW') {
    account.total_receipts = Number(((account.total_receipts || 0) + amt).toFixed(2));
  } else {
    account.total_payments = Number(((account.total_payments || 0) + amt).toFixed(2));
  }
  account.current_balance = Number(
    ((account.opening_balance || 0) + account.total_receipts - account.total_payments).toFixed(2)
  );
  account.updated_at = new Date().toISOString();

  const tx: FinancialTransaction = {
    id: `ftx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    transaction_date: params.transaction_date || new Date().toISOString().split('T')[0],
    reference_number: params.reference_number,
    transaction_type: params.transaction_type,
    account_id: account.id,
    account_name: account.account_name,
    direction: params.direction,
    amount: amt,
    balance_after: account.current_balance,
    payment_method: params.payment_method,
    related_party_type: params.related_party_type,
    related_party_id: params.related_party_id,
    related_party_name: params.related_party_name,
    entered_by_id: params.entered_by_id,
    entered_by_name: params.entered_by_name,
    remarks: params.remarks,
    reverses_transaction_id: params.reverses_transaction_id,
    is_reversed: false,
    created_at: new Date().toISOString(),
  };

  db.financial_transactions.unshift(tx);
  return tx;
}

/**
 * Normalize unit string into canonical industrial unit
 */
export function normalizeUnit(rawUnit: string): MaterialUnit {
  const u = (rawUnit || '').trim().toUpperCase();
  if (u === 'KG' || u === 'KGS' || u === 'KILOGRAM' || u === 'KILOGRAMS') return 'KG';
  if (u === 'G' || u === 'GM' || u === 'GRAM' || u === 'GRAMS') return 'GRAM';
  if (u === 'L' || u === 'LTR' || u === 'LITER' || u === 'LITERS' || u === 'LITRE' || u === 'LITRES') return 'LITRE';
  if (u === 'ML' || u === 'MILLILITER' || u === 'MILLILITRE' || u === 'MILLILITRES') return 'ML';
  if (u === 'BOX' || u === 'BOXES') return 'BOX';
  if (u === 'PIECE' || u === 'PIECES' || u === 'PC' || u === 'PCS' || u === 'BOTTLE' || u === 'BOTTLES') return 'PIECE';
  if (u === 'PACKET' || u === 'PACKETS' || u === 'PKT' || u === 'PKTS' || u === 'ROLL' || u === 'ROLLS') return 'PACKET';
  if (u === 'CARTON' || u === 'CARTONS' || u === 'CTN' || u === 'CTNS') return 'CARTONS';
  throw new Error(
    `Unsupported unit "${rawUnit}". Supported units: KG, GRAM, LITRE, ML, BOX, PIECE, PACKET, CARTONS.`
  );
}

/**
 * Convert quantity between compatible units:
 * - 1 KG = 1000 GRAM
 * - 1 LITRE = 1000 ML
 * - BOX <-> PIECE only if boxToPieceFactor is explicitly configured on the material (never invented).
 * Throws an error if incompatible unit families are mixed.
 */
export function convertQuantityToTargetUnit(
  quantity: number,
  fromUnitRaw: string,
  targetUnitRaw: string,
  options?: { boxToPieceFactor?: number | null }
): number {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error(`Invalid quantity: ${quantity}`);
  }
  const fromUnit = normalizeUnit(fromUnitRaw);
  const targetUnit = normalizeUnit(targetUnitRaw);

  if (fromUnit === targetUnit) {
    return Number(quantity.toFixed(4));
  }

  // Weight conversions: 1 KG = 1000 GRAM
  if (fromUnit === 'GRAM' && targetUnit === 'KG') {
    return Number((quantity / 1000).toFixed(4));
  }
  if (fromUnit === 'KG' && targetUnit === 'GRAM') {
    return Number((quantity * 1000).toFixed(4));
  }

  // Volume conversions: 1 LITRE = 1000 ML
  if (fromUnit === 'ML' && targetUnit === 'LITRE') {
    return Number((quantity / 1000).toFixed(4));
  }
  if (fromUnit === 'LITRE' && targetUnit === 'ML') {
    return Number((quantity * 1000).toFixed(4));
  }

  // Optional Owner-configured BOX <-> PIECE conversion (never assumed or invented)
  const factor = Number(options?.boxToPieceFactor || 0);
  if (fromUnit === 'PIECE' && targetUnit === 'BOX') {
    if (factor > 0) {
      return Number((quantity / factor).toFixed(4));
    }
    throw new Error(
      `Box-to-Piece conversion is not configured for this material. Please use ${targetUnit} or configure pieces per box first.`
    );
  }
  if (fromUnit === 'BOX' && targetUnit === 'PIECE') {
    if (factor > 0) {
      return Number((quantity * factor).toFixed(4));
    }
    throw new Error(
      `Box-to-Piece conversion is not configured for this material. Please use ${targetUnit} or configure pieces per box first.`
    );
  }

  throw new Error(
    `Unit mismatch: Cannot convert ${quantity} ${fromUnit} into ${targetUnit}. Never mix incompatible units.`
  );
}

export function recalculateRawMaterialStock(rm: RawMaterial): void {
  const opening = rm.opening_stock ?? 0;
  const received = rm.stock_received ?? 0;
  const consumed = rm.stock_consumed ?? 0;
  const adjusted = rm.stock_adjusted ?? 0;
  rm.current_stock = Number((opening + received - consumed + adjusted).toFixed(4));
  rm.updated_at = new Date().toISOString();
}

export function recalculateFinishedGoodsRow(fg: FinishedGoodsInventory): void {
  fg.closing_stock_cartons = Number(
    (
      fg.opening_stock_cartons +
      fg.verified_production_cartons +
      fg.approved_returns_cartons -
      fg.dispatched_cartons -
      fg.damaged_cartons
    ).toFixed(2)
  );

  fg.available_cartons = Number((fg.closing_stock_cartons - fg.reserved_cartons).toFixed(2));

  const upc = fg.units_per_carton || 24;
  const openBottles = fg.opening_stock_bottles ?? Math.round(fg.opening_stock_cartons * upc);
  const prodBottles = fg.verified_production_bottles ?? Math.round(fg.verified_production_cartons * upc);
  const dispBottles = fg.dispatched_bottles ?? Math.round(fg.dispatched_cartons * upc);
  const dmgBottles = fg.damaged_bottles ?? Math.round(fg.damaged_cartons * upc);
  const retBottles = Math.round(fg.approved_returns_cartons * upc);
  const resBottles = Math.round(fg.reserved_cartons * upc);

  fg.opening_stock_bottles = openBottles;
  fg.verified_production_bottles = prodBottles;
  fg.dispatched_bottles = dispBottles;
  fg.damaged_bottles = dmgBottles;
  fg.closing_stock_bottles = openBottles + prodBottles + retBottles - dispBottles - dmgBottles;
  fg.available_bottles = fg.closing_stock_bottles - resBottles;

  fg.updated_at = new Date().toISOString();
}

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Verify & Complete Production Batch (Idempotent - never deducts BOM or adds FG twice)
 */
export function verifyAndCompleteBatch(params: {
  batch_id: string;
  actual_cartons?: number;
  wastage_cartons?: number;
  status: ProductionStatus;
  actor: UserProfile;
}): ProductionBatch {
  return withErpTransaction((db) => {
    const batch = db.production_batches.find((b) => b.id === params.batch_id);
    if (!batch) {
      throw new Error(`Production batch ${params.batch_id} not found.`);
    }

    if (typeof params.actual_cartons === 'number') {
      batch.actual_cartons = params.actual_cartons;
    }
    if (typeof params.wastage_cartons === 'number') {
      batch.wastage_cartons = params.wastage_cartons;
    }

    batch.status = params.status;
    batch.updated_at = new Date().toISOString();

    // Critical requirement: Automatically update finished goods & deduct BOM ONLY ONCE when Completed & Verified
    if (params.status === 'Completed' && !batch.inventory_posted) {
      if (batch.actual_cartons <= 0) {
        throw new Error('Cannot complete and verify a batch with 0 actual cartons produced.');
      }

      const recipe = db.recipes.find((r) => r.product_id === batch.product_id);
      let batchTotalCost = 0;
      const usageList = [];

      if (recipe) {
        for (const item of recipe.items) {
          const rm = db.raw_materials.find((m) => m.id === item.raw_material_id);
          if (!rm) continue;
          const multiplier = 1 + item.wastage_allowance_pct / 100;
          const estimatedQty = Number((item.quantity_per_carton * batch.target_cartons).toFixed(3));
          const actualQty = Number(
            (item.quantity_per_carton * batch.actual_cartons * multiplier).toFixed(3)
          );

          if (rm.current_stock < actualQty) {
            throw new Error(
              `Insufficient raw material "${rm.name}": required ${actualQty} ${rm.unit}, available ${rm.current_stock} ${rm.unit}.`
            );
          }

          rm.current_stock = Number((rm.current_stock - actualQty).toFixed(3));
          rm.updated_at = new Date().toISOString();

          const lineCost = Number((actualQty * rm.average_cost_per_unit).toFixed(2));
          batchTotalCost += lineCost;

          usageList.push({
            raw_material_id: rm.id,
            raw_material_name: rm.name,
            unit: rm.unit,
            estimated_quantity: estimatedQty,
            actual_quantity: actualQty,
            unit_cost_snapshot: rm.average_cost_per_unit,
            total_cost: lineCost,
          });

          db.inventory_movements.unshift({
            id: `mov-rm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            item_type: 'RAW_MATERIAL',
            item_id: rm.id,
            item_name: rm.name,
            batch_number: batch.batch_number,
            movement_type: 'RAW_MATERIAL_CONSUMED',
            quantity_change: -actualQty,
            balance_after: rm.current_stock,
            reference_type: 'BATCH',
            reference_id: batch.batch_number,
            notes: `Consumed for ${batch.actual_cartons} cartons of ${batch.product_name}`,
            performed_by: params.actor.full_name,
            created_at: new Date().toISOString(),
          });

          if (rm.current_stock <= rm.minimum_stock_level) {
            db.notifications.unshift({
              id: `notif-rm-${Date.now()}-${rm.id}`,
              type: 'LOW_RAW_MATERIAL',
              title: `Low Raw Material Stock: ${rm.name}`,
              message: `${rm.name} dropped to ${rm.current_stock} ${rm.unit} (Minimum: ${rm.minimum_stock_level} ${rm.unit}) after batch ${batch.batch_number}.`,
              severity: 'critical',
              target_roles: ['OWNER', 'PRODUCTION_MANAGER'],
              is_read: false,
              link_href: '/raw-materials',
              created_at: new Date().toISOString(),
            });
          }
        }
      }

      const product = db.products.find((p) => p.id === batch.product_id);
      if (batchTotalCost === 0 && product) {
        batchTotalCost = batch.actual_cartons * product.standard_cost_per_carton;
      }

      batch.material_usage = usageList;
      batch.total_production_cost = Math.round(batchTotalCost);
      batch.cost_per_carton = Number((batchTotalCost / batch.actual_cartons).toFixed(2));
      batch.inventory_posted = true;
      batch.verified_by = params.actor.id;
      batch.verified_at = new Date().toISOString();

      let fg = db.finished_goods.find((f) => f.product_id === batch.product_id);
      if (!fg && product) {
        fg = {
          id: `fg-${product.id}`,
          product_id: product.id,
          product_name: product.name,
          sku: product.sku,
          flavour_name: product.flavour_name,
          bottle_size_label: product.bottle_size_label,
          packaging_type_name: product.packaging_type_name,
          units_per_carton: product.units_per_carton,
          opening_stock_cartons: 0,
          verified_production_cartons: 0,
          approved_returns_cartons: 0,
          dispatched_cartons: 0,
          damaged_cartons: 0,
          reserved_cartons: 0,
          available_cartons: 0,
          closing_stock_cartons: 0,
          latest_batch_number: batch.batch_number,
          latest_production_date: batch.production_date,
          valuation_per_carton: batch.cost_per_carton || product.standard_cost_per_carton,
          updated_at: new Date().toISOString(),
        };
        db.finished_goods.push(fg);
      }

      if (fg) {
        fg.verified_production_cartons += batch.actual_cartons;
        fg.latest_batch_number = batch.batch_number;
        fg.latest_production_date = batch.production_date;
        recalculateFinishedGoodsRow(fg);

        db.inventory_movements.unshift({
          id: `mov-fg-${Date.now()}`,
          item_type: 'FINISHED_GOOD',
          item_id: batch.product_id,
          item_name: batch.product_name,
          batch_number: batch.batch_number,
          movement_type: 'PRODUCTION_VERIFIED',
          quantity_change: batch.actual_cartons,
          balance_after: fg.closing_stock_cartons,
          reference_type: 'BATCH',
          reference_id: batch.batch_number,
          notes: `Verified batch completion (+${batch.actual_cartons} cartons)`,
          performed_by: params.actor.full_name,
          created_at: new Date().toISOString(),
        });
      }

      db.notifications.unshift({
        id: `notif-batch-${Date.now()}`,
        type: 'PRODUCTION_COMPLETED',
        title: `Batch Completed & Verified: ${batch.batch_number}`,
        message: `${batch.actual_cartons} cartons of ${batch.product_name} added to Finished Goods Inventory.`,
        severity: 'success',
        target_roles: ['OWNER', 'PRODUCTION_MANAGER'],
        is_read: false,
        link_href: '/production',
        created_at: new Date().toISOString(),
      });

      appendAuditLog(db, {
        actor_id: params.actor.id,
        actor_name: params.actor.full_name,
        actor_role: params.actor.role,
        action: 'PRODUCTION_BATCH_VERIFIED',
        entity_type: 'production_batches',
        entity_id: batch.id,
        summary: `Verified batch ${batch.batch_number} (${batch.actual_cartons} cartons ${batch.product_name}). Deducted BOM and updated FG inventory.`,
      });
    } else {
      appendAuditLog(db, {
        actor_id: params.actor.id,
        actor_name: params.actor.full_name,
        actor_role: params.actor.role,
        action: 'PRODUCTION_BATCH_UPDATED',
        entity_type: 'production_batches',
        entity_id: batch.id,
        summary: `Updated batch ${batch.batch_number} status to ${batch.status} (inventory_posted=${batch.inventory_posted}).`,
      });
    }

    return batch;
  });
}

/**
 * Transition Order Status with Atomic Stock Reservation, Dispatch Deduction, and Ledger Posting
 */
export function transitionOrderStatus(params: {
  order_id: string;
  next_status: OrderStatus;
  actor: UserProfile;
}): Order {
  return withErpTransaction((db) => {
    const order = db.orders.find((o) => o.id === params.order_id);
    if (!order) {
      throw new Error(`Order ${params.order_id} not found.`);
    }

    const prevStatus = order.status;
    if (prevStatus === params.next_status) {
      return order;
    }

    // 1. Approving a Pending order -> Reserve stock
    if (prevStatus === 'Pending' && params.next_status === 'Approved') {
      for (const item of order.items) {
        const fg = db.finished_goods.find((f) => f.product_id === item.product_id);
        if (!fg || fg.available_cartons < item.quantity_cartons) {
          throw new Error(
            `Insufficient available finished goods for "${item.product_name}". Available: ${
              fg?.available_cartons ?? 0
            } cartons, Requested: ${item.quantity_cartons} cartons.`
          );
        }
        fg.reserved_cartons += item.quantity_cartons;
        recalculateFinishedGoodsRow(fg);
      }
      order.approved_by = params.actor.id;
    }

    // 2. Dispatching an order -> Deduct stock, release reservation, and post Sales Invoice Debit to Dealer Ledger
    if (
      params.next_status === 'Dispatched' &&
      prevStatus !== 'Dispatched' &&
      prevStatus !== 'Delivered'
    ) {
      const wasReserved = ['Approved', 'Processing', 'Ready for Dispatch'].includes(prevStatus);

      for (const item of order.items) {
        const fg = db.finished_goods.find((f) => f.product_id === item.product_id);
        if (!fg) {
          throw new Error(`Finished goods record missing for ${item.product_name}`);
        }
        if (wasReserved) {
          fg.reserved_cartons = Math.max(0, fg.reserved_cartons - item.quantity_cartons);
        } else if (fg.available_cartons < item.quantity_cartons) {
          throw new Error(
            `Cannot dispatch "${item.product_name}": available ${fg.available_cartons} cartons < ${item.quantity_cartons} cartons.`
          );
        }

        fg.dispatched_cartons += item.quantity_cartons;
        recalculateFinishedGoodsRow(fg);

        db.inventory_movements.unshift({
          id: `mov-disp-${Date.now()}-${item.product_id}`,
          item_type: 'FINISHED_GOOD',
          item_id: item.product_id,
          item_name: item.product_name,
          movement_type: 'ORDER_DISPATCHED',
          quantity_change: -item.quantity_cartons,
          balance_after: fg.closing_stock_cartons,
          reference_type: 'ORDER',
          reference_id: order.order_number,
          notes: `Dispatched ${item.quantity_cartons} cartons to ${order.shop_name}`,
          performed_by: params.actor.full_name,
          created_at: new Date().toISOString(),
        });
      }

      // Post Sales Invoice Debit to Dealer Ledger
      const dealer = db.dealers.find((d) => d.id === order.dealer_id);
      if (dealer) {
        dealer.outstanding_balance += order.total_amount;
        db.dealer_ledger.push({
          id: `ldg-inv-${Date.now()}`,
          dealer_id: dealer.id,
          dealer_name: dealer.dealer_name,
          shop_name: dealer.shop_name,
          date: new Date().toISOString().split('T')[0],
          description: `Sales Invoice ${order.order_number} (${order.items
            .map((i) => `${i.quantity_cartons}x ${i.product_name}`)
            .join(', ')})`,
          entry_type: 'SALES_INVOICE',
          debit: order.total_amount,
          credit: 0,
          balance: dealer.outstanding_balance,
          reference_number: order.order_number,
          payment_method: 'Credit',
          created_by: params.actor.id,
          created_at: new Date().toISOString(),
        });
      }

      order.dispatched_at = new Date().toISOString();
    }

    // 3. Cancelling/Rejecting an already reserved order -> Release reservation
    if (
      (params.next_status === 'Cancelled' || params.next_status === 'Rejected') &&
      ['Approved', 'Processing', 'Ready for Dispatch'].includes(prevStatus)
    ) {
      for (const item of order.items) {
        const fg = db.finished_goods.find((f) => f.product_id === item.product_id);
        if (fg) {
          fg.reserved_cartons = Math.max(0, fg.reserved_cartons - item.quantity_cartons);
          recalculateFinishedGoodsRow(fg);
        }
      }
    }

    if (params.next_status === 'Delivered') {
      order.delivered_at = new Date().toISOString();
    }

    order.status = params.next_status;
    order.updated_at = new Date().toISOString();

    appendAuditLog(db, {
      actor_id: params.actor.id,
      actor_name: params.actor.full_name,
      actor_role: params.actor.role,
      action: `ORDER_STATUS_${params.next_status.toUpperCase().replace(/\s+/g, '_')}`,
      entity_type: 'orders',
      entity_id: order.id,
      summary: `Order ${order.order_number} (${order.shop_name}) transitioned from ${prevStatus} to ${params.next_status}.`,
    });

    return order;
  });
}

/**
 * Reverse a Ledger / Payment Entry without silently overwriting history
 */
export function reverseDealerLedgerEntry(params: {
  ledger_entry_id: string;
  reason: string;
  actor: UserProfile;
}): DealerLedgerEntry {
  return withErpTransaction((db) => {
    const original = db.dealer_ledger.find((e) => e.id === params.ledger_entry_id);
    if (!original) {
      throw new Error('Ledger entry not found.');
    }
    if (original.is_reversed) {
      throw new Error('This ledger entry has already been reversed.');
    }

    const dealer = db.dealers.find((d) => d.id === original.dealer_id);
    if (!dealer) {
      throw new Error('Associated dealer not found.');
    }

    original.is_reversed = true;

    // Opposite debit/credit to reverse impact
    const reversalDebit = original.credit;
    const reversalCredit = original.debit;
    dealer.outstanding_balance =
      dealer.outstanding_balance + reversalDebit - reversalCredit;

    const reversalEntry: DealerLedgerEntry = {
      id: `ldg-rev-${Date.now()}`,
      dealer_id: dealer.id,
      dealer_name: dealer.dealer_name,
      shop_name: dealer.shop_name,
      date: new Date().toISOString().split('T')[0],
      description: `REVERSAL of ${original.reference_number}: ${params.reason}`,
      entry_type: 'REVERSAL_ENTRY',
      debit: reversalDebit,
      credit: reversalCredit,
      balance: dealer.outstanding_balance,
      reference_number: `REV-${original.reference_number}`,
      payment_method: 'Reversal',
      reverses_entry_id: original.id,
      created_by: params.actor.id,
      created_at: new Date().toISOString(),
    };

    db.dealer_ledger.push(reversalEntry);

    const linkedPayment = db.payments.find((p) => p.ledger_entry_id === original.id);
    if (linkedPayment) {
      linkedPayment.is_reversed = true;
    }

    appendAuditLog(db, {
      actor_id: params.actor.id,
      actor_name: params.actor.full_name,
      actor_role: params.actor.role,
      action: 'LEDGER_REVERSAL_ENTRY_CREATED',
      entity_type: 'dealer_ledger',
      entity_id: reversalEntry.id,
      summary: `Created reversal entry ${reversalEntry.reference_number} for ${dealer.shop_name} (Reason: ${params.reason}).`,
    });

    return reversalEntry;
  });
}

/**
 * SECTION 2: REAL RAW MATERIAL MANAGEMENT
 * Admin records incoming raw material stock receipt / purchase entry.
 * Automatically normalizes units, updates Opening + Received - Consumed = Remaining,
 * creates a permanent StockLedgerEntry, and logs actor + timestamp.
 */
export function recordRawMaterialPurchaseReceipt(params: {
  material_id?: string;
  material_name: string;
  category?: RawMaterial['category'];
  quantity: number;
  unit: string;
  opening_stock?: number;
  supplier_name: string;
  purchase_price_total: number;
  amount_paid?: number;
  payment_method?: 'Cash' | 'Bank Transfer' | 'Cheque' | 'Credit';
  purchase_date: string;
  invoice_number: string;
  minimum_stock_level?: number;
  notes?: string;
  actor: UserProfile;
}): {
  raw_material: RawMaterial;
  receipt: MaterialPurchaseReceipt;
  ledger_entry: StockLedgerEntry;
} {
  const isAuthorizedManager =
    params.actor.role === 'PRODUCTION_MANAGER' && params.actor.can_record_purchases === true;
  if (params.actor.role !== 'OWNER' && !isAuthorizedManager) {
    throw new Error(
      'Forbidden: Production Manager cannot record supplier purchases or incoming stock receipts unless Admin explicitly grants permission.'
    );
  }

  const enteredQty = Number(params.quantity);
  if (!Number.isFinite(enteredQty) || enteredQty <= 0) {
    throw new Error('Quantity must be greater than zero.');
  }

  const materialNameTrimmed = (params.material_name || '').trim();
  if (!materialNameTrimmed) {
    throw new Error('Material name is required.');
  }

  const supplierTrimmed = (params.supplier_name || '').trim() || 'Direct Supplier';
  const invoiceTrimmed = (params.invoice_number || '').trim() || `INV-${Date.now().toString().slice(-5)}`;
  const purchaseDate = (params.purchase_date || '').trim() || new Date().toISOString().split('T')[0];
  const enteredUnit = normalizeUnit(params.unit);
  const priceTotal = Math.max(0, Number(params.purchase_price_total || 0));

  return withErpTransaction((db) => {
    // Ensure supplier exists
    let supplier = db.suppliers.find(
      (s) => s.name.toLowerCase() === supplierTrimmed.toLowerCase()
    );
    if (!supplier) {
      supplier = {
        id: `sup-${Date.now()}`,
        code: `SUP-00${db.suppliers.length + 1}`,
        name: supplierTrimmed,
        contact_person: supplierTrimmed,
        phone: 'N/A',
        email: '',
        address: 'Registered Supplier',
        opening_balance: 0,
        payable_balance: 0,
        created_at: new Date().toISOString(),
      };
      db.suppliers.push(supplier);
    }

    // Find existing raw material by ID or case-insensitive name
    let rm = db.raw_materials.find(
      (m) =>
        (params.material_id && m.id === params.material_id) ||
        m.name.toLowerCase() === materialNameTrimmed.toLowerCase()
    );

    if (!rm) {
      const codePrefix = materialNameTrimmed
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 4)
        .toUpperCase() || 'MAT';
      const initOpening = Math.max(0, Number(params.opening_stock || 0));
      rm = {
        id: `rm-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        code: `RM-${codePrefix}-${db.raw_materials.length + 1}`,
        name: materialNameTrimmed,
        category: params.category || 'Chemical',
        unit: enteredUnit,
        opening_stock: initOpening,
        stock_received: 0,
        stock_consumed: 0,
        stock_adjusted: 0,
        current_stock: initOpening,
        minimum_stock_level: Number(params.minimum_stock_level ?? 10),
        average_cost_per_unit: Number((priceTotal / enteredQty).toFixed(2)),
        last_purchase_price: Number((priceTotal / enteredQty).toFixed(2)),
        damaged_quantity: 0,
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        updated_at: new Date().toISOString(),
      };
      db.raw_materials.push(rm);
    }

    // Convert entered quantity to canonical unit of this material
    const canonicalUnit = normalizeUnit(String(rm.unit));
    rm.unit = canonicalUnit;
    const normalizedQty = convertQuantityToTargetUnit(enteredQty, enteredUnit, canonicalUnit);
    const unitCostCanonical = normalizedQty > 0 ? Number((priceTotal / normalizedQty).toFixed(2)) : 0;

    const openingBefore = Number((rm.current_stock ?? 0).toFixed(4));
    rm.stock_received = Number(((rm.stock_received ?? 0) + normalizedQty).toFixed(4));
    recalculateRawMaterialStock(rm);
    const closingAfter = rm.current_stock;

    if (unitCostCanonical > 0) {
      rm.last_purchase_price = unitCostCanonical;
      if (openingBefore <= 0 || rm.average_cost_per_unit <= 0) {
        rm.average_cost_per_unit = unitCostCanonical;
      } else {
        rm.average_cost_per_unit = Number(
          ((openingBefore * rm.average_cost_per_unit + priceTotal) / closingAfter).toFixed(2)
        );
      }
    }
    rm.supplier_id = supplier.id;
    rm.supplier_name = supplier.name;

    const nowIso = new Date().toISOString();

    const receipt: MaterialPurchaseReceipt = {
      id: `rcpt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      invoice_number: invoiceTrimmed,
      purchase_date: purchaseDate,
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      material_id: rm.id,
      material_name: rm.name,
      quantity_entered: enteredQty,
      unit_entered: enteredUnit,
      normalized_quantity: normalizedQty,
      canonical_unit: canonicalUnit,
      purchase_price_total: priceTotal,
      unit_cost: unitCostCanonical,
      notes: params.notes,
      entered_by_id: params.actor.id,
      entered_by_name: params.actor.full_name,
      created_at: nowIso,
    };
    db.material_purchase_receipts.unshift(receipt);

    const ledgerEntry: StockLedgerEntry = {
      id: `sled-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      material_id: rm.id,
      material_name: rm.name,
      unit: canonicalUnit,
      opening_quantity: openingBefore,
      stock_received: normalizedQty,
      quantity_consumed: 0,
      adjustment_quantity: 0,
      closing_quantity: closingAfter,
      transaction_type: 'PURCHASE_RECEIPT',
      reference_number: invoiceTrimmed,
      supplier_name: supplier.name,
      purchase_price: priceTotal,
      notes:
        params.notes ||
        `Received ${enteredQty} ${enteredUnit} from ${supplier.name} (Invoice ${invoiceTrimmed}, PKR ${priceTotal.toLocaleString()})`,
      entered_by_id: params.actor.id,
      entered_by_name: params.actor.full_name,
      approved_by_id: params.actor.id,
      approved_by_name: params.actor.full_name,
      date: purchaseDate,
      created_at: nowIso,
    };
    db.stock_ledger.unshift(ledgerEntry);

    db.inventory_movements.unshift({
      id: `mov-pur-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      item_type: 'RAW_MATERIAL',
      item_id: rm.id,
      item_name: rm.name,
      movement_type: 'PURCHASE_RECEIVED',
      quantity_change: normalizedQty,
      balance_after: closingAfter,
      reference_type: 'PURCHASE',
      reference_id: invoiceTrimmed,
      notes: `Invoice ${invoiceTrimmed} from ${supplier.name}: +${enteredQty} ${enteredUnit} (PKR ${priceTotal.toLocaleString()})`,
      performed_by: params.actor.full_name,
      created_at: nowIso,
    });

    const paidAmt =
      params.amount_paid !== undefined
        ? Math.max(0, Number(params.amount_paid))
        : priceTotal;
    const payMethod = params.payment_method || (paidAmt > 0 ? 'Cash' : 'Credit');

    // Update Supplier Payable Balance & Post Supplier Ledger Entries
    if (priceTotal > 0) {
      const balAfterInvoice = Number(((supplier.payable_balance || 0) + priceTotal).toFixed(2));
      const invLedger: SupplierLedgerEntry = {
        id: `sldg-inv-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        date: purchaseDate,
        description: `Purchase Invoice ${invoiceTrimmed}: ${enteredQty} ${enteredUnit} ${rm.name}`,
        entry_type: 'PURCHASE_INVOICE',
        debit: 0,
        credit: priceTotal,
        balance: balAfterInvoice,
        reference_number: invoiceTrimmed,
        payment_method: 'Credit',
        entered_by_id: params.actor.id,
        entered_by_name: params.actor.full_name,
        remarks: params.notes || `${enteredQty} ${enteredUnit} ${rm.name}`,
        created_at: nowIso,
      };
      db.supplier_ledger.push(invLedger);
      supplier.payable_balance = balAfterInvoice;

      if (paidAmt > 0) {
        const balAfterPayment = Math.max(0, Number((supplier.payable_balance - paidAmt).toFixed(2)));
        const payLedger: SupplierLedgerEntry = {
          id: `sldg-pay-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          supplier_id: supplier.id,
          supplier_name: supplier.name,
          date: purchaseDate,
          description: `Payment against Purchase ${invoiceTrimmed} (${payMethod})`,
          entry_type: 'PAYMENT_MADE',
          debit: paidAmt,
          credit: 0,
          balance: balAfterPayment,
          reference_number: `PAY-${invoiceTrimmed}`,
          payment_method: payMethod === 'Credit' ? 'Cash' : payMethod,
          entered_by_id: params.actor.id,
          entered_by_name: params.actor.full_name,
          remarks: `Paid on purchase receipt ${invoiceTrimmed}`,
          created_at: nowIso,
        };
        db.supplier_ledger.push(payLedger);
        supplier.payable_balance = balAfterPayment;

        postFinancialTransaction(db, {
          transaction_date: purchaseDate,
          reference_number: `PAY-${invoiceTrimmed}`,
          transaction_type: 'RAW_MATERIAL_CASH_PURCHASE',
          payment_method: payMethod === 'Credit' ? 'Cash' : payMethod,
          direction: 'OUTFLOW',
          amount: paidAmt,
          related_party_type: 'SUPPLIER',
          related_party_id: supplier.id,
          related_party_name: supplier.name,
          entered_by_id: params.actor.id,
          entered_by_name: params.actor.full_name,
          remarks: `Purchase payment for ${enteredQty} ${enteredUnit} ${rm.name} (${invoiceTrimmed})`,
        });
      }
    }

    db.purchases.unshift({
      id: receipt.id,
      purchase_number: invoiceTrimmed,
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      purchase_date: purchaseDate,
      total_amount: priceTotal,
      amount_paid: paidAmt,
      payment_status: paidAmt >= priceTotal ? 'PAID' : paidAmt > 0 ? 'PARTIAL' : 'UNPAID',
      notes: params.notes || `Stock receipt ${invoiceTrimmed}`,
      created_by: params.actor.id,
      created_at: nowIso,
      items: [
        {
          id: `pi-${Date.now()}`,
          purchase_id: receipt.id,
          raw_material_id: rm.id,
          raw_material_name: rm.name,
          quantity: normalizedQty,
          unit: canonicalUnit,
          unit_price: unitCostCanonical,
          total_cost: priceTotal,
        },
      ],
    });

    db.notifications.unshift({
      id: `notif-pur-${Date.now()}`,
      type: 'PRODUCTION_COMPLETED',
      title: `Raw Material Received: +${enteredQty} ${enteredUnit} ${rm.name}`,
      message: `${params.actor.full_name} recorded incoming stock receipt (${invoiceTrimmed}). Available stock of ${rm.name} is now ${closingAfter} ${canonicalUnit}.`,
      severity: 'info',
      target_roles: ['PRODUCTION_MANAGER', 'OWNER'],
      is_read: false,
      link_href: '/raw-materials',
      created_at: nowIso,
    });

    appendAuditLog(db, {
      actor_id: params.actor.id,
      actor_name: params.actor.full_name,
      actor_role: params.actor.role,
      action: 'RAW_MATERIAL_STOCK_RECEIVED',
      entity_type: 'raw_materials',
      entity_id: rm.id,
      summary: `Recorded purchase receipt ${invoiceTrimmed}: +${enteredQty} ${enteredUnit} (${normalizedQty} ${canonicalUnit}) of ${rm.name} from ${supplier.name} for PKR ${priceTotal.toLocaleString()}. Closing stock: ${closingAfter} ${canonicalUnit}.`,
    });

    return {
      raw_material: rm,
      receipt,
      ledger_entry: ledgerEntry,
    };
  });
}

/**
 * SECTION 3: PRODUCTION MANAGER BATCH CREATION & SUBMISSION (DRAFT / SUBMITTED)
 * Production Manager creates or updates a batch, enters actual bottle production, wastage,
 * and raw material consumption in any compatible unit (e.g., 500 GRAM of a KG material).
 * Stock is NOT deducted until Admin approves the submitted batch.
 */
export function createOrUpdateProductionBatch(params: {
  batch_id?: string;
  product_id?: string;
  product_name?: string;
  flavour_name?: string;
  bottle_size_label?: string;
  target_bottles?: number;
  actual_bottles: number;
  wastage_bottles?: number;
  production_date: string;
  machine_id?: string;
  remarks?: string;
  status: 'DRAFT' | 'SUBMITTED';
  consumed_materials: Array<{
    raw_material_id: string;
    entered_quantity: number;
    entered_unit: string;
    wastage_quantity?: number;
  }>;
  actor: UserProfile;
}): ProductionBatch {
  if (params.actor.role !== 'PRODUCTION_MANAGER' && params.actor.role !== 'OWNER') {
    throw new Error('Forbidden: Only Production Manager or Admin can create or submit production batches.');
  }

  const actualBottles = Math.round(Number(params.actual_bottles || 0));
  if (actualBottles <= 0) {
    throw new Error('Production quantity (bottles) must be greater than zero.');
  }
  const targetBottles = Math.round(Number(params.target_bottles || actualBottles));
  const wastageBottles = Math.max(0, Math.round(Number(params.wastage_bottles || 0)));

  return withErpTransaction((db) => {
    let existingBatch = params.batch_id
      ? db.production_batches.find((b) => b.id === params.batch_id)
      : undefined;

    if (existingBatch) {
      if (existingBatch.status === 'APPROVED' || existingBatch.inventory_posted) {
        throw new Error(
          `Batch ${existingBatch.batch_number} has already been APPROVED and locked. Duplicate submission is not allowed.`
        );
      }
      if (existingBatch.status === 'SUBMITTED' && params.status === 'SUBMITTED') {
        throw new Error(
          `Duplicate submission prevented: Batch ${existingBatch.batch_number} is already SUBMITTED and awaiting Admin review.`
        );
      }
    }

    // Resolve or create product definition
    let product = db.products.find(
      (p) =>
        (params.product_id && p.id === params.product_id) ||
        (params.product_name &&
          p.name.toLowerCase().includes(params.product_name.trim().toLowerCase()) &&
          (!params.bottle_size_label ||
            p.bottle_size_label.toLowerCase().replace(/\s+/g, '') ===
              params.bottle_size_label.trim().toLowerCase().replace(/\s+/g, '')))
    );

    const bottleSizeLabel = (params.bottle_size_label || product?.bottle_size_label || '250 ML').trim();
    const productName = (params.product_name || product?.name || 'Mango Juice').trim();
    const flavourName = (params.flavour_name || product?.flavour_name || productName.split(' ')[0] || 'Mango').trim();

    if (!product) {
      const unitsPerCarton = bottleSizeLabel.includes('1000') || bottleSizeLabel.toUpperCase().includes('1L') ? 6 : bottleSizeLabel.includes('500') ? 12 : 24;
      product = {
        id: `prod-${Date.now()}`,
        sku: `FF-${flavourName.slice(0, 3).toUpperCase()}-${bottleSizeLabel.replace(/\s+/g, '')}`,
        name: `${productName} ${bottleSizeLabel}`.replace(new RegExp(`${bottleSizeLabel}\\s+${bottleSizeLabel}`, 'i'), bottleSizeLabel),
        flavour_id: 'flv-custom',
        flavour_name: flavourName,
        bottle_size_id: 'size-custom',
        bottle_size_label: bottleSizeLabel,
        packaging_type_id: 'pkg-pet24',
        packaging_type_name: `PET Bottle Carton (${unitsPerCarton}x)`,
        units_per_carton: unitsPerCarton,
        wholesale_price_per_carton: 1320,
        retail_price_per_unit: 65,
        standard_cost_per_carton: 900,
        min_stock_cartons: 50,
        is_active: true,
        created_at: new Date().toISOString(),
      };
      db.products.push(product);
    }

    const unitsPerCarton = product.units_per_carton || 24;
    const actualCartons = Number((actualBottles / unitsPerCarton).toFixed(2));
    const targetCartons = Number((targetBottles / unitsPerCarton).toFixed(2));
    const wastageCartons = Number((wastageBottles / unitsPerCarton).toFixed(2));

    // Validate & normalize material consumption items
    if (!params.consumed_materials || params.consumed_materials.length === 0) {
      throw new Error('At least one raw material consumption entry is required for a production batch.');
    }

    const usageList: BatchMaterialUsage[] = [];
    let batchTotalCost = 0;

    for (const item of params.consumed_materials) {
      const enteredQty = Number(item.entered_quantity);
      if (!Number.isFinite(enteredQty) || enteredQty <= 0) {
        continue;
      }

      const rm = db.raw_materials.find((m) => m.id === item.raw_material_id);
      if (!rm) {
        throw new Error(`Raw material ID "${item.raw_material_id}" not found in inventory.`);
      }

      const canonicalUnit = normalizeUnit(String(rm.unit));
      const enteredUnit = normalizeUnit(item.entered_unit || canonicalUnit);
      const normalizedActualQty = convertQuantityToTargetUnit(enteredQty, enteredUnit, canonicalUnit);
      const wastageQtyEntered = Number(item.wastage_quantity || 0);
      const normalizedWastageQty =
        wastageQtyEntered > 0
          ? convertQuantityToTargetUnit(wastageQtyEntered, enteredUnit, canonicalUnit)
          : 0;

      // When submitting for Admin approval, verify sufficient stock is currently available
      if (params.status === 'SUBMITTED' && rm.current_stock < normalizedActualQty) {
        throw new Error(
          `Insufficient stock for "${rm.name}": required ${enteredQty} ${enteredUnit} (${normalizedActualQty} ${canonicalUnit}), available ${rm.current_stock} ${canonicalUnit}.`
        );
      }

      const lineCost = Number((normalizedActualQty * (rm.average_cost_per_unit || 0)).toFixed(2));
      batchTotalCost += lineCost;

      usageList.push({
        raw_material_id: rm.id,
        raw_material_name: rm.name,
        unit: canonicalUnit,
        entered_unit: enteredUnit,
        entered_quantity: enteredQty,
        estimated_quantity: normalizedActualQty,
        actual_quantity: normalizedActualQty,
        wastage_quantity: normalizedWastageQty,
        opening_stock_snapshot: rm.current_stock,
        remaining_stock_snapshot: Number((rm.current_stock - normalizedActualQty).toFixed(4)),
        unit_cost_snapshot: rm.average_cost_per_unit || 0,
        total_cost: lineCost,
      });
    }

    if (usageList.length === 0) {
      throw new Error('Please enter valid quantities greater than zero for consumed raw materials.');
    }

    const machine =
      db.machines.find((m) => m.id === params.machine_id) ||
      db.machines[0] || {
        id: 'mach-1',
        name: 'Line A Filling Monoblock',
      };

    const nowIso = new Date().toISOString();
    const prodDate = (params.production_date || '').trim() || nowIso.split('T')[0];

    if (existingBatch) {
      existingBatch.product_id = product.id;
      existingBatch.product_name = product.name;
      existingBatch.flavour_name = product.flavour_name;
      existingBatch.bottle_size_label = bottleSizeLabel;
      existingBatch.units_per_carton = unitsPerCarton;
      existingBatch.target_bottles = targetBottles;
      existingBatch.actual_bottles = actualBottles;
      existingBatch.wastage_bottles = wastageBottles;
      existingBatch.target_cartons = targetCartons;
      existingBatch.actual_cartons = actualCartons;
      existingBatch.wastage_cartons = wastageCartons;
      existingBatch.damaged_units = wastageBottles;
      existingBatch.production_date = prodDate;
      existingBatch.machine_id = machine.id;
      existingBatch.machine_name = machine.name;
      existingBatch.status = params.status;
      existingBatch.material_usage = usageList;
      existingBatch.total_production_cost = Math.round(batchTotalCost);
      existingBatch.cost_per_carton = actualCartons > 0 ? Number((batchTotalCost / actualCartons).toFixed(2)) : 0;
      existingBatch.remarks = params.remarks || existingBatch.remarks;
      existingBatch.updated_at = nowIso;
      if (params.status === 'SUBMITTED') {
        existingBatch.submitted_by = params.actor.id;
        existingBatch.submitted_by_name = params.actor.full_name;
        existingBatch.submitted_at = nowIso;
        existingBatch.rejection_reason = undefined;
      }

      appendAuditLog(db, {
        actor_id: params.actor.id,
        actor_name: params.actor.full_name,
        actor_role: params.actor.role,
        action: params.status === 'SUBMITTED' ? 'PRODUCTION_BATCH_SUBMITTED' : 'PRODUCTION_BATCH_DRAFT_SAVED',
        entity_type: 'production_batches',
        entity_id: existingBatch.id,
        summary: `${params.status === 'SUBMITTED' ? 'Submitted' : 'Saved draft'} production batch ${existingBatch.batch_number} (${actualBottles} bottles of ${product.name} ${bottleSizeLabel}).`,
      });

      return existingBatch;
    }

    const dateCode = prodDate.replace(/-/g, '').slice(2);
    const seq = String(db.production_batches.length + 1).padStart(3, '0');
    const batchNumber = `BATCH-${flavourName.slice(0, 3).toUpperCase()}-${dateCode}-${seq}`;

    const newBatch: ProductionBatch = {
      id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      batch_number: batchNumber,
      production_date: prodDate,
      product_id: product.id,
      product_name: product.name,
      flavour_name: product.flavour_name,
      bottle_size_label: bottleSizeLabel,
      packaging_type_name: product.packaging_type_name,
      units_per_carton: unitsPerCarton,
      target_bottles: targetBottles,
      actual_bottles: actualBottles,
      wastage_bottles: wastageBottles,
      target_cartons: targetCartons,
      actual_cartons: actualCartons,
      wastage_cartons: wastageCartons,
      damaged_units: wastageBottles,
      machine_id: machine.id,
      machine_name: machine.name,
      status: params.status,
      inventory_posted: false,
      submitted_by: params.status === 'SUBMITTED' ? params.actor.id : undefined,
      submitted_by_name: params.status === 'SUBMITTED' ? params.actor.full_name : params.actor.full_name,
      submitted_at: params.status === 'SUBMITTED' ? nowIso : undefined,
      total_production_cost: Math.round(batchTotalCost),
      cost_per_carton: actualCartons > 0 ? Number((batchTotalCost / actualCartons).toFixed(2)) : 0,
      remarks: params.remarks || `${actualBottles} bottles (${bottleSizeLabel})`,
      created_by: params.actor.id,
      created_at: nowIso,
      updated_at: nowIso,
      material_usage: usageList,
    };

    db.production_batches.unshift(newBatch);

    if (params.status === 'SUBMITTED') {
      db.notifications.unshift({
        id: `notif-sub-${Date.now()}`,
        type: 'PRODUCTION_COMPLETED',
        title: `Pending Production Approval: ${newBatch.batch_number}`,
        message: `${params.actor.full_name} submitted ${actualBottles} bottles of ${product.name} (${bottleSizeLabel}) for Admin approval.`,
        severity: 'info',
        target_roles: ['OWNER'],
        is_read: false,
        link_href: '/production',
        created_at: nowIso,
      });
    }

    appendAuditLog(db, {
      actor_id: params.actor.id,
      actor_name: params.actor.full_name,
      actor_role: params.actor.role,
      action: params.status === 'SUBMITTED' ? 'PRODUCTION_BATCH_SUBMITTED' : 'PRODUCTION_BATCH_DRAFT_CREATED',
      entity_type: 'production_batches',
      entity_id: newBatch.id,
      summary: `${params.status === 'SUBMITTED' ? 'Submitted' : 'Created draft'} batch ${newBatch.batch_number}: ${actualBottles} bottles of ${product.name} (${bottleSizeLabel}).`,
    });

    return newBatch;
  });
}

/**
 * SECTION 3 & 4: ADMIN REVIEW OF SUBMITTED PRODUCTION BATCH (APPROVED / REJECTED)
 * - Prevents duplicate approval if clicked more than once.
 * - On APPROVED:
 *   1. Deducts actual consumed raw materials in canonical units EXACTLY ONCE.
 *   2. Creates permanent StockLedgerEntry rows with Opening, Received, Consumed, and Closing quantities.
 *   3. Adds finished goods (+Bottles & +Cartons) to FinishedGoodsInventory EXACTLY ONCE.
 *   4. Records approving Admin and approval timestamp.
 */
export function reviewProductionBatchByAdmin(params: {
  batch_id: string;
  decision: 'APPROVED' | 'REJECTED';
  rejection_reason?: string;
  actor: UserProfile;
}): ProductionBatch {
  if (params.actor.role !== 'OWNER') {
    throw new Error('Forbidden: Only Admin / Owner can approve or reject submitted production reports.');
  }

  return withErpTransaction((db) => {
    const batch = db.production_batches.find((b) => b.id === params.batch_id);
    if (!batch) {
      throw new Error(`Production batch "${params.batch_id}" not found.`);
    }

    if (batch.status === 'APPROVED' || batch.inventory_posted) {
      throw new Error(
        `Duplicate deduction prevented: Batch ${batch.batch_number} has already been APPROVED and posted to inventory.`
      );
    }

    if (batch.status !== 'SUBMITTED') {
      throw new Error(
        `Batch ${batch.batch_number} has status "${batch.status}". Only SUBMITTED batches can be approved or rejected by Admin.`
      );
    }

    const nowIso = new Date().toISOString();

    if (params.decision === 'REJECTED') {
      batch.status = 'REJECTED';
      batch.rejection_reason = (params.rejection_reason || '').trim() || 'Rejected by Admin during review';
      batch.verified_by = params.actor.id;
      batch.verified_by_name = params.actor.full_name;
      batch.verified_at = nowIso;
      batch.updated_at = nowIso;

      db.notifications.unshift({
        id: `notif-rej-${Date.now()}`,
        type: 'PRODUCTION_SHORTAGE',
        title: `Production Batch Rejected: ${batch.batch_number}`,
        message: `Admin ${params.actor.full_name} rejected batch ${batch.batch_number}. Reason: ${batch.rejection_reason}`,
        severity: 'warning',
        target_roles: ['PRODUCTION_MANAGER', 'OWNER'],
        is_read: false,
        link_href: '/production',
        created_at: nowIso,
      });

      appendAuditLog(db, {
        actor_id: params.actor.id,
        actor_name: params.actor.full_name,
        actor_role: params.actor.role,
        action: 'PRODUCTION_BATCH_REJECTED',
        entity_type: 'production_batches',
        entity_id: batch.id,
        summary: `Rejected production batch ${batch.batch_number}. Reason: ${batch.rejection_reason}. No stock was deducted.`,
      });

      return batch;
    }

    // DECISION === 'APPROVED'
    // Pass 1: Verify all raw materials have enough stock before mutating anything
    for (const usage of batch.material_usage) {
      const rm = db.raw_materials.find((m) => m.id === usage.raw_material_id);
      if (!rm) {
        throw new Error(`Raw material "${usage.raw_material_name}" not found in inventory.`);
      }
      const canonicalUnit = normalizeUnit(String(rm.unit));
      const enteredUnit = normalizeUnit(String(usage.entered_unit || usage.unit || canonicalUnit));
      const enteredQty = Number(usage.entered_quantity ?? usage.actual_quantity);
      const normalizedConsumed = convertQuantityToTargetUnit(enteredQty, enteredUnit, canonicalUnit);

      if (rm.current_stock < normalizedConsumed) {
        throw new Error(
          `Cannot approve batch ${batch.batch_number}: Insufficient stock for "${rm.name}". Required: ${enteredQty} ${enteredUnit} (${normalizedConsumed} ${canonicalUnit}), Available: ${rm.current_stock} ${canonicalUnit}.`
        );
      }
    }

    // Pass 2: Deduct raw materials exactly once & write permanent stock ledger entries
    let totalCost = 0;
    for (const usage of batch.material_usage) {
      const rm = db.raw_materials.find((m) => m.id === usage.raw_material_id)!;
      const canonicalUnit = normalizeUnit(String(rm.unit));
      const enteredUnit = normalizeUnit(String(usage.entered_unit || usage.unit || canonicalUnit));
      const enteredQty = Number(usage.entered_quantity ?? usage.actual_quantity);
      const normalizedConsumed = convertQuantityToTargetUnit(enteredQty, enteredUnit, canonicalUnit);

      const openingBeforeBatch = Number((rm.current_stock ?? 0).toFixed(4));
      rm.stock_consumed = Number(((rm.stock_consumed ?? 0) + normalizedConsumed).toFixed(4));
      recalculateRawMaterialStock(rm);
      const closingAfterBatch = rm.current_stock;

      usage.unit = canonicalUnit;
      usage.actual_quantity = normalizedConsumed;
      usage.opening_stock_snapshot = openingBeforeBatch;
      usage.remaining_stock_snapshot = closingAfterBatch;
      usage.unit_cost_snapshot = rm.average_cost_per_unit || 0;
      usage.total_cost = Number((normalizedConsumed * (rm.average_cost_per_unit || 0)).toFixed(2));
      totalCost += usage.total_cost;

      const ledgerEntry: StockLedgerEntry = {
        id: `sled-cons-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        material_id: rm.id,
        material_name: rm.name,
        unit: canonicalUnit,
        opening_quantity: openingBeforeBatch,
        stock_received: 0,
        quantity_consumed: normalizedConsumed,
        adjustment_quantity: 0,
        closing_quantity: closingAfterBatch,
        transaction_type: 'PRODUCTION_CONSUMPTION',
        reference_number: batch.batch_number,
        notes: `Consumed ${enteredQty} ${enteredUnit} (${normalizedConsumed} ${canonicalUnit}) for ${
          batch.actual_bottles ?? Math.round(batch.actual_cartons * batch.units_per_carton)
        } bottles of ${batch.product_name} (${batch.bottle_size_label})`,
        entered_by_id: batch.submitted_by || batch.created_by,
        entered_by_name: batch.submitted_by_name || 'Production Manager',
        approved_by_id: params.actor.id,
        approved_by_name: params.actor.full_name,
        date: batch.production_date,
        created_at: nowIso,
      };
      db.stock_ledger.unshift(ledgerEntry);

      db.inventory_movements.unshift({
        id: `mov-rm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        item_type: 'RAW_MATERIAL',
        item_id: rm.id,
        item_name: rm.name,
        batch_number: batch.batch_number,
        movement_type: 'RAW_MATERIAL_CONSUMED',
        quantity_change: -normalizedConsumed,
        balance_after: closingAfterBatch,
        reference_type: 'BATCH',
        reference_id: batch.batch_number,
        notes: `Approved Batch ${batch.batch_number}: Consumed ${enteredQty} ${enteredUnit} (${normalizedConsumed} ${canonicalUnit})`,
        performed_by: params.actor.full_name,
        created_at: nowIso,
      });

      if (rm.current_stock <= rm.minimum_stock_level) {
        db.notifications.unshift({
          id: `notif-low-${Date.now()}-${rm.id}`,
          type: 'LOW_RAW_MATERIAL',
          title: `Low Raw Material Stock: ${rm.name}`,
          message: `${rm.name} remaining stock is ${rm.current_stock} ${canonicalUnit} (Minimum: ${rm.minimum_stock_level} ${canonicalUnit}).`,
          severity: 'critical',
          target_roles: ['OWNER', 'PRODUCTION_MANAGER'],
          is_read: false,
          link_href: '/raw-materials',
          created_at: nowIso,
        });
      }
    }

    // Pass 3: Add Finished Goods Inventory (+Bottles and +Cartons) exactly once
    const actualBottles =
      batch.actual_bottles ?? Math.round(batch.actual_cartons * (batch.units_per_carton || 24));
    const unitsPerCarton = batch.units_per_carton || 24;
    const actualCartons = Number((actualBottles / unitsPerCarton).toFixed(2));

    batch.actual_bottles = actualBottles;
    batch.actual_cartons = actualCartons;
    batch.total_production_cost = Math.round(totalCost);
    batch.cost_per_carton = actualCartons > 0 ? Number((totalCost / actualCartons).toFixed(2)) : 0;
    batch.status = 'APPROVED';
    batch.inventory_posted = true;
    batch.verified_by = params.actor.id;
    batch.verified_by_name = params.actor.full_name;
    batch.verified_at = nowIso;
    batch.updated_at = nowIso;

    let fg = db.finished_goods.find((f) => f.product_id === batch.product_id);
    if (!fg) {
      fg = {
        id: `fg-${batch.product_id}`,
        product_id: batch.product_id,
        product_name: batch.product_name,
        sku: `FF-${batch.flavour_name.slice(0, 3).toUpperCase()}-${batch.bottle_size_label.replace(/\s+/g, '')}`,
        flavour_name: batch.flavour_name,
        bottle_size_label: batch.bottle_size_label,
        packaging_type_name: batch.packaging_type_name,
        units_per_carton: unitsPerCarton,
        opening_stock_bottles: 0,
        verified_production_bottles: 0,
        dispatched_bottles: 0,
        damaged_bottles: 0,
        closing_stock_bottles: 0,
        available_bottles: 0,
        opening_stock_cartons: 0,
        verified_production_cartons: 0,
        approved_returns_cartons: 0,
        dispatched_cartons: 0,
        damaged_cartons: 0,
        closing_stock_cartons: 0,
        reserved_cartons: 0,
        available_cartons: 0,
        latest_batch_number: batch.batch_number,
        latest_production_date: batch.production_date,
        valuation_per_carton: batch.cost_per_carton || 900,
        updated_at: nowIso,
      };
      db.finished_goods.push(fg);
    }

    fg.verified_production_bottles = (fg.verified_production_bottles ?? 0) + actualBottles;
    fg.verified_production_cartons = Number(
      ((fg.verified_production_cartons ?? 0) + actualCartons).toFixed(2)
    );
    fg.latest_batch_number = batch.batch_number;
    fg.latest_production_date = batch.production_date;
    recalculateFinishedGoodsRow(fg);

    db.inventory_movements.unshift({
      id: `mov-fg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      item_type: 'FINISHED_GOOD',
      item_id: batch.product_id,
      item_name: `${batch.product_name} (${batch.bottle_size_label})`,
      batch_number: batch.batch_number,
      movement_type: 'PRODUCTION_VERIFIED',
      quantity_change: actualBottles,
      balance_after: fg.closing_stock_bottles ?? Math.round(fg.closing_stock_cartons * unitsPerCarton),
      reference_type: 'BATCH',
      reference_id: batch.batch_number,
      notes: `Approved Batch ${batch.batch_number}: +${actualBottles} Bottles (+${actualCartons} Cartons)`,
      performed_by: params.actor.full_name,
      created_at: nowIso,
    });

    db.notifications.unshift({
      id: `notif-app-${Date.now()}`,
      type: 'PRODUCTION_COMPLETED',
      title: `Production Batch Approved: ${batch.batch_number}`,
      message: `Admin ${params.actor.full_name} approved ${batch.batch_number}. +${actualBottles} Bottles of ${batch.product_name} added to inventory and raw materials deducted.`,
      severity: 'success',
      target_roles: ['OWNER', 'PRODUCTION_MANAGER'],
      is_read: false,
      link_href: '/production',
      created_at: nowIso,
    });

    appendAuditLog(db, {
      actor_id: params.actor.id,
      actor_name: params.actor.full_name,
      actor_role: params.actor.role,
      action: 'PRODUCTION_BATCH_APPROVED',
      entity_type: 'production_batches',
      entity_id: batch.id,
      summary: `Approved production batch ${batch.batch_number} (+${actualBottles} Bottles of ${batch.product_name} ${batch.bottle_size_label}). Deducted consumed raw materials and updated finished goods inventory.`,
    });

    return batch;
  });
}

/**
 * SECTION 5: AUTHORIZED OWNER RAW MATERIAL STOCK ADJUSTMENT
 * Supports explicit adjustment_type ('INCREASE' | 'DECREASE') or signed adjustment_quantity.
 * Requires mandatory reason, prevents negative stock, and logs to stock_ledger + audit_logs.
 */
export function adjustRawMaterialStock(params: {
  material_id: string;
  adjustment_type?: 'INCREASE' | 'DECREASE' | 'CORRECTION';
  adjustment_quantity: number;
  unit?: string;
  reason: string;
  adjustment_date?: string;
  actor: UserProfile;
}): { raw_material: RawMaterial; ledger_entry: StockLedgerEntry } {
  if (params.actor.role !== 'OWNER') {
    throw new Error('Forbidden: Only the Owner (Sikandar Raja) can perform stock adjustments.');
  }

  const reasonTrimmed = (params.reason || '').trim();
  if (!reasonTrimmed) {
    throw new Error('A clear reason is required for any stock adjustment.');
  }

  const rawQty = Number(params.adjustment_quantity);
  if (!Number.isFinite(rawQty) || rawQty === 0) {
    throw new Error('Adjustment quantity must be a non-zero number.');
  }

  return withErpTransaction((db) => {
    const rm = db.raw_materials.find((m) => m.id === params.material_id);
    if (!rm) {
      throw new Error('Raw material not found.');
    }

    const canonicalUnit = normalizeUnit(String(rm.unit));
    const enteredUnit = normalizeUnit(String(params.unit || canonicalUnit));
    const absConverted = convertQuantityToTargetUnit(
      Math.abs(rawQty),
      enteredUnit,
      canonicalUnit,
      { boxToPieceFactor: rm.box_to_piece_factor }
    );

    const isDecrease =
      params.adjustment_type === 'DECREASE' || (params.adjustment_type === undefined && rawQty < 0);
    const signedAdj = isDecrease ? -absConverted : absConverted;

    const openingBefore = Number((rm.current_stock ?? 0).toFixed(4));
    if (openingBefore + signedAdj < 0) {
      throw new Error(
        `Insufficient stock for adjustment: "${rm.name}" available stock is ${openingBefore} ${canonicalUnit}, cannot deduct ${absConverted} ${canonicalUnit}.`
      );
    }

    rm.stock_adjusted = Number(((rm.stock_adjusted ?? 0) + signedAdj).toFixed(4));
    recalculateRawMaterialStock(rm);
    const closingAfter = rm.current_stock;
    const nowIso = new Date().toISOString();
    const adjDate = (params.adjustment_date || '').trim() || nowIso.split('T')[0];
    const refNo = `ADJ-${Date.now().toString().slice(-5)}-${Math.random().toString(36).slice(2, 4).toUpperCase()}`;

    const ledgerEntry: StockLedgerEntry = {
      id: `sled-adj-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      raw_material_id: rm.id,
      material_id: rm.id,
      material_name: rm.name,
      unit: canonicalUnit,
      opening_quantity: openingBefore,
      stock_received: 0,
      quantity_consumed: 0,
      adjustment_quantity: signedAdj,
      closing_quantity: closingAfter,
      previous_stock: openingBefore,
      quantity_added: signedAdj > 0 ? signedAdj : 0,
      quantity_deducted: signedAdj < 0 ? Math.abs(signedAdj) : 0,
      updated_stock: closingAfter,
      transaction_type:
        params.adjustment_type === 'CORRECTION' ? 'STOCK_CORRECTION' : 'STOCK_ADJUSTMENT',
      reference_number: refNo,
      notes: `Owner Adjustment (${isDecrease ? 'Decrease' : 'Increase'} ${Math.abs(rawQty)} ${enteredUnit}): ${reasonTrimmed}`,
      entered_by: params.actor.full_name,
      entered_by_id: params.actor.id,
      entered_by_name: params.actor.full_name,
      approved_by: params.actor.full_name,
      approved_by_id: params.actor.id,
      approved_by_name: params.actor.full_name,
      date: adjDate,
      created_at: nowIso,
    };
    db.stock_ledger.unshift(ledgerEntry);

    // Trigger low stock alert if minimum_stock_level > 0 and stock <= minimum_stock_level
    if (rm.minimum_stock_level > 0 && rm.current_stock <= rm.minimum_stock_level) {
      db.notifications.unshift({
        id: `notif-low-${Date.now()}-${rm.id}`,
        type: 'LOW_RAW_MATERIAL',
        title: `Low Raw Material Stock: ${rm.name}`,
        message: `${rm.name} available stock is ${rm.current_stock} ${canonicalUnit} (Configured Minimum: ${rm.minimum_stock_level} ${canonicalUnit}).`,
        severity: 'warning',
        target_roles: ['OWNER', 'PRODUCTION_MANAGER'],
        is_read: false,
        link_href: '/raw-materials',
        created_at: nowIso,
      });
    }

    appendAuditLog(db, {
      actor_id: params.actor.id,
      actor_name: params.actor.full_name,
      actor_role: params.actor.role,
      action: 'RAW_MATERIAL_STOCK_ADJUSTED',
      entity_type: 'raw_materials',
      entity_id: rm.id,
      summary: `Adjusted ${rm.name} by ${signedAdj > 0 ? '+' : ''}${signedAdj} ${canonicalUnit} (Reason: ${reasonTrimmed}). Previous: ${openingBefore} -> Updated: ${closingAfter} ${canonicalUnit}.`,
    });

    return { raw_material: rm, ledger_entry: ledgerEntry };
  });
}

/**
 * PHASE 2: Owner-only Opening Stock Entry.
 * - Sets initial opening stock for a raw material once.
 * - Prevents duplicate opening stock entries from silently overwriting existing quantities.
 * - Converts compatible units (e.g., GRAM -> KG, ML -> LITRE) and records an OPENING_STOCK movement.
 */
export function setRawMaterialOpeningStock(params: {
  material_id: string;
  opening_quantity: number;
  unit?: string;
  opening_date?: string;
  notes?: string;
  actor: UserProfile;
}): { raw_material: RawMaterial; ledger_entry: StockLedgerEntry } {
  if (params.actor.role !== 'OWNER') {
    throw new Error('Forbidden: Only the Owner (Sikandar Raja) can enter opening stock.');
  }

  const enteredQty = Number(params.opening_quantity);
  if (!Number.isFinite(enteredQty) || enteredQty <= 0) {
    throw new Error('Opening stock quantity must be greater than zero.');
  }

  return withErpTransaction((db) => {
    const rm = db.raw_materials.find((m) => m.id === params.material_id);
    if (!rm) {
      throw new Error('Raw material not found.');
    }

    if (rm.opening_stock_set) {
      throw new Error(
        `Duplicate opening stock prevented: Opening stock has already been recorded for "${rm.name}". Use an auditable Stock Adjustment to modify stock.`
      );
    }

    const canonicalUnit = normalizeUnit(String(rm.unit));
    const enteredUnit = normalizeUnit(String(params.unit || canonicalUnit));
    const normalizedQty = convertQuantityToTargetUnit(
      enteredQty,
      enteredUnit,
      canonicalUnit,
      { boxToPieceFactor: rm.box_to_piece_factor }
    );

    const previousStock = Number((rm.current_stock ?? 0).toFixed(4));
    const nowIso = new Date().toISOString();
    const openDate = (params.opening_date || '').trim() || nowIso.split('T')[0];

    rm.opening_stock = normalizedQty;
    rm.opening_stock_set = true;
    rm.opening_stock_date = openDate;
    rm.unit = canonicalUnit;
    recalculateRawMaterialStock(rm);
    const updatedStock = rm.current_stock;

    const refNo = `OPEN-${rm.code}`;
    const ledgerEntry: StockLedgerEntry = {
      id: `sled-open-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      raw_material_id: rm.id,
      material_id: rm.id,
      material_name: rm.name,
      unit: canonicalUnit,
      opening_quantity: previousStock,
      stock_received: normalizedQty,
      quantity_consumed: 0,
      adjustment_quantity: 0,
      closing_quantity: updatedStock,
      previous_stock: previousStock,
      quantity_added: normalizedQty,
      quantity_deducted: 0,
      updated_stock: updatedStock,
      transaction_type: 'OPENING_STOCK',
      reference_number: refNo,
      notes:
        (params.notes || '').trim() ||
        `Opening stock entered by Owner: +${enteredQty} ${enteredUnit} (${normalizedQty} ${canonicalUnit})`,
      entered_by: params.actor.full_name,
      entered_by_id: params.actor.id,
      entered_by_name: params.actor.full_name,
      approved_by: params.actor.full_name,
      approved_by_id: params.actor.id,
      approved_by_name: params.actor.full_name,
      date: openDate,
      created_at: nowIso,
    };
    db.stock_ledger.unshift(ledgerEntry);

    appendAuditLog(db, {
      actor_id: params.actor.id,
      actor_name: params.actor.full_name,
      actor_role: params.actor.role,
      action: 'RAW_MATERIAL_OPENING_STOCK_SET',
      entity_type: 'raw_materials',
      entity_id: rm.id,
      summary: `Set opening stock for ${rm.name}: +${enteredQty} ${enteredUnit} (${normalizedQty} ${canonicalUnit}). Previous: ${previousStock} -> Updated: ${updatedStock} ${canonicalUnit}.`,
    });

    return { raw_material: rm, ledger_entry: ledgerEntry };
  });
}

/**
 * PHASE 2: Owner configures minimum stock alert threshold and optional Box-to-Piece conversion factor.
 */
export function configureRawMaterialSettings(params: {
  material_id: string;
  minimum_stock_level?: number;
  box_to_piece_factor?: number | null;
  actor: UserProfile;
}): RawMaterial {
  if (params.actor.role !== 'OWNER') {
    throw new Error(
      'Forbidden: Only the Owner (Sikandar Raja) can configure minimum stock thresholds or unit conversion factors.'
    );
  }

  return withErpTransaction((db) => {
    const rm = db.raw_materials.find((m) => m.id === params.material_id);
    if (!rm) {
      throw new Error('Raw material not found.');
    }

    if (params.minimum_stock_level !== undefined) {
      const minLvl = Number(params.minimum_stock_level);
      if (!Number.isFinite(minLvl) || minLvl < 0) {
        throw new Error('Minimum stock level cannot be negative.');
      }
      rm.minimum_stock_level = Number(minLvl.toFixed(4));
    }

    if (params.box_to_piece_factor !== undefined) {
      if (params.box_to_piece_factor === null || Number(params.box_to_piece_factor) === 0) {
        rm.box_to_piece_factor = null;
      } else {
        const factor = Number(params.box_to_piece_factor);
        if (!Number.isFinite(factor) || factor <= 0) {
          throw new Error('Box-to-Piece conversion factor must be greater than zero.');
        }
        rm.box_to_piece_factor = Number(factor.toFixed(4));
      }
    }

    rm.updated_at = new Date().toISOString();

    appendAuditLog(db, {
      actor_id: params.actor.id,
      actor_name: params.actor.full_name,
      actor_role: params.actor.role,
      action: 'RAW_MATERIAL_THRESHOLD_CONFIGURED',
      entity_type: 'raw_materials',
      entity_id: rm.id,
      summary: `Configured ${rm.name}: minimum_stock_level=${rm.minimum_stock_level} ${rm.unit}${
        rm.box_to_piece_factor ? `, box_to_piece_factor=${rm.box_to_piece_factor}` : ''
      }.`,
    });

    return rm;
  });
}

/**
 * SECTION 1A: ADMIN EMPLOYEE MANAGEMENT (Add/Edit Production Managers, Bookers, Staff)
 */
export function manageEmployeeAccount(params: {
  user_id?: string;
  full_name: string;
  email: string;
  phone: string;
  role: RoleName;
  password?: string;
  department?: string;
  can_record_purchases?: boolean;
  assigned_area_id?: string;
  is_active?: boolean;
  actor: UserProfile;
}): UserProfile {
  if (params.actor.role !== 'OWNER') {
    throw new Error('Forbidden: Only Admin / Owner can add or manage employee accounts.');
  }

  return withErpTransaction((db) => {
    const nowIso = new Date().toISOString();
    if (params.user_id) {
      const existing = db.users.find((u) => u.id === params.user_id);
      if (!existing) throw new Error('Employee user not found.');
      if (params.full_name) existing.full_name = params.full_name.trim();
      if (params.email) existing.email = params.email.trim().toLowerCase();
      if (params.phone) existing.phone = params.phone.trim();
      if (params.role) existing.role = params.role;
      if (params.department !== undefined) existing.department = params.department.trim();
      if (params.password && params.password.trim()) {
        existing.password_hash = hashPasswordSecure(params.password.trim());
      }
      if (typeof params.can_record_purchases === 'boolean') {
        existing.can_record_purchases = params.can_record_purchases;
      }
      if (params.assigned_area_id !== undefined) {
        existing.assigned_area_id = params.assigned_area_id;
      }
      if (typeof params.is_active === 'boolean') {
        existing.is_active = params.is_active;
      }
      existing.updated_at = nowIso;

      appendAuditLog(db, {
        actor_id: params.actor.id,
        actor_name: params.actor.full_name,
        actor_role: params.actor.role,
        action: 'EMPLOYEE_UPDATED',
        entity_type: 'users',
        entity_id: existing.id,
        summary: `Updated employee ${existing.full_name} (${existing.role}, active=${existing.is_active}, can_record_purchases=${Boolean(existing.can_record_purchases)}).`,
      });
      return existing;
    }

    const emailClean = params.email.trim().toLowerCase();
    if (!emailClean || !params.full_name.trim()) {
      throw new Error('Employee full name and email are required.');
    }
    if (db.users.some((u) => u.email.toLowerCase() === emailClean)) {
      throw new Error(`An employee with email "${emailClean}" already exists.`);
    }

    const rawPass = params.password ? params.password.trim() : '';
    if (!rawPass) {
      throw new Error('A password is required when creating a new user account.');
    }

    const newUser: UserProfile = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      email: emailClean,
      full_name: params.full_name.trim(),
      phone: params.phone.trim() || '+92-300-0000000',
      role: params.role,
      is_active: params.is_active ?? true,
      password_hash: hashPasswordSecure(rawPass),
      department:
        params.department?.trim() ||
        (params.role === 'PRODUCTION_MANAGER'
          ? 'Factory Production & Quality'
          : params.role === 'OWNER'
          ? 'Executive Management'
          : 'Sales & Distribution'),
      can_record_purchases: Boolean(params.can_record_purchases),
      assigned_area_id: params.assigned_area_id,
      working_hours_start: '08:00',
      working_hours_end: '18:00',
      duty_status: 'ON_DUTY',
      last_login_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    };
    db.users.push(newUser);

    appendAuditLog(db, {
      actor_id: params.actor.id,
      actor_name: params.actor.full_name,
      actor_role: params.actor.role,
      action: 'EMPLOYEE_CREATED',
      entity_type: 'users',
      entity_id: newUser.id,
      summary: `Created employee account for ${newUser.full_name} (${newUser.role} - ${newUser.email}).`,
    });

    return newUser;
  });
}

/**
 * Reverse a Supplier Ledger entry with an auditable reversal entry
 */
export function reverseSupplierLedgerEntry(params: {
  ledger_entry_id: string;
  reason: string;
  actor: UserProfile;
}): SupplierLedgerEntry {
  if (params.actor.role !== 'OWNER') {
    throw new Error('Forbidden: Only Admin / Owner can reverse supplier ledger entries.');
  }
  return withErpTransaction((db) => {
    const original = db.supplier_ledger.find((e) => e.id === params.ledger_entry_id);
    if (!original) throw new Error('Supplier ledger entry not found.');
    if (original.is_reversed) throw new Error('This supplier ledger entry has already been reversed.');

    const supplier = db.suppliers.find((s) => s.id === original.supplier_id);
    if (!supplier) throw new Error('Associated supplier not found.');

    original.is_reversed = true;
    const revDebit = original.credit;
    const revCredit = original.debit;
    supplier.payable_balance = Math.max(
      0,
      Number((supplier.payable_balance + revCredit - revDebit).toFixed(2))
    );

    const revEntry: SupplierLedgerEntry = {
      id: `sldg-rev-${Date.now()}`,
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      date: new Date().toISOString().split('T')[0],
      description: `REVERSAL of ${original.reference_number}: ${params.reason}`,
      entry_type: 'REVERSAL_ENTRY',
      debit: revDebit,
      credit: revCredit,
      balance: supplier.payable_balance,
      reference_number: `REV-${original.reference_number}`,
      payment_method: 'Reversal',
      reverses_entry_id: original.id,
      entered_by_id: params.actor.id,
      entered_by_name: params.actor.full_name,
      remarks: params.reason,
      created_at: new Date().toISOString(),
    };
    db.supplier_ledger.push(revEntry);

    appendAuditLog(db, {
      actor_id: params.actor.id,
      actor_name: params.actor.full_name,
      actor_role: params.actor.role,
      action: 'SUPPLIER_LEDGER_REVERSED',
      entity_type: 'supplier_ledger',
      entity_id: revEntry.id,
      summary: `Reversed supplier ledger entry ${original.reference_number} for ${supplier.name} (Reason: ${params.reason}).`,
    });

    return revEntry;
  });
}

/**
 * Reverse a Financial Transaction with an auditable reversal entry
 */
export function reverseFinancialTransaction(params: {
  transaction_id: string;
  reason: string;
  actor: UserProfile;
}): FinancialTransaction {
  if (params.actor.role !== 'OWNER') {
    throw new Error('Forbidden: Only Admin / Owner can reverse financial transactions.');
  }
  return withErpTransaction((db) => {
    const original = db.financial_transactions.find((t) => t.id === params.transaction_id);
    if (!original) throw new Error('Financial transaction not found.');
    if (original.is_reversed) throw new Error('This financial transaction has already been reversed.');

    original.is_reversed = true;
    const oppositeDirection = original.direction === 'INFLOW' ? 'OUTFLOW' : 'INFLOW';

    const revTx = postFinancialTransaction(db, {
      transaction_date: new Date().toISOString().split('T')[0],
      reference_number: `REV-${original.reference_number}`,
      transaction_type: 'REVERSAL_ENTRY',
      payment_method: 'Reversal',
      direction: oppositeDirection,
      amount: original.amount,
      account_id: original.account_id,
      related_party_type: original.related_party_type,
      related_party_id: original.related_party_id,
      related_party_name: original.related_party_name,
      entered_by_id: params.actor.id,
      entered_by_name: params.actor.full_name,
      remarks: `REVERSAL of ${original.reference_number}: ${params.reason}`,
      reverses_transaction_id: original.id,
    });

    appendAuditLog(db, {
      actor_id: params.actor.id,
      actor_name: params.actor.full_name,
      actor_role: params.actor.role,
      action: 'FINANCIAL_TRANSACTION_REVERSED',
      entity_type: 'financial_transactions',
      entity_id: revTx.id,
      summary: `Created reversal entry ${revTx.reference_number} for ${original.account_name} (PKR ${original.amount.toLocaleString()}).`,
    });

    return revTx;
  });
}

/**
 * Switch between Clean Production Mode (no fake numbers) and Optional Test Seed Mode
 */
export function switchDatabaseEnvironmentMode(params: {
  mode: 'PRODUCTION_CLEAN' | 'TEST_SEED_MODE';
  actor: UserProfile;
}): ErpDatabaseState {
  if (params.actor.role !== 'OWNER') {
    throw new Error('Forbidden: Only Admin / Owner can reset or switch database environment mode.');
  }
  const nextState =
    params.mode === 'PRODUCTION_CLEAN'
      ? createCleanProductionDatabase()
      : createInitialSeedDatabase();
  writeErpDatabase(nextState);
  return nextState;
}

/**
 * PHASE 1: LEDGER-DERIVED MANAGER CASH ACCOUNT RECALCULATION
 * Always computes total_cash_received, total_spent_purchases, total_spent_expenses,
 * and available_balance directly from the complete manager_cash_transactions ledger.
 * Never relies on a manually editable balance field and never resets old balances.
 */
export function recalculateManagerCashAccountFromLedger(
  db: ErpDatabaseState,
  managerId: string
): ManagerCashAccount {
  const managerUser = db.users.find((u) => u.id === managerId);
  const managerName = managerUser?.full_name || 'Manager';

  let account = db.manager_cash_accounts.find((a) => a.manager_id === managerId);
  if (!account) {
    account = {
      manager_id: managerId,
      manager_name: managerName,
      total_cash_received: 0,
      total_spent_purchases: 0,
      total_spent_expenses: 0,
      available_balance: 0,
      updated_at: new Date().toISOString(),
    };
    db.manager_cash_accounts.push(account);
  }

  let totalReceived = 0;
  let totalPurchases = 0;
  let totalExpenses = 0;

  for (const tx of db.manager_cash_transactions) {
    if (tx.manager_id !== managerId) continue;
    if (tx.is_reversed) continue;
    if (tx.transaction_type === 'REVERSAL_ADJUSTMENT') continue;

    if (tx.transaction_type === 'CASH_ISSUED_BY_OWNER') {
      totalReceived = Number((totalReceived + tx.amount).toFixed(2));
    } else if (tx.transaction_type === 'MATERIAL_PURCHASE') {
      totalPurchases = Number((totalPurchases + tx.amount).toFixed(2));
    } else if (tx.transaction_type === 'FACTORY_EXPENSE') {
      totalExpenses = Number((totalExpenses + tx.amount).toFixed(2));
    }
  }

  const available = Number((totalReceived - totalPurchases - totalExpenses).toFixed(2));
  if (available < 0) {
    throw new Error(
      `Insufficient cash balance for ${managerName}: resulting balance Rs. ${available.toLocaleString()} cannot be negative.`
    );
  }

  account.manager_name = managerName;
  account.total_cash_received = totalReceived;
  account.total_spent_purchases = totalPurchases;
  account.total_spent_expenses = totalExpenses;
  account.available_balance = available;
  account.updated_at = new Date().toISOString();

  return account;
}

/**
 * PHASE 1: Owner-only cash issuance to a specific manager (Kamran Bhai or Imran Bhai).
 * - Strictly blocks managers from issuing cash to themselves or others.
 * - Preserves previous remaining balances (cumulative addition, never resets).
 * - Calculates balances from the complete transaction ledger.
 * - Supports idempotency_key to prevent duplicate submissions.
 */
export function issueCashToManagerAccount(params: {
  manager_id: string;
  amount: number;
  reference_number?: string;
  description?: string;
  transaction_date?: string;
  idempotency_key?: string;
  actor: UserProfile;
}): ManagerCashTransaction {
  if (params.actor.role !== 'OWNER') {
    throw new Error('Forbidden: Only the Owner (Sikandar Raja) can issue cash to managers.');
  }
  const amount = Number(params.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Cash issuance amount must be greater than zero.');
  }

  const idempKey = (params.idempotency_key || '').trim();

  return withErpTransaction((db) => {
    if (idempKey) {
      const existingTx = db.manager_cash_transactions.find(
        (t) => t.idempotency_key === idempKey
      );
      if (existingTx) {
        return existingTx;
      }
    }

    const managerUser = db.users.find(
      (u) => u.id === params.manager_id && u.role === 'PRODUCTION_MANAGER'
    );
    if (!managerUser) {
      throw new Error('Target manager account not found.');
    }

    const accountBefore = recalculateManagerCashAccountFromLedger(db, managerUser.id);
    const previousBalance = accountBefore.available_balance;
    const updatedBalance = Number((previousBalance + amount).toFixed(2));

    const nowIso = new Date().toISOString();
    const txDate = (params.transaction_date || '').trim() || nowIso.split('T')[0];
    const refNo =
      (params.reference_number || '').trim() ||
      `CASH-ISS-${Date.now().toString().slice(-5)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

    const tx: ManagerCashTransaction = {
      id: `mctx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      manager_id: managerUser.id,
      manager_name: managerUser.full_name,
      transaction_type: 'CASH_ISSUED_BY_OWNER',
      amount,
      previous_balance: previousBalance,
      updated_balance: updatedBalance,
      reference_number: refNo,
      description:
        (params.description || '').trim() ||
        `Cash issued by ${params.actor.full_name} to ${managerUser.full_name}`,
      created_by_id: params.actor.id,
      created_by_name: params.actor.full_name,
      transaction_date: txDate,
      created_at: nowIso,
      idempotency_key: idempKey || undefined,
      is_reversed: false,
    };

    db.manager_cash_transactions.unshift(tx);
    const accountAfter = recalculateManagerCashAccountFromLedger(db, managerUser.id);

    appendAuditLog(db, {
      actor_id: params.actor.id,
      actor_name: params.actor.full_name,
      actor_role: params.actor.role,
      action: 'CASH_ISSUED_TO_MANAGER',
      entity_type: 'manager_cash_transactions',
      entity_id: tx.id,
      summary: `Issued Rs. ${amount.toLocaleString()} to ${managerUser.full_name} (Prev: Rs. ${previousBalance.toLocaleString()} -> Updated: Rs. ${accountAfter.available_balance.toLocaleString()}).`,
    });

    return tx;
  });
}

/**
 * PHASE 1: Manager records a factory raw material purchase using their available cash.
 * - Deducts purchase amount from that manager's available cash balance.
 * - Adds purchased quantity (with unit conversion) to factory raw material inventory.
 * - Records purchase transaction, stock ledger entry, and manager cash transaction atomically.
 * - Does NOT require supplier registration.
 * - Prevents spending more than available balance and prevents duplicate submissions.
 */
export function recordManagerCashPurchase(params: {
  material_id?: string;
  material_name: string;
  category?: RawMaterial['category'];
  quantity: number;
  unit: string;
  total_amount: number;
  purchase_date?: string;
  description?: string;
  idempotency_key?: string;
  actor: UserProfile;
}): {
  cash_transaction: ManagerCashTransaction;
  raw_material: RawMaterial;
  ledger_entry: StockLedgerEntry;
} {
  if (params.actor.role !== 'PRODUCTION_MANAGER') {
    throw new Error(
      'Forbidden: Manager cash purchases must be recorded by an authenticated Manager (Kamran Bhai or Imran Bhai) under their own account.'
    );
  }

  const enteredQty = Number(params.quantity);
  if (!Number.isFinite(enteredQty) || enteredQty <= 0) {
    throw new Error('Purchase quantity must be greater than zero.');
  }

  const totalAmount = Number(params.total_amount);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error('Total purchase amount must be greater than zero.');
  }

  const materialNameTrimmed = (params.material_name || '').trim();
  if (!materialNameTrimmed) {
    throw new Error('Material name is required.');
  }

  const enteredUnit = normalizeUnit(params.unit);
  const nowIso = new Date().toISOString();
  const purchaseDate = (params.purchase_date || '').trim() || nowIso.split('T')[0];
  const idempKey = (params.idempotency_key || '').trim();

  return withErpTransaction((db) => {
    // 1. Check idempotency key to prevent duplicate deduction/stock addition
    if (idempKey) {
      const existingTx = db.manager_cash_transactions.find(
        (t) => t.idempotency_key === idempKey
      );
      if (existingTx) {
        const existingRm =
          db.raw_materials.find(
            (m) => m.name.toLowerCase() === materialNameTrimmed.toLowerCase()
          ) || db.raw_materials[0];
        const existingLedger =
          db.stock_ledger.find((l) => l.reference_number === existingTx.reference_number) ||
          db.stock_ledger[0];
        return {
          cash_transaction: existingTx,
          raw_material: existingRm,
          ledger_entry: existingLedger,
        };
      }
    }

    // 2. Recalculate manager cash balance from ledger and validate sufficient funds
    const accountBefore = recalculateManagerCashAccountFromLedger(db, params.actor.id);
    const previousBalance = accountBefore.available_balance;
    if (totalAmount > previousBalance) {
      throw new Error(
        `Insufficient available cash balance for ${params.actor.full_name}: Purchase amount Rs. ${totalAmount.toLocaleString()} exceeds available balance Rs. ${previousBalance.toLocaleString()}.`
      );
    }

    // 3. Find or create Raw Material and convert unit atomically (if unit conversion throws, nothing is mutated)
    let rm = db.raw_materials.find(
      (m) =>
        (params.material_id && m.id === params.material_id) ||
        m.name.toLowerCase() === materialNameTrimmed.toLowerCase()
    );

    const canonicalUnit = rm ? normalizeUnit(String(rm.unit)) : enteredUnit;
    const normalizedQty = convertQuantityToTargetUnit(
      enteredQty,
      enteredUnit,
      canonicalUnit,
      { boxToPieceFactor: rm?.box_to_piece_factor }
    );
    const unitCostCanonical =
      normalizedQty > 0 ? Number((totalAmount / normalizedQty).toFixed(2)) : 0;

    if (!rm) {
      const codePrefix =
        materialNameTrimmed
          .replace(/[^a-zA-Z0-9]/g, '')
          .slice(0, 4)
          .toUpperCase() || 'MAT';
      rm = {
        id: `rm-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        code: `RM-${codePrefix}-${db.raw_materials.length + 1}`,
        name: materialNameTrimmed,
        category: params.category || 'Chemical',
        unit: canonicalUnit,
        opening_stock: 0,
        stock_received: 0,
        stock_consumed: 0,
        stock_adjusted: 0,
        current_stock: 0,
        minimum_stock_level: 10,
        average_cost_per_unit: unitCostCanonical,
        last_purchase_price: unitCostCanonical,
        damaged_quantity: 0,
        supplier_id: null,
        supplier_name: 'Direct Market Purchase',
        updated_at: nowIso,
      };
      db.raw_materials.push(rm);
    }

    const openingStockBefore = Number((rm.current_stock ?? 0).toFixed(4));
    rm.stock_received = Number(((rm.stock_received ?? 0) + normalizedQty).toFixed(4));
    recalculateRawMaterialStock(rm);
    const closingStockAfter = rm.current_stock;

    if (unitCostCanonical > 0) {
      rm.last_purchase_price = unitCostCanonical;
      if (openingStockBefore <= 0 || rm.average_cost_per_unit <= 0) {
        rm.average_cost_per_unit = unitCostCanonical;
      } else {
        rm.average_cost_per_unit = Number(
          (
            (openingStockBefore * rm.average_cost_per_unit + totalAmount) /
            closingStockAfter
          ).toFixed(2)
        );
      }
    }

    const refNo = `MPUR-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
    const purchaseId = `pur-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const updatedBalance = Number((previousBalance - totalAmount).toFixed(2));
    const descClean = (params.description || '').trim();
    const fullDescription = descClean
      ? `Purchase: ${enteredQty} ${enteredUnit} ${rm.name} — ${descClean}`
      : `Purchase: ${enteredQty} ${enteredUnit} ${rm.name}`;

    // 4. Record Purchase & Receipt (no supplier required)
    const receipt: MaterialPurchaseReceipt = {
      id: purchaseId,
      invoice_number: refNo,
      purchase_date: purchaseDate,
      supplier_id: null,
      supplier_name: `Manager Cash (${params.actor.full_name})`,
      material_id: rm.id,
      material_name: rm.name,
      quantity_entered: enteredQty,
      unit_entered: enteredUnit,
      normalized_quantity: normalizedQty,
      canonical_unit: canonicalUnit,
      purchase_price_total: totalAmount,
      unit_cost: unitCostCanonical,
      notes: fullDescription,
      entered_by_id: params.actor.id,
      entered_by_name: params.actor.full_name,
      created_at: nowIso,
    };
    db.material_purchase_receipts.unshift(receipt);

    db.purchases.unshift({
      id: purchaseId,
      purchase_number: refNo,
      supplier_id: 'direct-purchase',
      supplier_name: `Manager Cash (${params.actor.full_name})`,
      purchase_date: purchaseDate,
      total_amount: totalAmount,
      amount_paid: totalAmount,
      payment_status: 'PAID',
      notes: fullDescription,
      created_by: params.actor.id,
      created_at: nowIso,
      items: [
        {
          id: `pi-${Date.now()}`,
          purchase_id: purchaseId,
          raw_material_id: rm.id,
          raw_material_name: rm.name,
          quantity: normalizedQty,
          unit: canonicalUnit,
          unit_price: unitCostCanonical,
          total_cost: totalAmount,
        },
      ],
    });

    // 5. Record Stock Movement Ledger Entry
    const ledgerEntry: StockLedgerEntry = {
      id: `sled-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      raw_material_id: rm.id,
      material_id: rm.id,
      material_name: rm.name,
      unit: canonicalUnit,
      opening_quantity: openingStockBefore,
      stock_received: normalizedQty,
      quantity_consumed: 0,
      adjustment_quantity: 0,
      closing_quantity: closingStockAfter,
      previous_stock: openingStockBefore,
      quantity_added: normalizedQty,
      quantity_deducted: 0,
      updated_stock: closingStockAfter,
      transaction_type: 'PURCHASE',
      reference_number: refNo,
      related_purchase_id: purchaseId,
      supplier_name: `Manager Cash (${params.actor.full_name})`,
      purchase_price: totalAmount,
      notes: fullDescription,
      entered_by: params.actor.full_name,
      entered_by_id: params.actor.id,
      entered_by_name: params.actor.full_name,
      approved_by: params.actor.full_name,
      approved_by_id: params.actor.id,
      approved_by_name: params.actor.full_name,
      date: purchaseDate,
      created_at: nowIso,
    };
    db.stock_ledger.unshift(ledgerEntry);

    db.inventory_movements.unshift({
      id: `mov-mpur-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      item_type: 'RAW_MATERIAL',
      item_id: rm.id,
      item_name: rm.name,
      movement_type: 'PURCHASE_RECEIVED',
      quantity_change: normalizedQty,
      balance_after: closingStockAfter,
      reference_type: 'PURCHASE',
      reference_id: refNo,
      notes: `${fullDescription} (Rs. ${totalAmount.toLocaleString()})`,
      performed_by: params.actor.full_name,
      created_at: nowIso,
    });

    // 6. Record Manager Cash Transaction & recalculate ledger-derived balance
    const cashTx: ManagerCashTransaction = {
      id: `mctx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      manager_id: params.actor.id,
      manager_name: params.actor.full_name,
      transaction_type: 'MATERIAL_PURCHASE',
      amount: totalAmount,
      previous_balance: previousBalance,
      updated_balance: updatedBalance,
      reference_number: refNo,
      description: fullDescription,
      created_by_id: params.actor.id,
      created_by_name: params.actor.full_name,
      transaction_date: purchaseDate,
      created_at: nowIso,
      idempotency_key: idempKey || undefined,
      related_purchase_id: purchaseId,
      material_name: rm.name,
      material_quantity: enteredQty,
      material_unit: enteredUnit,
      is_reversed: false,
    };
    db.manager_cash_transactions.unshift(cashTx);

    const accountAfter = recalculateManagerCashAccountFromLedger(db, params.actor.id);

    appendAuditLog(db, {
      actor_id: params.actor.id,
      actor_name: params.actor.full_name,
      actor_role: params.actor.role,
      action: 'MANAGER_CASH_PURCHASE_RECORDED',
      entity_type: 'manager_cash_transactions',
      entity_id: cashTx.id,
      summary: `${params.actor.full_name} purchased ${enteredQty} ${enteredUnit} ${rm.name} for Rs. ${totalAmount.toLocaleString()} (Cash Prev: Rs. ${previousBalance.toLocaleString()} -> Rem: Rs. ${accountAfter.available_balance.toLocaleString()}; Stock: ${openingStockBefore} -> ${closingStockAfter} ${canonicalUnit}).`,
    });

    return {
      cash_transaction: cashTx,
      raw_material: rm,
      ledger_entry: ledgerEntry,
    };
  });
}

/**
 * PHASE 1: Manager records a general factory expense using their available cash.
 * - Deducts expense amount from that manager's available cash balance.
 * - Records expense record and manager cash transaction atomically.
 * - Does NOT increase inventory.
 * - Prevents spending more than available balance and prevents duplicate submissions.
 */
export function recordManagerCashExpense(params: {
  category: string;
  amount: number;
  expense_date?: string;
  description: string;
  idempotency_key?: string;
  actor: UserProfile;
}): {
  cash_transaction: ManagerCashTransaction;
  expense: Expense;
} {
  if (params.actor.role !== 'PRODUCTION_MANAGER') {
    throw new Error(
      'Forbidden: Manager cash expenses must be recorded by an authenticated Manager (Kamran Bhai or Imran Bhai) under their own account.'
    );
  }

  const amount = Number(params.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Expense amount must be greater than zero.');
  }

  const descTrimmed = (params.description || '').trim();
  if (!descTrimmed) {
    throw new Error('Expense description is required.');
  }

  const categoryTrimmed = (params.category || 'Other expenses').trim();
  const nowIso = new Date().toISOString();
  const expenseDate = (params.expense_date || '').trim() || nowIso.split('T')[0];
  const idempKey = (params.idempotency_key || '').trim();

  return withErpTransaction((db) => {
    // 1. Check idempotency key to prevent duplicate deduction
    if (idempKey) {
      const existingTx = db.manager_cash_transactions.find(
        (t) => t.idempotency_key === idempKey
      );
      if (existingTx) {
        const existingExp =
          db.expenses.find((e) => e.id === existingTx.related_expense_id) ||
          db.expenses[0];
        return {
          cash_transaction: existingTx,
          expense: existingExp,
        };
      }
    }

    // 2. Recalculate manager cash balance from ledger and validate sufficient funds
    const accountBefore = recalculateManagerCashAccountFromLedger(db, params.actor.id);
    const previousBalance = accountBefore.available_balance;
    if (amount > previousBalance) {
      throw new Error(
        `Insufficient available cash balance for ${params.actor.full_name}: Expense amount Rs. ${amount.toLocaleString()} exceeds available balance Rs. ${previousBalance.toLocaleString()}.`
      );
    }

    const updatedBalance = Number((previousBalance - amount).toFixed(2));
    const refNo = `MEXP-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
    const expenseId = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;

    const expense: Expense = {
      id: expenseId,
      expense_number: refNo,
      category: categoryTrimmed as any,
      amount,
      date: expenseDate,
      description: descTrimmed,
      payment_method: 'Cash',
      receipt_attachment_url: null,
      created_by_id: params.actor.id,
      created_by_name: params.actor.full_name,
      approval_status: 'Approved',
      approved_by: params.actor.id,
      approved_at: nowIso,
      created_at: nowIso,
    };
    db.expenses.unshift(expense);

    const cashTx: ManagerCashTransaction = {
      id: `mctx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      manager_id: params.actor.id,
      manager_name: params.actor.full_name,
      transaction_type: 'FACTORY_EXPENSE',
      amount,
      previous_balance: previousBalance,
      updated_balance: updatedBalance,
      reference_number: refNo,
      description: `Expense (${categoryTrimmed}): ${descTrimmed}`,
      created_by_id: params.actor.id,
      created_by_name: params.actor.full_name,
      transaction_date: expenseDate,
      created_at: nowIso,
      idempotency_key: idempKey || undefined,
      related_expense_id: expenseId,
      expense_category: categoryTrimmed,
      is_reversed: false,
    };
    db.manager_cash_transactions.unshift(cashTx);

    const accountAfter = recalculateManagerCashAccountFromLedger(db, params.actor.id);

    appendAuditLog(db, {
      actor_id: params.actor.id,
      actor_name: params.actor.full_name,
      actor_role: params.actor.role,
      action: 'MANAGER_CASH_EXPENSE_RECORDED',
      entity_type: 'manager_cash_transactions',
      entity_id: cashTx.id,
      summary: `${params.actor.full_name} recorded factory expense (${categoryTrimmed}: ${descTrimmed}) of Rs. ${amount.toLocaleString()} (Cash Prev: Rs. ${previousBalance.toLocaleString()} -> Rem: Rs. ${accountAfter.available_balance.toLocaleString()}).`,
    });

    return {
      cash_transaction: cashTx,
      expense,
    };
  });
}

/**
 * PHASE 1: Owner-authorized reversal of a Manager Cash Transaction.
 * - Never silently deletes financial transactions.
 * - Marks the original transaction as reversed, appends an auditable REVERSAL_ADJUSTMENT row,
 *   restores raw material inventory if reversing a purchase, and recalculates balance from the ledger.
 */
export function reverseManagerCashTransaction(params: {
  transaction_id: string;
  reason: string;
  actor: UserProfile;
}): ManagerCashTransaction {
  if (params.actor.role !== 'OWNER') {
    throw new Error(
      'Forbidden: Only the Owner (Sikandar Raja) can authorize a manager cash transaction reversal.'
    );
  }
  const reasonTrimmed = (params.reason || '').trim();
  if (!reasonTrimmed) {
    throw new Error('A clear reason is required to reverse a manager cash transaction.');
  }

  return withErpTransaction((db) => {
    const original = db.manager_cash_transactions.find(
      (t) => t.id === params.transaction_id
    );
    if (!original) {
      throw new Error('Manager cash transaction not found.');
    }
    if (original.is_reversed || original.transaction_type === 'REVERSAL_ADJUSTMENT') {
      throw new Error('This transaction has already been reversed.');
    }

    const accountBefore = recalculateManagerCashAccountFromLedger(db, original.manager_id);
    const previousBalance = accountBefore.available_balance;

    // If reversing a CASH_ISSUED_BY_OWNER entry, verify manager still has enough unspent balance
    if (original.transaction_type === 'CASH_ISSUED_BY_OWNER' && previousBalance < original.amount) {
      throw new Error(
        `Cannot reverse cash issuance of Rs. ${original.amount.toLocaleString()}: Manager only has Rs. ${previousBalance.toLocaleString()} unspent balance remaining.`
      );
    }

    // If reversing a MATERIAL_PURCHASE entry, reverse the raw material stock addition as well
    if (original.transaction_type === 'MATERIAL_PURCHASE' && original.related_purchase_id) {
      const pur = db.purchases.find((p) => p.id === original.related_purchase_id);
      const item = pur?.items?.[0];
      if (item) {
        const rm = db.raw_materials.find((m) => m.id === item.raw_material_id);
        if (rm) {
          if (rm.current_stock < item.quantity) {
            throw new Error(
              `Cannot reverse purchase ${original.reference_number}: ${rm.name} stock (${rm.current_stock} ${rm.unit}) has already been consumed below ${item.quantity} ${rm.unit}.`
            );
          }
          const openingBefore = rm.current_stock;
          rm.stock_received = Math.max(0, Number(((rm.stock_received || 0) - item.quantity).toFixed(4)));
          recalculateRawMaterialStock(rm);
          db.stock_ledger.unshift({
            id: `sled-rev-${Date.now()}`,
            material_id: rm.id,
            material_name: rm.name,
            unit: String(rm.unit),
            opening_quantity: openingBefore,
            stock_received: 0,
            quantity_consumed: 0,
            adjustment_quantity: -item.quantity,
            closing_quantity: rm.current_stock,
            transaction_type: 'STOCK_ADJUSTMENT',
            reference_number: `REV-${original.reference_number}`,
            notes: `Reversal of purchase ${original.reference_number}: ${reasonTrimmed}`,
            entered_by_id: params.actor.id,
            entered_by_name: params.actor.full_name,
            approved_by_id: params.actor.id,
            approved_by_name: params.actor.full_name,
            date: new Date().toISOString().split('T')[0],
            created_at: new Date().toISOString(),
          });
        }
      }
    }

    original.is_reversed = true;
    const accountAfter = recalculateManagerCashAccountFromLedger(db, original.manager_id);
    const nowIso = new Date().toISOString();

    const revTx: ManagerCashTransaction = {
      id: `mctx-rev-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      manager_id: original.manager_id,
      manager_name: original.manager_name,
      transaction_type: 'REVERSAL_ADJUSTMENT',
      amount: original.amount,
      previous_balance: previousBalance,
      updated_balance: accountAfter.available_balance,
      reference_number: `REV-${original.reference_number}`,
      description: `REVERSAL of ${original.reference_number} (${original.transaction_type}): ${reasonTrimmed}`,
      created_by_id: params.actor.id,
      created_by_name: params.actor.full_name,
      transaction_date: nowIso.split('T')[0],
      created_at: nowIso,
      is_reversed: false,
      reverses_transaction_id: original.id,
    };
    db.manager_cash_transactions.unshift(revTx);

    appendAuditLog(db, {
      actor_id: params.actor.id,
      actor_name: params.actor.full_name,
      actor_role: params.actor.role,
      action: 'MANAGER_CASH_TRANSACTION_REVERSED',
      entity_type: 'manager_cash_transactions',
      entity_id: revTx.id,
      summary: `Owner reversed ${original.manager_name} transaction ${original.reference_number} (Rs. ${original.amount.toLocaleString()}). Balance: Rs. ${previousBalance.toLocaleString()} -> Rs. ${accountAfter.available_balance.toLocaleString()}.`,
    });

    return revTx;
  });
}

/**
 * PHASE 3 HELPER: Strictly validates and normalizes the factory's 2 canonical juice products:
 * - Apple Juice
 * - Mango Juice
 * Rejects any other juice types, bottle sizes, or product variants.
 */
export function normalizeJuiceType(input: string): 'Apple Juice' | 'Mango Juice' {
  const clean = (input || '').trim().toLowerCase();
  if (clean === 'apple' || clean === 'apple juice') {
    return 'Apple Juice';
  }
  if (clean === 'mango' || clean === 'mango juice') {
    return 'Mango Juice';
  }
  throw new Error(
    `Invalid product "${input}". Fruity Fun Juice Factory manufactures only Apple Juice and Mango Juice (1 carton = 24 pieces).`
  );
}

/**
 * PHASE 3: Direct Manager Production Confirmation & Atomic Stock Update.
 * - Both Kamran Bhai and Imran Bhai (and Owner Sikandar Raja) can enter and confirm daily production.
 * - Supports ONLY Apple Juice and Mango Juice, with 1 carton = 24 pieces (total_pieces = cartons * 24).
 * - Requires actual material consumption from the Phase 2 27-material master list (never invents recipes).
 * - Validates sufficient raw material stock before mutating anything; if any material is insufficient,
 *   blocks submission and returns the exact shortage for every insufficient material:
 *     Insufficient <Material> Stock.
 *     Available: X <Unit>.
 *     Required: Y <Unit>.
 *     Shortage: Z <Unit>.
 * - Atomically deducts consumed raw materials, increases finished goods cartons & pieces, records
 *   stock movements, and makes the confirmed batch immediately visible to Sikandar Raja without
 *   requiring post-confirmation owner approval.
 * - Idempotent via idempotency_key so repeated clicks or retries never double-deduct or double-add.
 */
export function confirmProductionBatch(params: {
  production_date?: string;
  juice_type: string;
  cartons_produced: number;
  consumed_materials: Array<{
    raw_material_id: string;
    entered_quantity: number;
    entered_unit: string;
  }>;
  notes?: string;
  idempotency_key?: string;
  corrects_batch_id?: string | null;
  actor: UserProfile;
}): {
  batch: ProductionBatch;
  finished_goods: FinishedGoodsInventory;
  stock_movements: StockLedgerEntry[];
} {
  if (params.actor.role !== 'PRODUCTION_MANAGER' && params.actor.role !== 'OWNER') {
    throw new Error(
      'Forbidden: Only an authenticated Production Manager (Kamran Bhai or Imran Bhai) or Owner (Sikandar Raja) can confirm production.'
    );
  }

  const juiceType = normalizeJuiceType(params.juice_type);
  const cartons = Number(params.cartons_produced);
  if (!Number.isFinite(cartons) || cartons <= 0 || !Number.isInteger(cartons)) {
    throw new Error('Number of cartons produced must be a whole number greater than zero.');
  }

  const PIECES_PER_CARTON = 24;
  const totalPieces = cartons * PIECES_PER_CARTON;

  if (!params.consumed_materials || params.consumed_materials.length === 0) {
    throw new Error('Please enter actual material consumption for at least one raw material.');
  }

  const idempKey = (params.idempotency_key || '').trim();

  return withErpTransaction((db) => {
    // 1. Idempotency check: prevent duplicate raw material deduction or finished goods addition
    if (idempKey) {
      const existingBatch = db.production_batches.find((b) => b.idempotency_key === idempKey);
      if (existingBatch) {
        const existingFg =
          db.finished_goods.find(
            (f) =>
              f.product_id === existingBatch.product_id ||
              f.product_name.toLowerCase() === existingBatch.product_name.toLowerCase()
          ) || db.finished_goods[0];
        const existingMovements = db.stock_ledger.filter(
          (l) => l.reference_number === existingBatch.batch_number
        );
        return {
          batch: existingBatch,
          finished_goods: existingFg,
          stock_movements: existingMovements,
        };
      }
    }

    // 2. Validate each material entry & aggregate canonical requirement per material
    const aggregatedRequiredByMatId = new Map<
      string,
      {
        rm: RawMaterial;
        canonicalUnit: RawMaterialUnit;
        totalRequiredCanonical: number;
      }
    >();

    const normalizedLines: Array<{
      rm: RawMaterial;
      enteredQty: number;
      enteredUnit: RawMaterialUnit;
      canonicalUnit: RawMaterialUnit;
      normalizedQty: number;
    }> = [];

    for (const item of params.consumed_materials) {
      const enteredQty = Number(item.entered_quantity);
      if (!Number.isFinite(enteredQty) || enteredQty <= 0) {
        throw new Error('Material consumption quantity must be greater than zero for every selected material.');
      }

      const rm = db.raw_materials.find((m) => m.id === item.raw_material_id);
      if (!rm) {
        throw new Error(`Selected raw material (${item.raw_material_id}) not found in the 27-item inventory master.`);
      }

      const canonicalUnit = normalizeUnit(String(rm.unit));
      const enteredUnit = normalizeUnit(String(item.entered_unit || canonicalUnit));

      if (rm.allowed_units && rm.allowed_units.length > 0 && !rm.allowed_units.includes(enteredUnit)) {
        throw new Error(
          `Invalid unit "${enteredUnit}" for "${rm.name}". Allowed units: ${rm.allowed_units.join(', ')}.`
        );
      }

      const normalizedQty = convertQuantityToTargetUnit(
        enteredQty,
        enteredUnit,
        canonicalUnit,
        { boxToPieceFactor: rm.box_to_piece_factor }
      );

      normalizedLines.push({
        rm,
        enteredQty,
        enteredUnit,
        canonicalUnit,
        normalizedQty,
      });

      const prev = aggregatedRequiredByMatId.get(rm.id);
      if (prev) {
        prev.totalRequiredCanonical = Number((prev.totalRequiredCanonical + normalizedQty).toFixed(4));
      } else {
        aggregatedRequiredByMatId.set(rm.id, {
          rm,
          canonicalUnit,
          totalRequiredCanonical: normalizedQty,
        });
      }
    }

    // 3. Check sufficient raw material stock across all consumed materials before mutating anything
    const shortageMessages: string[] = [];
    for (const { rm, canonicalUnit, totalRequiredCanonical } of aggregatedRequiredByMatId.values()) {
      const available = Number((rm.current_stock ?? 0).toFixed(4));
      if (available < totalRequiredCanonical) {
        const shortage = Number((totalRequiredCanonical - available).toFixed(4));
        shortageMessages.push(
          `Insufficient ${rm.name} Stock.\nAvailable: ${available} ${canonicalUnit}.\nRequired: ${totalRequiredCanonical} ${canonicalUnit}.\nShortage: ${shortage} ${canonicalUnit}.`
        );
      }
    }

    if (shortageMessages.length > 0) {
      throw new Error(shortageMessages.join('\n\n'));
    }

    // 4. Resolve canonical Product & Finished Goods row for Apple Juice or Mango Juice
    const flavourCode = juiceType === 'Apple Juice' ? 'APL' : 'MNG';
    const flavourName = juiceType === 'Apple Juice' ? 'Apple' : 'Mango';
    const canonicalProdId = juiceType === 'Apple Juice' ? 'prod-apple-juice' : 'prod-mango-juice';

    let product = db.products.find(
      (p) => p.id === canonicalProdId || p.name.toLowerCase() === juiceType.toLowerCase()
    );
    if (!product) {
      product = {
        id: canonicalProdId,
        sku: `FF-${flavourCode}-24`,
        name: juiceType,
        flavour_id: juiceType === 'Apple Juice' ? 'flv-apple' : 'flv-mango',
        flavour_name: flavourName,
        bottle_size_id: 'size-std',
        bottle_size_label: '24 Pieces / Carton',
        packaging_type_id: 'pkg-ctn24',
        packaging_type_name: 'Standard 24-Piece Carton',
        units_per_carton: PIECES_PER_CARTON,
        wholesale_price_per_carton: 1200,
        retail_price_per_unit: 60,
        standard_cost_per_carton: 850,
        min_stock_cartons: 0,
        is_active: true,
        created_at: new Date().toISOString(),
      };
      db.products.push(product);
    }

    const nowIso = new Date().toISOString();
    const prodDate = (params.production_date || '').trim() || nowIso.split('T')[0];
    const dateCode = prodDate.replace(/-/g, '').slice(2);
    const seq = String(db.production_batches.length + 1).padStart(3, '0');
    const batchNumber = `PROD-${flavourCode}-${dateCode}-${seq}`;
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // 5. Deduct consumed raw materials & record permanent stock_ledger + inventory_movements
    const usageList: BatchMaterialUsage[] = [];
    const createdLedgerEntries: StockLedgerEntry[] = [];
    let batchTotalCost = 0;

    for (const line of normalizedLines) {
      const { rm, enteredQty, enteredUnit, canonicalUnit, normalizedQty } = line;
      const previousStock = Number((rm.current_stock ?? 0).toFixed(4));
      rm.stock_consumed = Number(((rm.stock_consumed ?? 0) + normalizedQty).toFixed(4));
      recalculateRawMaterialStock(rm);
      const updatedStock = rm.current_stock;

      const lineCost = Number((normalizedQty * (rm.average_cost_per_unit || 0)).toFixed(2));
      batchTotalCost = Number((batchTotalCost + lineCost).toFixed(2));

      usageList.push({
        raw_material_id: rm.id,
        raw_material_name: rm.name,
        unit: canonicalUnit,
        quantity_entered: enteredQty,
        unit_entered: enteredUnit,
        entered_quantity: enteredQty,
        entered_unit: enteredUnit,
        wastage_quantity: 0,
        opening_stock_snapshot: previousStock,
        remaining_stock_snapshot: updatedStock,
        estimated_quantity: normalizedQty,
        actual_quantity: normalizedQty,
        unit_cost_snapshot: rm.average_cost_per_unit || 0,
        total_cost: lineCost,
      });

      const ledgerEntry: StockLedgerEntry = {
        id: `sled-prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        raw_material_id: rm.id,
        material_id: rm.id,
        material_name: rm.name,
        unit: canonicalUnit,
        opening_quantity: previousStock,
        stock_received: 0,
        quantity_consumed: normalizedQty,
        adjustment_quantity: 0,
        closing_quantity: updatedStock,
        previous_stock: previousStock,
        quantity_added: 0,
        quantity_deducted: normalizedQty,
        updated_stock: updatedStock,
        transaction_type: 'PRODUCTION_CONSUMPTION',
        reference_number: batchNumber,
        related_production_id: batchId,
        notes: `Consumed ${enteredQty} ${enteredUnit} (${normalizedQty} ${canonicalUnit}) for ${cartons} cartons (${totalPieces.toLocaleString()} pieces) of ${juiceType}`,
        entered_by: params.actor.full_name,
        entered_by_id: params.actor.id,
        entered_by_name: params.actor.full_name,
        approved_by: params.actor.full_name,
        approved_by_id: params.actor.id,
        approved_by_name: params.actor.full_name,
        date: prodDate,
        created_at: nowIso,
      };
      db.stock_ledger.unshift(ledgerEntry);
      createdLedgerEntries.push(ledgerEntry);

      db.inventory_movements.unshift({
        id: `mov-rm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        item_type: 'RAW_MATERIAL',
        item_id: rm.id,
        item_name: rm.name,
        batch_number: batchNumber,
        movement_type: 'RAW_MATERIAL_CONSUMED',
        quantity_change: -normalizedQty,
        balance_after: updatedStock,
        reference_type: 'BATCH',
        reference_id: batchNumber,
        notes: `${juiceType} (${cartons} cartons = ${totalPieces} pieces): Consumed ${enteredQty} ${enteredUnit}`,
        performed_by: params.actor.full_name,
        created_at: nowIso,
      });

      if (rm.minimum_stock_level > 0 && rm.current_stock <= rm.minimum_stock_level) {
        db.notifications.unshift({
          id: `notif-low-${Date.now()}-${rm.id}`,
          type: 'LOW_RAW_MATERIAL',
          title: `Low Raw Material Stock: ${rm.name}`,
          message: `${rm.name} dropped to ${rm.current_stock} ${canonicalUnit} (Minimum: ${rm.minimum_stock_level} ${canonicalUnit}) after production ${batchNumber}.`,
          severity: 'warning',
          target_roles: ['OWNER', 'PRODUCTION_MANAGER'],
          is_read: false,
          link_href: '/raw-materials',
          created_at: nowIso,
        });
      }
    }

    // 6. Increase Finished Goods Inventory for Apple Juice or Mango Juice
    let fg = db.finished_goods.find(
      (f) => f.product_id === product!.id || f.product_name.toLowerCase() === juiceType.toLowerCase()
    );
    if (!fg) {
      fg = {
        id: `fg-${product.id}`,
        product_id: product.id,
        product_name: juiceType,
        sku: product.sku,
        flavour_name: flavourName,
        bottle_size_label: '24 Pieces / Carton',
        packaging_type_name: 'Standard 24-Piece Carton',
        units_per_carton: PIECES_PER_CARTON,
        opening_stock_set: false,
        opening_stock_date: null,
        opening_stock_bottles: 0,
        verified_production_bottles: 0,
        dispatched_bottles: 0,
        damaged_bottles: 0,
        closing_stock_bottles: 0,
        available_bottles: 0,
        opening_stock_cartons: 0,
        verified_production_cartons: 0,
        approved_returns_cartons: 0,
        dispatched_cartons: 0,
        damaged_cartons: 0,
        reserved_cartons: 0,
        available_cartons: 0,
        closing_stock_cartons: 0,
        latest_batch_number: batchNumber,
        latest_production_date: prodDate,
        valuation_per_carton: cartons > 0 ? Number((batchTotalCost / cartons).toFixed(2)) : 0,
        updated_at: nowIso,
      };
      db.finished_goods.push(fg);
    }

    fg.product_name = juiceType;
    fg.units_per_carton = PIECES_PER_CARTON;
    fg.verified_production_cartons = Number(((fg.verified_production_cartons ?? 0) + cartons).toFixed(2));
    fg.verified_production_bottles = Math.round(fg.verified_production_cartons * PIECES_PER_CARTON);
    fg.latest_batch_number = batchNumber;
    fg.latest_production_date = prodDate;
    recalculateFinishedGoodsRow(fg);

    db.inventory_movements.unshift({
      id: `mov-fg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      item_type: 'FINISHED_GOOD',
      item_id: product.id,
      item_name: juiceType,
      batch_number: batchNumber,
      movement_type: 'PRODUCTION_VERIFIED',
      quantity_change: cartons,
      balance_after: fg.closing_stock_cartons,
      reference_type: 'BATCH',
      reference_id: batchNumber,
      notes: `Confirmed ${juiceType} Production: +${cartons} Cartons (+${totalPieces.toLocaleString()} Pieces) by ${params.actor.full_name}`,
      performed_by: params.actor.full_name,
      created_at: nowIso,
    });

    // 7. Save Confirmed Production Batch Record
    const machine = db.machines[0] || { id: 'mach-1', name: 'Main Filling Line' };
    const newBatch: ProductionBatch = {
      id: batchId,
      batch_number: batchNumber,
      production_date: prodDate,
      product_id: product.id,
      product_name: juiceType,
      juice_type: juiceType,
      flavour_name: flavourName,
      bottle_size_label: '24 Pieces / Carton',
      packaging_type_name: 'Standard 24-Piece Carton',
      units_per_carton: PIECES_PER_CARTON,
      pieces_per_carton: PIECES_PER_CARTON,
      total_pieces: totalPieces,
      target_bottles: totalPieces,
      produced_bottles: totalPieces,
      actual_bottles: totalPieces,
      wastage_bottles: 0,
      target_cartons: cartons,
      actual_cartons: cartons,
      wastage_cartons: 0,
      damaged_units: 0,
      machine_id: machine.id,
      machine_name: machine.name,
      status: 'CONFIRMED',
      inventory_posted: true,
      idempotency_key: idempKey || undefined,
      is_reversed: false,
      corrects_batch_id: params.corrects_batch_id || null,
      corrected_by_batch_id: null,
      submitted_by: params.actor.id,
      submitted_by_id: params.actor.id,
      submitted_by_name: params.actor.full_name,
      submitted_at: nowIso,
      verified_by: params.actor.id,
      verified_by_name: params.actor.full_name,
      verified_at: nowIso,
      material_usage: usageList,
      total_production_cost: Math.round(batchTotalCost),
      cost_per_carton: cartons > 0 ? Number((batchTotalCost / cartons).toFixed(2)) : 0,
      remarks: (params.notes || '').trim(),
      created_by: params.actor.id,
      created_by_name: params.actor.full_name,
      created_at: nowIso,
      updated_at: nowIso,
    };
    db.production_batches.unshift(newBatch);

    appendAuditLog(db, {
      actor_id: params.actor.id,
      actor_name: params.actor.full_name,
      actor_role: params.actor.role,
      action: 'PRODUCTION_BATCH_CONFIRMED',
      entity_type: 'production_batches',
      entity_id: newBatch.id,
      summary: `${params.actor.full_name} confirmed ${batchNumber}: ${cartons} cartons (${totalPieces.toLocaleString()} pieces) of ${juiceType}. Raw materials deducted and finished goods updated.`,
    });

    return {
      batch: newBatch,
      finished_goods: fg,
      stock_movements: createdLedgerEntries,
    };
  });
}

/**
 * PHASE 3: Authorized Reversal & Correction of a Confirmed Production Batch.
 * - Confirmed production records are never silently edited or deleted.
 * - Preserves the original record (marks is_reversed = true, status = 'REVERSED').
 * - Records who made the correction and the mandatory correction reason.
 * - Prevents a manager from changing another manager's production records
 *   (Kamran Bhai can only reverse/correct Kamran Bhai's records; Imran Bhai can only
 *    reverse/correct Imran Bhai's records; Owner Sikandar Raja can reverse/correct any).
 * - Reverses the original finished goods addition and restores original raw material
 *   quantities via auditable STOCK_CORRECTION movements.
 * - Ensures reversal cannot cause negative finished goods stock or duplicate stock movements.
 * - If corrected replacement production quantities/materials are provided, atomically
 *   validates and creates a new replacement CONFIRMED batch in the same transaction.
 */
export function reverseOrCorrectProductionBatch(params: {
  batch_id: string;
  reason: string;
  corrected_production?: {
    production_date?: string;
    juice_type?: string;
    cartons_produced: number;
    consumed_materials: Array<{
      raw_material_id: string;
      entered_quantity: number;
      entered_unit: string;
    }>;
    notes?: string;
  };
  actor: UserProfile;
}): {
  reversed_batch: ProductionBatch;
  replacement_batch?: ProductionBatch;
} {
  if (params.actor.role !== 'OWNER' && params.actor.role !== 'PRODUCTION_MANAGER') {
    throw new Error('Forbidden: Only the Owner or an authorized Production Manager can reverse or correct production.');
  }

  const reasonTrimmed = (params.reason || '').trim();
  if (!reasonTrimmed) {
    throw new Error('A clear correction or reversal reason is required.');
  }

  // First inspect and validate permissions & stock inside a single atomic transaction
  return withErpTransaction((db) => {
    const original = db.production_batches.find((b) => b.id === params.batch_id);
    if (!original) {
      throw new Error(`Production batch "${params.batch_id}" not found.`);
    }

    // Prevent unauthorized manager from changing another manager's production record
    const batchOwnerId = original.submitted_by_id || original.submitted_by || original.created_by;
    if (params.actor.role === 'PRODUCTION_MANAGER' && batchOwnerId !== params.actor.id) {
      throw new Error(
        `Forbidden: ${params.actor.full_name} cannot modify or reverse a production record entered by ${
          original.submitted_by_name || original.created_by_name || 'another manager'
        }.`
      );
    }

    if (original.is_reversed || original.status === 'REVERSED') {
      throw new Error(
        `Duplicate reversal prevented: Production batch ${original.batch_number} has already been reversed.`
      );
    }

    if (!original.inventory_posted) {
      throw new Error(`Batch ${original.batch_number} has not posted inventory movements.`);
    }

    const PIECES_PER_CARTON = 24;
    const originalCartons = original.actual_cartons;
    const originalPieces = original.total_pieces ?? original.actual_bottles ?? Math.round(originalCartons * PIECES_PER_CARTON);

    const fg = db.finished_goods.find(
      (f) =>
        f.product_id === original.product_id ||
        f.product_name.toLowerCase() === original.product_name.toLowerCase()
    );
    if (!fg || fg.available_cartons < originalCartons) {
      throw new Error(
        `Cannot reverse batch ${original.batch_number}: Reversing ${originalCartons} cartons of ${original.product_name} would result in negative finished goods stock (Currently available: ${
          fg?.available_cartons ?? 0
        } cartons).`
      );
    }

    // If a replacement (correction) batch is requested, pre-validate its parameters and
    // verify that (current_stock + restored_from_original) >= required_for_replacement for every material
    let replacementJuiceType: 'Apple Juice' | 'Mango Juice' | null = null;
    let replacementCartons = 0;
    let replacementPieces = 0;
    const replacementLines: Array<{
      rm: RawMaterial;
      enteredQty: number;
      enteredUnit: RawMaterialUnit;
      canonicalUnit: RawMaterialUnit;
      normalizedQty: number;
    }> = [];

    if (params.corrected_production) {
      replacementJuiceType = normalizeJuiceType(
        params.corrected_production.juice_type || original.juice_type || original.product_name
      );
      replacementCartons = Number(params.corrected_production.cartons_produced);
      if (!Number.isFinite(replacementCartons) || replacementCartons <= 0 || !Number.isInteger(replacementCartons)) {
        throw new Error('Corrected cartons produced must be a whole number greater than zero.');
      }
      replacementPieces = replacementCartons * PIECES_PER_CARTON;

      if (
        !params.corrected_production.consumed_materials ||
        params.corrected_production.consumed_materials.length === 0
      ) {
        throw new Error('Corrected production must include at least one material consumption entry.');
      }

      // Calculate how much each material will have available after restoring original batch consumption
      const restoredStockMap = new Map<string, number>();
      for (const m of db.raw_materials) {
        restoredStockMap.set(m.id, Number((m.current_stock ?? 0).toFixed(4)));
      }
      for (const u of original.material_usage) {
        const prev = restoredStockMap.get(u.raw_material_id) ?? 0;
        restoredStockMap.set(u.raw_material_id, Number((prev + u.actual_quantity).toFixed(4)));
      }

      const requiredReplacementMap = new Map<
        string,
        { rm: RawMaterial; canonicalUnit: RawMaterialUnit; required: number }
      >();

      for (const item of params.corrected_production.consumed_materials) {
        const enteredQty = Number(item.entered_quantity);
        if (!Number.isFinite(enteredQty) || enteredQty <= 0) {
          throw new Error('Corrected material quantity must be greater than zero.');
        }
        const rm = db.raw_materials.find((m) => m.id === item.raw_material_id);
        if (!rm) {
          throw new Error(`Raw material (${item.raw_material_id}) not found in inventory master.`);
        }
        const canonicalUnit = normalizeUnit(String(rm.unit));
        const enteredUnit = normalizeUnit(String(item.entered_unit || canonicalUnit));
        const normalizedQty = convertQuantityToTargetUnit(
          enteredQty,
          enteredUnit,
          canonicalUnit,
          { boxToPieceFactor: rm.box_to_piece_factor }
        );

        replacementLines.push({
          rm,
          enteredQty,
          enteredUnit,
          canonicalUnit,
          normalizedQty,
        });

        const existingReq = requiredReplacementMap.get(rm.id);
        if (existingReq) {
          existingReq.required = Number((existingReq.required + normalizedQty).toFixed(4));
        } else {
          requiredReplacementMap.set(rm.id, { rm, canonicalUnit, required: normalizedQty });
        }
      }

      const shortageMessages: string[] = [];
      for (const { rm, canonicalUnit, required } of requiredReplacementMap.values()) {
        const availAfterRestore = restoredStockMap.get(rm.id) ?? 0;
        if (availAfterRestore < required) {
          const shortage = Number((required - availAfterRestore).toFixed(4));
          shortageMessages.push(
            `Insufficient ${rm.name} Stock.\nAvailable: ${availAfterRestore} ${canonicalUnit}.\nRequired: ${required} ${canonicalUnit}.\nShortage: ${shortage} ${canonicalUnit}.`
          );
        }
      }
      if (shortageMessages.length > 0) {
        throw new Error(shortageMessages.join('\n\n'));
      }
    }

    const nowIso = new Date().toISOString();
    const revDate = nowIso.split('T')[0];
    const revRef = `REV-${original.batch_number}`;

    // Step A: Restore raw materials consumed by original batch & log STOCK_CORRECTION
    for (const usage of original.material_usage) {
      const rm = db.raw_materials.find((m) => m.id === usage.raw_material_id);
      if (!rm) continue;

      const canonicalUnit = normalizeUnit(String(rm.unit));
      const previousStock = Number((rm.current_stock ?? 0).toFixed(4));
      rm.stock_consumed = Math.max(
        0,
        Number(((rm.stock_consumed ?? 0) - usage.actual_quantity).toFixed(4))
      );
      recalculateRawMaterialStock(rm);
      const updatedStock = rm.current_stock;

      const revLedgerEntry: StockLedgerEntry = {
        id: `sled-rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        raw_material_id: rm.id,
        material_id: rm.id,
        material_name: rm.name,
        unit: canonicalUnit,
        opening_quantity: previousStock,
        stock_received: 0,
        quantity_consumed: 0,
        adjustment_quantity: usage.actual_quantity,
        closing_quantity: updatedStock,
        previous_stock: previousStock,
        quantity_added: usage.actual_quantity,
        quantity_deducted: 0,
        updated_stock: updatedStock,
        transaction_type: 'STOCK_CORRECTION',
        reference_number: revRef,
        related_production_id: original.id,
        notes: `Reversal of ${original.batch_number} (${original.product_name}): Restored +${usage.actual_quantity} ${canonicalUnit}. Reason: ${reasonTrimmed}`,
        entered_by: params.actor.full_name,
        entered_by_id: params.actor.id,
        entered_by_name: params.actor.full_name,
        approved_by: params.actor.full_name,
        approved_by_id: params.actor.id,
        approved_by_name: params.actor.full_name,
        date: revDate,
        created_at: nowIso,
      };
      db.stock_ledger.unshift(revLedgerEntry);

      db.inventory_movements.unshift({
        id: `mov-rmrev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        item_type: 'RAW_MATERIAL',
        item_id: rm.id,
        item_name: rm.name,
        batch_number: original.batch_number,
        movement_type: 'RAW_MATERIAL_ADJUSTMENT',
        quantity_change: usage.actual_quantity,
        balance_after: updatedStock,
        reference_type: 'ADJUSTMENT',
        reference_id: revRef,
        notes: `Production Reversal (${original.batch_number}): Restored +${usage.actual_quantity} ${canonicalUnit} (${reasonTrimmed})`,
        performed_by: params.actor.full_name,
        created_at: nowIso,
      });
    }

    // Step B: Deduct reversed cartons & pieces from Finished Goods
    fg.verified_production_cartons = Math.max(
      0,
      Number(((fg.verified_production_cartons ?? 0) - originalCartons).toFixed(2))
    );
    fg.verified_production_bottles = Math.round(fg.verified_production_cartons * PIECES_PER_CARTON);
    recalculateFinishedGoodsRow(fg);

    db.inventory_movements.unshift({
      id: `mov-fgrev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      item_type: 'FINISHED_GOOD',
      item_id: fg.product_id,
      item_name: fg.product_name,
      batch_number: original.batch_number,
      movement_type: 'PRODUCTION_REVERSED',
      quantity_change: -originalCartons,
      balance_after: fg.closing_stock_cartons,
      reference_type: 'ADJUSTMENT',
      reference_id: revRef,
      notes: `Reversed Production ${original.batch_number}: -${originalCartons} Cartons (-${originalPieces.toLocaleString()} Pieces). Reason: ${reasonTrimmed}`,
      performed_by: params.actor.full_name,
      created_at: nowIso,
    });

    // Step C: Mark original batch as REVERSED (preserving original record)
    original.is_reversed = true;
    original.status = 'REVERSED';
    original.reversed_at = nowIso;
    original.reversed_by_id = params.actor.id;
    original.reversed_by_name = params.actor.full_name;
    original.reversal_reason = reasonTrimmed;
    original.updated_at = nowIso;

    // Step D: If corrected replacement values were supplied, apply new confirmed batch atomically
    let replacementBatch: ProductionBatch | undefined;
    if (params.corrected_production && replacementJuiceType) {
      const repFlavourCode = replacementJuiceType === 'Apple Juice' ? 'APL' : 'MNG';
      const repFlavourName = replacementJuiceType === 'Apple Juice' ? 'Apple' : 'Mango';
      const repProdId =
        replacementJuiceType === 'Apple Juice' ? 'prod-apple-juice' : 'prod-mango-juice';
      const repProduct =
        db.products.find(
          (p) =>
            p.id === repProdId || p.name.toLowerCase() === replacementJuiceType!.toLowerCase()
        ) || db.products[0];

      const repDate =
        (params.corrected_production.production_date || '').trim() || original.production_date;
      const dateCode = repDate.replace(/-/g, '').slice(2);
      const seq = String(db.production_batches.length + 1).padStart(3, '0');
      const repBatchNumber = `PROD-${repFlavourCode}-${dateCode}-${seq}-CORR`;
      const repBatchId = `batch-corr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      const repUsageList: BatchMaterialUsage[] = [];
      let repTotalCost = 0;

      for (const line of replacementLines) {
        const { rm, enteredQty, enteredUnit, canonicalUnit, normalizedQty } = line;
        const prevStock = Number((rm.current_stock ?? 0).toFixed(4));
        rm.stock_consumed = Number(((rm.stock_consumed ?? 0) + normalizedQty).toFixed(4));
        recalculateRawMaterialStock(rm);
        const updStock = rm.current_stock;

        const lineCost = Number((normalizedQty * (rm.average_cost_per_unit || 0)).toFixed(2));
        repTotalCost = Number((repTotalCost + lineCost).toFixed(2));

        repUsageList.push({
          raw_material_id: rm.id,
          raw_material_name: rm.name,
          unit: canonicalUnit,
          quantity_entered: enteredQty,
          unit_entered: enteredUnit,
          entered_quantity: enteredQty,
          entered_unit: enteredUnit,
          wastage_quantity: 0,
          opening_stock_snapshot: prevStock,
          remaining_stock_snapshot: updStock,
          estimated_quantity: normalizedQty,
          actual_quantity: normalizedQty,
          unit_cost_snapshot: rm.average_cost_per_unit || 0,
          total_cost: lineCost,
        });

        db.stock_ledger.unshift({
          id: `sled-corr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          raw_material_id: rm.id,
          material_id: rm.id,
          material_name: rm.name,
          unit: canonicalUnit,
          opening_quantity: prevStock,
          stock_received: 0,
          quantity_consumed: normalizedQty,
          adjustment_quantity: 0,
          closing_quantity: updStock,
          previous_stock: prevStock,
          quantity_added: 0,
          quantity_deducted: normalizedQty,
          updated_stock: updStock,
          transaction_type: 'PRODUCTION_CONSUMPTION',
          reference_number: repBatchNumber,
          related_production_id: repBatchId,
          notes: `Corrected production (replaces ${original.batch_number}): Consumed ${enteredQty} ${enteredUnit} (${normalizedQty} ${canonicalUnit}) for ${replacementCartons} cartons of ${replacementJuiceType}`,
          entered_by: params.actor.full_name,
          entered_by_id: params.actor.id,
          entered_by_name: params.actor.full_name,
          approved_by: params.actor.full_name,
          approved_by_id: params.actor.id,
          approved_by_name: params.actor.full_name,
          date: repDate,
          created_at: nowIso,
        });
      }

      const targetFg =
        db.finished_goods.find(
          (f) =>
            f.product_id === repProduct.id ||
            f.product_name.toLowerCase() === replacementJuiceType!.toLowerCase()
        ) || fg;
      targetFg.verified_production_cartons = Number(
        ((targetFg.verified_production_cartons ?? 0) + replacementCartons).toFixed(2)
      );
      targetFg.verified_production_bottles = Math.round(
        targetFg.verified_production_cartons * PIECES_PER_CARTON
      );
      targetFg.latest_batch_number = repBatchNumber;
      targetFg.latest_production_date = repDate;
      recalculateFinishedGoodsRow(targetFg);

      db.inventory_movements.unshift({
        id: `mov-fgcorr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        item_type: 'FINISHED_GOOD',
        item_id: targetFg.product_id,
        item_name: replacementJuiceType,
        batch_number: repBatchNumber,
        movement_type: 'PRODUCTION_VERIFIED',
        quantity_change: replacementCartons,
        balance_after: targetFg.closing_stock_cartons,
        reference_type: 'BATCH',
        reference_id: repBatchNumber,
        notes: `Corrected Production (replaces ${original.batch_number}): +${replacementCartons} Cartons (+${replacementPieces.toLocaleString()} Pieces)`,
        performed_by: params.actor.full_name,
        created_at: nowIso,
      });

      const originalManagerId = original.submitted_by_id || original.submitted_by || original.created_by;
      const originalManagerName = original.submitted_by_name || original.created_by_name || params.actor.full_name;

      replacementBatch = {
        id: repBatchId,
        batch_number: repBatchNumber,
        production_date: repDate,
        product_id: repProduct.id,
        product_name: replacementJuiceType,
        juice_type: replacementJuiceType,
        flavour_name: repFlavourName,
        bottle_size_label: '24 Pieces / Carton',
        packaging_type_name: 'Standard 24-Piece Carton',
        units_per_carton: PIECES_PER_CARTON,
        pieces_per_carton: PIECES_PER_CARTON,
        total_pieces: replacementPieces,
        target_bottles: replacementPieces,
        produced_bottles: replacementPieces,
        actual_bottles: replacementPieces,
        wastage_bottles: 0,
        target_cartons: replacementCartons,
        actual_cartons: replacementCartons,
        wastage_cartons: 0,
        damaged_units: 0,
        machine_id: original.machine_id,
        machine_name: original.machine_name,
        status: 'CONFIRMED',
        inventory_posted: true,
        is_reversed: false,
        corrects_batch_id: original.id,
        corrected_by_batch_id: null,
        submitted_by: originalManagerId,
        submitted_by_id: originalManagerId,
        submitted_by_name: originalManagerName,
        submitted_at: nowIso,
        verified_by: params.actor.id,
        verified_by_name: params.actor.full_name,
        verified_at: nowIso,
        material_usage: repUsageList,
        total_production_cost: Math.round(repTotalCost),
        cost_per_carton:
          replacementCartons > 0 ? Number((repTotalCost / replacementCartons).toFixed(2)) : 0,
        remarks:
          (params.corrected_production.notes || '').trim() ||
          `Correction of ${original.batch_number}: ${reasonTrimmed}`,
        created_by: originalManagerId,
        created_by_name: originalManagerName,
        created_at: nowIso,
        updated_at: nowIso,
      };

      original.corrected_by_batch_id = replacementBatch.id;
      db.production_batches.unshift(replacementBatch);
    }

    appendAuditLog(db, {
      actor_id: params.actor.id,
      actor_name: params.actor.full_name,
      actor_role: params.actor.role,
      action: replacementBatch ? 'PRODUCTION_BATCH_CORRECTED' : 'PRODUCTION_BATCH_REVERSED',
      entity_type: 'production_batches',
      entity_id: original.id,
      summary: replacementBatch
        ? `${params.actor.full_name} reversed ${original.batch_number} and created corrected replacement batch ${replacementBatch.batch_number} (${replacementBatch.actual_cartons} cartons = ${replacementBatch.total_pieces} pieces ${replacementBatch.product_name}). Reason: ${reasonTrimmed}`
        : `${params.actor.full_name} reversed production batch ${original.batch_number} (${originalCartons} cartons = ${originalPieces} pieces ${original.product_name}). Reason: ${reasonTrimmed}`,
    });

    return {
      reversed_batch: original,
      replacement_batch: replacementBatch,
    };
  });
}

/**
 * PHASE 3: Authorized Owner-only Opening Finished Goods Stock Entry.
 * - Allows Sikandar Raja to set initial opening finished goods stock (in cartons; 1 carton = 24 pieces)
 *   for Apple Juice or Mango Juice without inserting fake quantities.
 * - Locks opening_stock_set = true to prevent silent overwrites.
 */
export function setFinishedGoodsOpeningStock(params: {
  juice_type: string;
  opening_cartons: number;
  opening_date?: string;
  notes?: string;
  actor: UserProfile;
}): FinishedGoodsInventory {
  if (params.actor.role !== 'OWNER') {
    throw new Error(
      'Forbidden: Only the Owner (Sikandar Raja) can enter opening finished goods stock.'
    );
  }

  const juiceType = normalizeJuiceType(params.juice_type);
  const cartons = Number(params.opening_cartons);
  if (!Number.isFinite(cartons) || cartons <= 0 || !Number.isInteger(cartons)) {
    throw new Error('Opening finished goods cartons must be a whole number greater than zero.');
  }

  const PIECES_PER_CARTON = 24;
  const totalPieces = cartons * PIECES_PER_CARTON;

  return withErpTransaction((db) => {
    const canonicalProdId = juiceType === 'Apple Juice' ? 'prod-apple-juice' : 'prod-mango-juice';
    let fg = db.finished_goods.find(
      (f) => f.product_id === canonicalProdId || f.product_name.toLowerCase() === juiceType.toLowerCase()
    );

    const nowIso = new Date().toISOString();
    const openDate = (params.opening_date || '').trim() || nowIso.split('T')[0];

    if (!fg) {
      fg = {
        id: `fg-${canonicalProdId}`,
        product_id: canonicalProdId,
        product_name: juiceType,
        sku: juiceType === 'Apple Juice' ? 'FF-APL-24' : 'FF-MNG-24',
        flavour_name: juiceType === 'Apple Juice' ? 'Apple' : 'Mango',
        bottle_size_label: '24 Pieces / Carton',
        packaging_type_name: 'Standard 24-Piece Carton',
        units_per_carton: PIECES_PER_CARTON,
        opening_stock_set: false,
        opening_stock_date: null,
        opening_stock_bottles: 0,
        verified_production_bottles: 0,
        dispatched_bottles: 0,
        damaged_bottles: 0,
        closing_stock_bottles: 0,
        available_bottles: 0,
        opening_stock_cartons: 0,
        verified_production_cartons: 0,
        approved_returns_cartons: 0,
        dispatched_cartons: 0,
        damaged_cartons: 0,
        reserved_cartons: 0,
        available_cartons: 0,
        closing_stock_cartons: 0,
        latest_batch_number: 'OPENING',
        latest_production_date: openDate,
        valuation_per_carton: 850,
        updated_at: nowIso,
      };
      db.finished_goods.push(fg);
    }

    if (fg.opening_stock_set) {
      throw new Error(
        `Duplicate opening stock prevented: Opening finished goods stock has already been recorded for "${juiceType}".`
      );
    }

    fg.opening_stock_cartons = cartons;
    fg.opening_stock_bottles = totalPieces;
    fg.opening_stock_set = true;
    fg.opening_stock_date = openDate;
    fg.units_per_carton = PIECES_PER_CARTON;
    recalculateFinishedGoodsRow(fg);

    db.inventory_movements.unshift({
      id: `mov-fgopen-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      item_type: 'FINISHED_GOOD',
      item_id: fg.product_id,
      item_name: juiceType,
      movement_type: 'OPENING_STOCK',
      quantity_change: cartons,
      balance_after: fg.closing_stock_cartons,
      reference_type: 'ADJUSTMENT',
      reference_id: `FG-OPEN-${fg.sku}`,
      notes:
        (params.notes || '').trim() ||
        `Opening finished goods stock entered by Owner: +${cartons} Cartons (+${totalPieces.toLocaleString()} Pieces)`,
      performed_by: params.actor.full_name,
      created_at: nowIso,
    });

    appendAuditLog(db, {
      actor_id: params.actor.id,
      actor_name: params.actor.full_name,
      actor_role: params.actor.role,
      action: 'FINISHED_GOODS_OPENING_STOCK_SET',
      entity_type: 'finished_goods',
      entity_id: fg.id,
      summary: `Set opening finished goods stock for ${juiceType}: +${cartons} cartons (${totalPieces.toLocaleString()} pieces).`,
    });

    return fg;
  });
}

// ============================================================================
// PHASE 4: BOOKER MANAGEMENT, CARTON ALLOCATIONS, PARTIAL PAYMENTS & LEDGERS
// ============================================================================

/**
 * PHASE 4: Ledger-derived Booker Account recalculation.
 * Always derives:
 * - apple_cartons_received
 * - mango_cartons_received
 * - total_cartons_received
 * - total_pieces_received (total_cartons_received * 24)
 * - total_amount_payable
 * - total_payments_received
 * - remaining_outstanding_amount (total_amount_payable - total_payments_received)
 * directly from non-reversed booker_transactions for this booker.
 */
export function recalculateBookerAccountFromLedger(
  db: ErpDatabaseState,
  bookerId: string
): BookerAccount {
  const booker = db.bookers.find((b) => b.id === bookerId);
  if (!booker) {
    throw new Error(`Booker account (${bookerId}) not found.`);
  }

  let appleCartons = 0;
  let mangoCartons = 0;
  let totalPayable = 0;
  let totalPayments = 0;

  // Sort chronological (oldest -> newest) to also maintain accurate running balances on active transactions
  const bookerTxs = db.booker_transactions
    .filter((t) => t.booker_id === bookerId)
    .slice()
    .reverse();

  let runningOutstanding = 0;
  for (const tx of bookerTxs) {
    if (tx.is_reversed || tx.transaction_type === 'REVERSAL_ENTRY') {
      continue;
    }
    const prevBal = runningOutstanding;
    if (tx.transaction_type === 'CARTONS_GIVEN') {
      if (tx.juice_type === 'Apple Juice') {
        appleCartons += tx.cartons_given;
      } else if (tx.juice_type === 'Mango Juice') {
        mangoCartons += tx.cartons_given;
      }
      totalPayable = Number((totalPayable + tx.amount_payable).toFixed(2));
      runningOutstanding = Number((runningOutstanding + tx.amount_payable).toFixed(2));
    } else if (tx.transaction_type === 'PAYMENT_RECEIVED') {
      totalPayments = Number((totalPayments + tx.payment_received).toFixed(2));
      runningOutstanding = Number((runningOutstanding - tx.payment_received).toFixed(2));
    }
    tx.previous_outstanding_balance = prevBal;
    tx.updated_outstanding_balance = runningOutstanding;
  }

  const remainingOutstanding = Number((totalPayable - totalPayments).toFixed(2));
  if (remainingOutstanding < 0) {
    throw new Error(
      `Invalid balance state for booker "${booker.booker_name}": Total payments received (Rs. ${totalPayments.toLocaleString()}) cannot exceed total amount payable (Rs. ${totalPayable.toLocaleString()}).`
    );
  }

  const totalCartons = appleCartons + mangoCartons;
  booker.apple_cartons_received = appleCartons;
  booker.mango_cartons_received = mangoCartons;
  booker.total_cartons_received = totalCartons;
  booker.total_pieces_received = totalCartons * 24;
  booker.total_amount_payable = totalPayable;
  booker.total_payments_received = totalPayments;
  booker.remaining_outstanding_amount = remainingOutstanding;
  booker.updated_at = new Date().toISOString();

  return booker;
}

/**
 * PHASE 4: Create or update a Booker account (No separate login account required).
 * - Owner (Sikandar Raja) and authorized Managers (Kamran Bhai and Imran Bhai) can create bookers.
 * - Only Owner can rename or deactivate an existing booker account.
 */
export function createOrUpdateBookerAccount(params: {
  booker_id?: string;
  booker_name: string;
  contact_number?: string;
  created_date?: string;
  is_active?: boolean;
  actor: UserProfile;
}): BookerAccount {
  if (params.actor.role !== 'OWNER' && params.actor.role !== 'PRODUCTION_MANAGER') {
    throw new Error('Forbidden: Only the Owner or an authorized Manager can create or manage booker accounts.');
  }

  const nameClean = (params.booker_name || '').trim();
  if (!nameClean) {
    throw new Error('Booker name is required.');
  }

  return withErpTransaction((db) => {
    const nowIso = new Date().toISOString();
    const createdDate = (params.created_date || '').trim() || nowIso.split('T')[0];

    if (params.booker_id) {
      if (params.actor.role !== 'OWNER') {
        throw new Error('Forbidden: Only the Owner (Sikandar Raja) can edit existing booker account details.');
      }
      const existing = db.bookers.find((b) => b.id === params.booker_id);
      if (!existing) {
        throw new Error('Booker account not found.');
      }
      const duplicateName = db.bookers.find(
        (b) => b.id !== existing.id && b.booker_name.toLowerCase() === nameClean.toLowerCase()
      );
      if (duplicateName) {
        throw new Error(`Another booker named "${nameClean}" already exists.`);
      }

      existing.booker_name = nameClean;
      if (params.contact_number !== undefined) {
        existing.contact_number = params.contact_number.trim() || null;
      }
      if (typeof params.is_active === 'boolean') {
        existing.is_active = params.is_active;
      }
      existing.updated_at = nowIso;

      // Sync booker_name on their transactions
      for (const tx of db.booker_transactions) {
        if (tx.booker_id === existing.id) {
          tx.booker_name = nameClean;
        }
      }

      appendAuditLog(db, {
        actor_id: params.actor.id,
        actor_name: params.actor.full_name,
        actor_role: params.actor.role,
        action: 'BOOKER_ACCOUNT_UPDATED',
        entity_type: 'bookers',
        entity_id: existing.id,
        summary: `Updated booker account "${existing.booker_name}" (Contact: ${existing.contact_number || 'N/A'}, Active: ${existing.is_active}).`,
      });

      return existing;
    }

    const existingByName = db.bookers.find(
      (b) => b.booker_name.toLowerCase() === nameClean.toLowerCase()
    );
    if (existingByName) {
      throw new Error(`A booker account for "${existingByName.booker_name}" already exists.`);
    }

    const newBooker: BookerAccount = {
      id: `bkr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      booker_name: nameClean,
      contact_number: (params.contact_number || '').trim() || null,
      created_date: createdDate,
      is_active: true,
      total_cartons_received: 0,
      apple_cartons_received: 0,
      mango_cartons_received: 0,
      total_pieces_received: 0,
      total_amount_payable: 0,
      total_payments_received: 0,
      remaining_outstanding_amount: 0,
      created_by_id: params.actor.id,
      created_by_name: params.actor.full_name,
      created_at: nowIso,
      updated_at: nowIso,
    };

    db.bookers.push(newBooker);

    appendAuditLog(db, {
      actor_id: params.actor.id,
      actor_name: params.actor.full_name,
      actor_role: params.actor.role,
      action: 'BOOKER_ACCOUNT_CREATED',
      entity_type: 'bookers',
      entity_id: newBooker.id,
      summary: `${params.actor.full_name} created booker account for "${newBooker.booker_name}".`,
    });

    return newBooker;
  });
}

/**
 * PHASE 4: Give Cartons to Booker ("Give Cartons to Booker" form).
 * - Select existing booker OR enter booker_name to create a new booker automatically.
 * - Juice type: Apple Juice or Mango Juice (1 carton = 24 pieces).
 * - Number of cartons given (> 0 integer).
 * - Total amount payable entered directly for this transaction (no fixed price per carton assumed).
 * - Atomically:
 *   1. Validates sufficient finished goods stock; blocks and shows exact shortage if insufficient.
 *   2. Deducts cartons_given and pieces_given (cartons * 24) from Finished Goods Inventory.
 *   3. Records the CARTONS_GIVEN transaction in booker_transactions.
 *   4. Increases the booker's remaining_outstanding_amount by amount_payable.
 *   5. Does NOT deduct or modify manager cash balances.
 *   6. Prevents duplicate submissions via idempotency_key.
 */
export function giveCartonsToBooker(params: {
  booker_id?: string;
  booker_name?: string;
  contact_number?: string;
  juice_type: string;
  cartons_given: number;
  amount_payable: number;
  transaction_date?: string;
  notes?: string;
  idempotency_key?: string;
  actor: UserProfile;
}): {
  booker: BookerAccount;
  transaction: BookerTransaction;
  finished_goods: FinishedGoodsInventory;
} {
  if (params.actor.role !== 'OWNER' && params.actor.role !== 'PRODUCTION_MANAGER') {
    throw new Error(
      'Forbidden: Only the Owner (Sikandar Raja) or an authorized Manager (Kamran Bhai or Imran Bhai) can give cartons to a booker.'
    );
  }

  const juiceType = normalizeJuiceType(params.juice_type);
  const cartons = Number(params.cartons_given);
  if (!Number.isFinite(cartons) || cartons <= 0 || !Number.isInteger(cartons)) {
    throw new Error('Number of cartons given must be a whole number greater than zero.');
  }

  const amountPayable = Number(params.amount_payable);
  if (!Number.isFinite(amountPayable) || amountPayable <= 0) {
    throw new Error('Amount payable for this transaction must be greater than zero.');
  }

  const PIECES_PER_CARTON = 24;
  const piecesGiven = cartons * PIECES_PER_CARTON;
  const idempKey = (params.idempotency_key || '').trim();

  return withErpTransaction((db) => {
    // 1. Idempotency check: prevent duplicate stock deduction or duplicate booker debit
    if (idempKey) {
      const existingTx = db.booker_transactions.find((t) => t.idempotency_key === idempKey);
      if (existingTx) {
        const existingBooker =
          db.bookers.find((b) => b.id === existingTx.booker_id) || db.bookers[0];
        const existingFg =
          db.finished_goods.find(
            (f) => f.product_name.toLowerCase() === (existingTx.juice_type || juiceType).toLowerCase()
          ) || db.finished_goods[0];
        return {
          booker: existingBooker,
          transaction: existingTx,
          finished_goods: existingFg,
        };
      }
    }

    const nowIso = new Date().toISOString();
    const txDate = (params.transaction_date || '').trim() || nowIso.split('T')[0];

    // 2. Resolve existing booker or create new booker if booker_name provided
    let booker: BookerAccount | undefined;
    if (params.booker_id && params.booker_id !== '__NEW__') {
      booker = db.bookers.find((b) => b.id === params.booker_id);
      if (!booker) {
        throw new Error('Selected booker account not found.');
      }
    } else {
      const nameClean = (params.booker_name || '').trim();
      if (!nameClean) {
        throw new Error('Please select an existing booker or enter a new booker name.');
      }
      booker = db.bookers.find((b) => b.booker_name.toLowerCase() === nameClean.toLowerCase());
      if (!booker) {
        booker = {
          id: `bkr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          booker_name: nameClean,
          contact_number: (params.contact_number || '').trim() || null,
          created_date: txDate,
          is_active: true,
          total_cartons_received: 0,
          apple_cartons_received: 0,
          mango_cartons_received: 0,
          total_pieces_received: 0,
          total_amount_payable: 0,
          total_payments_received: 0,
          remaining_outstanding_amount: 0,
          created_by_id: params.actor.id,
          created_by_name: params.actor.full_name,
          created_at: nowIso,
          updated_at: nowIso,
        };
        db.bookers.push(booker);
      }
    }

    if (!booker.is_active) {
      throw new Error(`Booker account "${booker.booker_name}" is inactive.`);
    }

    // 3. Validate Finished Goods Stock for Apple Juice or Mango Juice
    const canonicalProdId = juiceType === 'Apple Juice' ? 'prod-apple-juice' : 'prod-mango-juice';
    const fg = db.finished_goods.find(
      (f) => f.product_id === canonicalProdId || f.product_name.toLowerCase() === juiceType.toLowerCase()
    );

    const availableCartons = fg?.available_cartons ?? 0;
    const availablePieces = fg?.available_bottles ?? availableCartons * PIECES_PER_CARTON;

    if (!fg || availableCartons < cartons) {
      const shortageCartons = cartons - availableCartons;
      const shortagePieces = shortageCartons * PIECES_PER_CARTON;
      throw new Error(
        `Insufficient ${juiceType} Finished Goods Stock.\nAvailable: ${availableCartons} Cartons (${availablePieces.toLocaleString()} Pieces).\nRequired: ${cartons} Cartons (${piecesGiven.toLocaleString()} Pieces).\nShortage: ${shortageCartons} Cartons (${shortagePieces.toLocaleString()} Pieces).`
      );
    }

    // 4. Deduct Cartons and 24x Pieces from Finished Goods Inventory
    fg.dispatched_cartons = Number(((fg.dispatched_cartons ?? 0) + cartons).toFixed(2));
    fg.dispatched_bottles = Math.round(fg.dispatched_cartons * PIECES_PER_CARTON);
    recalculateFinishedGoodsRow(fg);

    // 5. Recalculate booker balance before transaction & create CARTONS_GIVEN ledger entry
    recalculateBookerAccountFromLedger(db, booker.id);
    const previousOutstanding = booker.remaining_outstanding_amount;
    const updatedOutstanding = Number((previousOutstanding + amountPayable).toFixed(2));

    const refNo = `BKR-CTN-${Date.now().toString().slice(-6)}-${Math.random()
      .toString(36)
      .slice(2, 4)
      .toUpperCase()}`;

    const tx: BookerTransaction = {
      id: `bktx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      booker_id: booker.id,
      booker_name: booker.booker_name,
      transaction_type: 'CARTONS_GIVEN',
      reference_number: refNo,
      transaction_date: txDate,
      juice_type: juiceType,
      cartons_given: cartons,
      pieces_given: piecesGiven,
      amount_payable: Number(amountPayable.toFixed(2)),
      payment_received: 0,
      previous_outstanding_balance: previousOutstanding,
      updated_outstanding_balance: updatedOutstanding,
      notes:
        (params.notes || '').trim() ||
        `Given ${cartons} cartons (${piecesGiven.toLocaleString()} pieces) of ${juiceType} to ${booker.booker_name}`,
      idempotency_key: idempKey || undefined,
      entered_by_id: params.actor.id,
      entered_by_name: params.actor.full_name,
      is_reversed: false,
      created_at: nowIso,
    };

    db.booker_transactions.unshift(tx);
    const updatedBooker = recalculateBookerAccountFromLedger(db, booker.id);

    // 6. Log Finished Goods Inventory Movement
    db.inventory_movements.unshift({
      id: `mov-bkr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      item_type: 'FINISHED_GOOD',
      item_id: fg.product_id,
      item_name: juiceType,
      movement_type: 'BOOKER_CARTONS_GIVEN',
      quantity_change: -cartons,
      balance_after: fg.closing_stock_cartons,
      reference_type: 'BOOKER',
      reference_id: refNo,
      notes: `Given ${cartons} cartons (${piecesGiven.toLocaleString()} pieces) of ${juiceType} to Booker ${booker.booker_name} (Payable: Rs. ${amountPayable.toLocaleString()})`,
      performed_by: params.actor.full_name,
      created_at: nowIso,
    });

    appendAuditLog(db, {
      actor_id: params.actor.id,
      actor_name: params.actor.full_name,
      actor_role: params.actor.role,
      action: 'BOOKER_CARTONS_GIVEN',
      entity_type: 'booker_transactions',
      entity_id: tx.id,
      summary: `${params.actor.full_name} gave ${cartons} cartons (${piecesGiven.toLocaleString()} pieces) of ${juiceType} to Booker ${booker.booker_name} for Rs. ${amountPayable.toLocaleString()}. Outstanding: Rs. ${previousOutstanding.toLocaleString()} -> Rs. ${updatedBooker.remaining_outstanding_amount.toLocaleString()}.`,
    });

    return {
      booker: updatedBooker,
      transaction: tx,
      finished_goods: fg,
    };
  });
}

/**
 * PHASE 4: Receive Partial or Full Payment from Booker ("Receive Payment" form).
 * - Adds the payment to the booker's payment history.
 * - Reduces the booker's remaining_outstanding_amount.
 * - Updates total_payments_received without resetting old payment history.
 * - Never allows a payment greater than the booker's remaining_outstanding_amount.
 * - Does NOT modify manager cash balances.
 * - Prevents duplicate submissions via idempotency_key.
 */
export function receiveBookerPayment(params: {
  booker_id: string;
  payment_amount: number;
  payment_date?: string;
  notes?: string;
  idempotency_key?: string;
  actor: UserProfile;
}): {
  booker: BookerAccount;
  transaction: BookerTransaction;
} {
  if (params.actor.role !== 'OWNER' && params.actor.role !== 'PRODUCTION_MANAGER') {
    throw new Error(
      'Forbidden: Only the Owner (Sikandar Raja) or an authorized Manager (Kamran Bhai or Imran Bhai) can receive booker payments.'
    );
  }

  const paymentAmount = Number(params.payment_amount);
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }

  const idempKey = (params.idempotency_key || '').trim();

  return withErpTransaction((db) => {
    // 1. Idempotency check: prevent duplicate payment credit
    if (idempKey) {
      const existingTx = db.booker_transactions.find((t) => t.idempotency_key === idempKey);
      if (existingTx) {
        const existingBooker =
          db.bookers.find((b) => b.id === existingTx.booker_id) || db.bookers[0];
        return {
          booker: existingBooker,
          transaction: existingTx,
        };
      }
    }

    const booker = db.bookers.find((b) => b.id === params.booker_id);
    if (!booker) {
      throw new Error('Selected booker account not found.');
    }

    recalculateBookerAccountFromLedger(db, booker.id);
    const previousOutstanding = booker.remaining_outstanding_amount;

    if (paymentAmount > previousOutstanding) {
      throw new Error(
        `Overpayment blocked: Payment amount Rs. ${paymentAmount.toLocaleString()} exceeds ${booker.booker_name}'s remaining outstanding balance of Rs. ${previousOutstanding.toLocaleString()}.`
      );
    }

    const nowIso = new Date().toISOString();
    const payDate = (params.payment_date || '').trim() || nowIso.split('T')[0];
    const updatedOutstanding = Number((previousOutstanding - paymentAmount).toFixed(2));
    const refNo = `BKR-PAY-${Date.now().toString().slice(-6)}-${Math.random()
      .toString(36)
      .slice(2, 4)
      .toUpperCase()}`;

    const tx: BookerTransaction = {
      id: `bktx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      booker_id: booker.id,
      booker_name: booker.booker_name,
      transaction_type: 'PAYMENT_RECEIVED',
      reference_number: refNo,
      transaction_date: payDate,
      juice_type: null,
      cartons_given: 0,
      pieces_given: 0,
      amount_payable: 0,
      payment_received: Number(paymentAmount.toFixed(2)),
      previous_outstanding_balance: previousOutstanding,
      updated_outstanding_balance: updatedOutstanding,
      notes:
        (params.notes || '').trim() ||
        `Payment received from ${booker.booker_name}: Rs. ${paymentAmount.toLocaleString()}`,
      idempotency_key: idempKey || undefined,
      entered_by_id: params.actor.id,
      entered_by_name: params.actor.full_name,
      is_reversed: false,
      created_at: nowIso,
    };

    db.booker_transactions.unshift(tx);
    const updatedBooker = recalculateBookerAccountFromLedger(db, booker.id);

    appendAuditLog(db, {
      actor_id: params.actor.id,
      actor_name: params.actor.full_name,
      actor_role: params.actor.role,
      action: 'BOOKER_PAYMENT_RECEIVED',
      entity_type: 'booker_transactions',
      entity_id: tx.id,
      summary: `${params.actor.full_name} received Rs. ${paymentAmount.toLocaleString()} from Booker ${booker.booker_name}. Remaining outstanding: Rs. ${previousOutstanding.toLocaleString()} -> Rs. ${updatedBooker.remaining_outstanding_amount.toLocaleString()}.`,
    });

    return {
      booker: updatedBooker,
      transaction: tx,
    };
  });
}

/**
 * PHASE 4: Authorized Reversal & Correction of a Booker Transaction (Carton Allocation or Payment).
 * - Never silently deletes or overwrites booker transactions or payments.
 * - Preserves original record (marks is_reversed = true), records reversal reason & actor,
 *   and appends an auditable REVERSAL_ENTRY row.
 * - If reversing a CARTONS_GIVEN transaction, restores the cartons and 24x pieces back to
 *   Finished Goods Inventory and reduces the booker's payable balance.
 * - If reversing a PAYMENT_RECEIVED transaction, restores the booker's outstanding balance.
 * - Supports optional corrected replacement values (corrected_allocation or corrected_payment)
 *   in the same atomic transaction.
 * - Permission enforcement:
 *   - Owner (Sikandar Raja) can reverse or correct any booker transaction.
 *   - Managers (Kamran Bhai and Imran Bhai) can only reverse or correct transactions they entered themselves.
 */
export function reverseOrCorrectBookerTransaction(params: {
  transaction_id: string;
  reason: string;
  corrected_allocation?: {
    juice_type?: string;
    cartons_given: number;
    amount_payable: number;
    transaction_date?: string;
    notes?: string;
  };
  corrected_payment?: {
    payment_amount: number;
    payment_date?: string;
    notes?: string;
  };
  actor: UserProfile;
}): {
  booker: BookerAccount;
  reversed_transaction: BookerTransaction;
  reversal_entry: BookerTransaction;
  replacement_transaction?: BookerTransaction;
} {
  if (params.actor.role !== 'OWNER' && params.actor.role !== 'PRODUCTION_MANAGER') {
    throw new Error('Forbidden: Only the Owner or an authorized Manager can reverse or correct booker transactions.');
  }

  const reasonTrimmed = (params.reason || '').trim();
  if (!reasonTrimmed) {
    throw new Error('A mandatory reason is required to reverse or correct a booker transaction.');
  }

  return withErpTransaction((db) => {
    const original = db.booker_transactions.find((t) => t.id === params.transaction_id);
    if (!original) {
      throw new Error('Booker transaction not found.');
    }

    if (params.actor.role === 'PRODUCTION_MANAGER' && original.entered_by_id !== params.actor.id) {
      throw new Error(
        `Forbidden: ${params.actor.full_name} cannot reverse or modify a booker transaction entered by ${original.entered_by_name}.`
      );
    }

    if (original.is_reversed || original.transaction_type === 'REVERSAL_ENTRY') {
      throw new Error(
        `Duplicate reversal prevented: Transaction ${original.reference_number} has already been reversed.`
      );
    }

    const booker = db.bookers.find((b) => b.id === original.booker_id);
    if (!booker) {
      throw new Error('Associated booker account not found.');
    }

    const PIECES_PER_CARTON = 24;
    const nowIso = new Date().toISOString();
    const revDate = nowIso.split('T')[0];
    const revRef = `REV-${original.reference_number}`;

    recalculateBookerAccountFromLedger(db, booker.id);
    const previousOutstanding = booker.remaining_outstanding_amount;

    // Validate financial & stock consistency before mutating
    if (original.transaction_type === 'CARTONS_GIVEN') {
      const replacementPayable = params.corrected_allocation
        ? Number(params.corrected_allocation.amount_payable)
        : 0;
      if (params.corrected_allocation) {
        const repCartons = Number(params.corrected_allocation.cartons_given);
        if (!Number.isFinite(repCartons) || repCartons <= 0 || !Number.isInteger(repCartons)) {
          throw new Error('Corrected cartons given must be a whole number greater than zero.');
        }
        if (!Number.isFinite(replacementPayable) || replacementPayable <= 0) {
          throw new Error('Corrected amount payable must be greater than zero.');
        }
      }

      const resultingPayable = Number(
        (booker.total_amount_payable - original.amount_payable + replacementPayable).toFixed(2)
      );
      if (resultingPayable < booker.total_payments_received) {
        throw new Error(
          `Cannot reverse carton allocation ${original.reference_number}: Booker ${booker.booker_name} has already paid Rs. ${booker.total_payments_received.toLocaleString()}, which would exceed the resulting payable amount of Rs. ${resultingPayable.toLocaleString()}.`
        );
      }

      // Restore Finished Goods Cartons & Pieces from original allocation
      const origJuice = original.juice_type || 'Apple Juice';
      const origProdId = origJuice === 'Apple Juice' ? 'prod-apple-juice' : 'prod-mango-juice';
      const origFg = db.finished_goods.find(
        (f) => f.product_id === origProdId || f.product_name.toLowerCase() === origJuice.toLowerCase()
      );

      // If replacement allocation is requested, verify finished goods stock will be sufficient after restoring original cartons
      if (params.corrected_allocation) {
        const repJuice = normalizeJuiceType(params.corrected_allocation.juice_type || origJuice);
        const repCartons = Number(params.corrected_allocation.cartons_given);
        const repProdId = repJuice === 'Apple Juice' ? 'prod-apple-juice' : 'prod-mango-juice';
        const repFg = db.finished_goods.find(
          (f) => f.product_id === repProdId || f.product_name.toLowerCase() === repJuice.toLowerCase()
        );
        const availAfterRestore =
          (repFg?.available_cartons ?? 0) + (repJuice === origJuice ? original.cartons_given : 0);
        if (availAfterRestore < repCartons) {
          const shortage = repCartons - availAfterRestore;
          throw new Error(
            `Insufficient ${repJuice} Finished Goods Stock for correction.\nAvailable: ${availAfterRestore} Cartons (${(availAfterRestore * 24).toLocaleString()} Pieces).\nRequired: ${repCartons} Cartons (${(repCartons * 24).toLocaleString()} Pieces).\nShortage: ${shortage} Cartons (${(shortage * 24).toLocaleString()} Pieces).`
          );
        }
      }

      if (origFg) {
        origFg.dispatched_cartons = Math.max(
          0,
          Number(((origFg.dispatched_cartons ?? 0) - original.cartons_given).toFixed(2))
        );
        origFg.dispatched_bottles = Math.round(origFg.dispatched_cartons * PIECES_PER_CARTON);
        recalculateFinishedGoodsRow(origFg);

        db.inventory_movements.unshift({
          id: `mov-bkrrev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          item_type: 'FINISHED_GOOD',
          item_id: origFg.product_id,
          item_name: origJuice,
          movement_type: 'BOOKER_ALLOCATION_REVERSED',
          quantity_change: original.cartons_given,
          balance_after: origFg.closing_stock_cartons,
          reference_type: 'BOOKER',
          reference_id: revRef,
          notes: `Reversed Booker Allocation ${original.reference_number} (${booker.booker_name}): Restored +${original.cartons_given} cartons (+${original.pieces_given.toLocaleString()} pieces). Reason: ${reasonTrimmed}`,
          performed_by: params.actor.full_name,
          created_at: nowIso,
        });
      }
    } else if (original.transaction_type === 'PAYMENT_RECEIVED') {
      if (params.corrected_payment) {
        const repPay = Number(params.corrected_payment.payment_amount);
        if (!Number.isFinite(repPay) || repPay <= 0) {
          throw new Error('Corrected payment amount must be greater than zero.');
        }
        const maxAllowed = Number((previousOutstanding + original.payment_received).toFixed(2));
        if (repPay > maxAllowed) {
          throw new Error(
            `Corrected payment amount Rs. ${repPay.toLocaleString()} exceeds booker's outstanding balance of Rs. ${maxAllowed.toLocaleString()}.`
          );
        }
      }
    }

    // Mark original transaction as reversed (preserving record)
    original.is_reversed = true;
    original.reversed_at = nowIso;
    original.reversed_by_id = params.actor.id;
    original.reversed_by_name = params.actor.full_name;
    original.reversal_reason = reasonTrimmed;

    const afterReversalBooker = recalculateBookerAccountFromLedger(db, booker.id);

    const reversalEntry: BookerTransaction = {
      id: `bktx-rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      booker_id: booker.id,
      booker_name: booker.booker_name,
      transaction_type: 'REVERSAL_ENTRY',
      reference_number: revRef,
      transaction_date: revDate,
      juice_type: original.juice_type || null,
      cartons_given: original.cartons_given,
      pieces_given: original.pieces_given,
      amount_payable: original.amount_payable,
      payment_received: original.payment_received,
      previous_outstanding_balance: previousOutstanding,
      updated_outstanding_balance: afterReversalBooker.remaining_outstanding_amount,
      notes: `REVERSAL of ${original.reference_number}: ${reasonTrimmed}`,
      entered_by_id: params.actor.id,
      entered_by_name: params.actor.full_name,
      is_reversed: false,
      reverses_transaction_id: original.id,
      created_at: nowIso,
    };
    db.booker_transactions.unshift(reversalEntry);

    // Optional atomic replacement transaction
    let replacementTx: BookerTransaction | undefined;
    if (original.transaction_type === 'CARTONS_GIVEN' && params.corrected_allocation) {
      const repJuice = normalizeJuiceType(
        params.corrected_allocation.juice_type || original.juice_type || 'Apple Juice'
      );
      const repCartons = Number(params.corrected_allocation.cartons_given);
      const repPieces = repCartons * PIECES_PER_CARTON;
      const repPayable = Number(params.corrected_allocation.amount_payable);
      const repDate =
        (params.corrected_allocation.transaction_date || '').trim() || original.transaction_date;
      const repRef = `${original.reference_number}-CORR`;

      const repProdId = repJuice === 'Apple Juice' ? 'prod-apple-juice' : 'prod-mango-juice';
      const repFg = db.finished_goods.find(
        (f) => f.product_id === repProdId || f.product_name.toLowerCase() === repJuice.toLowerCase()
      )!;

      repFg.dispatched_cartons = Number(((repFg.dispatched_cartons ?? 0) + repCartons).toFixed(2));
      repFg.dispatched_bottles = Math.round(repFg.dispatched_cartons * PIECES_PER_CARTON);
      recalculateFinishedGoodsRow(repFg);

      const prevBeforeRep = afterReversalBooker.remaining_outstanding_amount;
      const updAfterRep = Number((prevBeforeRep + repPayable).toFixed(2));

      replacementTx = {
        id: `bktx-corr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        booker_id: booker.id,
        booker_name: booker.booker_name,
        transaction_type: 'CARTONS_GIVEN',
        reference_number: repRef,
        transaction_date: repDate,
        juice_type: repJuice,
        cartons_given: repCartons,
        pieces_given: repPieces,
        amount_payable: Number(repPayable.toFixed(2)),
        payment_received: 0,
        previous_outstanding_balance: prevBeforeRep,
        updated_outstanding_balance: updAfterRep,
        notes:
          (params.corrected_allocation.notes || '').trim() ||
          `Correction of ${original.reference_number}: ${reasonTrimmed}`,
        entered_by_id: params.actor.id,
        entered_by_name: params.actor.full_name,
        is_reversed: false,
        corrects_transaction_id: original.id,
        created_at: nowIso,
      };
      original.corrected_by_transaction_id = replacementTx.id;
      db.booker_transactions.unshift(replacementTx);

      db.inventory_movements.unshift({
        id: `mov-bkrcorr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        item_type: 'FINISHED_GOOD',
        item_id: repFg.product_id,
        item_name: repJuice,
        movement_type: 'BOOKER_CARTONS_GIVEN',
        quantity_change: -repCartons,
        balance_after: repFg.closing_stock_cartons,
        reference_type: 'BOOKER',
        reference_id: repRef,
        notes: `Corrected Booker Allocation (replaces ${original.reference_number}): -${repCartons} cartons (-${repPieces.toLocaleString()} pieces) to ${booker.booker_name}`,
        performed_by: params.actor.full_name,
        created_at: nowIso,
      });
    } else if (original.transaction_type === 'PAYMENT_RECEIVED' && params.corrected_payment) {
      const repPay = Number(params.corrected_payment.payment_amount);
      const repDate =
        (params.corrected_payment.payment_date || '').trim() || original.transaction_date;
      const repRef = `${original.reference_number}-CORR`;
      const prevBeforeRep = afterReversalBooker.remaining_outstanding_amount;
      const updAfterRep = Number((prevBeforeRep - repPay).toFixed(2));

      replacementTx = {
        id: `bktx-corr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        booker_id: booker.id,
        booker_name: booker.booker_name,
        transaction_type: 'PAYMENT_RECEIVED',
        reference_number: repRef,
        transaction_date: repDate,
        juice_type: null,
        cartons_given: 0,
        pieces_given: 0,
        amount_payable: 0,
        payment_received: Number(repPay.toFixed(2)),
        previous_outstanding_balance: prevBeforeRep,
        updated_outstanding_balance: updAfterRep,
        notes:
          (params.corrected_payment.notes || '').trim() ||
          `Correction of ${original.reference_number}: ${reasonTrimmed}`,
        entered_by_id: params.actor.id,
        entered_by_name: params.actor.full_name,
        is_reversed: false,
        corrects_transaction_id: original.id,
        created_at: nowIso,
      };
      original.corrected_by_transaction_id = replacementTx.id;
      db.booker_transactions.unshift(replacementTx);
    }

    const finalBooker = recalculateBookerAccountFromLedger(db, booker.id);

    appendAuditLog(db, {
      actor_id: params.actor.id,
      actor_name: params.actor.full_name,
      actor_role: params.actor.role,
      action: replacementTx ? 'BOOKER_TRANSACTION_CORRECTED' : 'BOOKER_TRANSACTION_REVERSED',
      entity_type: 'booker_transactions',
      entity_id: original.id,
      summary: replacementTx
        ? `${params.actor.full_name} reversed booker transaction ${original.reference_number} for ${booker.booker_name} and applied corrected transaction ${replacementTx.reference_number} (Reason: ${reasonTrimmed}).`
        : `${params.actor.full_name} reversed booker transaction ${original.reference_number} for ${booker.booker_name} (Reason: ${reasonTrimmed}).`,
    });

    return {
      booker: finalBooker,
      reversed_transaction: original,
      reversal_entry: reversalEntry,
      replacement_transaction: replacementTx,
    };
  });
}

// ============================================================================
// PHASE 5: AUTHORITATIVE BUSINESS REPORTS & CROSS-MODULE AGGREGATION
// ============================================================================

export function generateDailyFactoryReport(
  db: ErpDatabaseState,
  targetDate: string
) {
  const dateStr = (targetDate || '').trim() || new Date().toISOString().split('T')[0];

  const activeCashTxs = (db.manager_cash_transactions || []).filter(
    (t) =>
      !t.is_reversed &&
      t.transaction_type !== 'REVERSAL_ADJUSTMENT' &&
      t.transaction_date === dateStr
  );

  const cashIssuedList = activeCashTxs.filter(
    (t) => t.transaction_type === 'CASH_ISSUED_BY_OWNER'
  );
  const managerPurchasesList = activeCashTxs.filter(
    (t) => t.transaction_type === 'MATERIAL_PURCHASE'
  );
  const generalExpensesList = activeCashTxs.filter(
    (t) => t.transaction_type === 'FACTORY_EXPENSE'
  );

  const totalCashIssued = Number(
    cashIssuedList.reduce((s, t) => s + t.amount, 0).toFixed(2)
  );
  const totalManagerPurchases = Number(
    managerPurchasesList.reduce((s, t) => s + t.amount, 0).toFixed(2)
  );
  const totalGeneralExpenses = Number(
    generalExpensesList.reduce((s, t) => s + t.amount, 0).toFixed(2)
  );

  const stockChanges = (db.stock_ledger || []).filter((l) => l.date === dateStr);

  const confirmedBatches = (db.production_batches || []).filter(
    (b) =>
      !b.is_reversed &&
      b.status !== 'REVERSED' &&
      (b.status === 'CONFIRMED' || b.status === 'APPROVED' || b.status === 'Completed') &&
      b.production_date === dateStr
  );

  const appleBatches = confirmedBatches.filter((b) =>
    (b.juice_type || b.product_name || '').toLowerCase().includes('apple')
  );
  const mangoBatches = confirmedBatches.filter((b) =>
    (b.juice_type || b.product_name || '').toLowerCase().includes('mango')
  );

  const appleCartons = appleBatches.reduce((s, b) => s + b.actual_cartons, 0);
  const applePieces = appleCartons * 24;
  const mangoCartons = mangoBatches.reduce((s, b) => s + b.actual_cartons, 0);
  const mangoPieces = mangoCartons * 24;

  const materialConsumption = confirmedBatches.flatMap((b) =>
    b.material_usage.map((u) => ({
      batch_number: b.batch_number,
      product_name: b.juice_type || b.product_name,
      manager_name: b.submitted_by_name || b.created_by_name || 'Manager',
      material_name: u.raw_material_name,
      entered_quantity: u.entered_quantity ?? u.quantity_entered ?? u.actual_quantity,
      entered_unit: u.entered_unit ?? u.unit_entered ?? u.unit,
      base_quantity: u.actual_quantity,
      base_unit: u.unit,
    }))
  );

  const activeBookerTxs = (db.booker_transactions || []).filter(
    (t) =>
      !t.is_reversed &&
      t.transaction_type !== 'REVERSAL_ENTRY' &&
      t.transaction_date === dateStr
  );

  const bookerAllocations = activeBookerTxs.filter(
    (t) => t.transaction_type === 'CARTONS_GIVEN'
  );
  const bookerPayments = activeBookerTxs.filter(
    (t) => t.transaction_type === 'PAYMENT_RECEIVED'
  );

  const totalBookerCartonsGiven = bookerAllocations.reduce(
    (s, t) => s + t.cartons_given,
    0
  );
  const totalBookerPayableAdded = Number(
    bookerAllocations.reduce((s, t) => s + t.amount_payable, 0).toFixed(2)
  );
  const totalBookerPaymentsReceived = Number(
    bookerPayments.reduce((s, t) => s + t.payment_received, 0).toFixed(2)
  );

  return {
    report_date: dateStr,
    cash_issued_total: totalCashIssued,
    cash_issued_entries: cashIssuedList,
    manager_purchases_total: totalManagerPurchases,
    manager_purchases_entries: managerPurchasesList,
    general_expenses_total: totalGeneralExpenses,
    general_expenses_entries: generalExpensesList,
    raw_material_stock_changes: stockChanges,
    apple_production_cartons: appleCartons,
    apple_production_pieces: applePieces,
    mango_production_cartons: mangoCartons,
    mango_production_pieces: mangoPieces,
    total_production_cartons: appleCartons + mangoCartons,
    total_production_pieces: applePieces + mangoPieces,
    material_consumption: materialConsumption,
    booker_allocations_cartons: totalBookerCartonsGiven,
    booker_allocations_payable: totalBookerPayableAdded,
    booker_allocations_entries: bookerAllocations,
    booker_payments_total: totalBookerPaymentsReceived,
    booker_payments_entries: bookerPayments,
  };
}

export function generateMonthlyFactoryReport(
  db: ErpDatabaseState,
  yearMonthOrFrom: string,
  dateToOptional?: string
) {
  const prefix = (yearMonthOrFrom || '').trim().slice(0, 7);
  const inPeriod = (d: string) => {
    if (dateToOptional && yearMonthOrFrom.length === 10) {
      return d >= yearMonthOrFrom && d <= dateToOptional;
    }
    return d.startsWith(prefix);
  };

  for (const u of db.users) {
    if (u.role === 'PRODUCTION_MANAGER') {
      recalculateManagerCashAccountFromLedger(db, u.id);
    }
  }
  for (const b of db.bookers || []) {
    recalculateBookerAccountFromLedger(db, b.id);
  }

  const confirmedBatches = (db.production_batches || []).filter(
    (b) =>
      !b.is_reversed &&
      b.status !== 'REVERSED' &&
      (b.status === 'CONFIRMED' || b.status === 'APPROVED' || b.status === 'Completed') &&
      inPeriod(b.production_date)
  );

  const appleCartons = confirmedBatches
    .filter((b) => (b.juice_type || b.product_name || '').toLowerCase().includes('apple'))
    .reduce((s, b) => s + b.actual_cartons, 0);
  const mangoCartons = confirmedBatches
    .filter((b) => (b.juice_type || b.product_name || '').toLowerCase().includes('mango'))
    .reduce((s, b) => s + b.actual_cartons, 0);
  const totalCartons = appleCartons + mangoCartons;
  const totalPieces = totalCartons * 24;

  const activeCashTxs = (db.manager_cash_transactions || []).filter(
    (t) =>
      !t.is_reversed &&
      t.transaction_type !== 'REVERSAL_ADJUSTMENT' &&
      inPeriod(t.transaction_date)
  );

  const rawMaterialPurchasesAmount = Number(
    activeCashTxs
      .filter((t) => t.transaction_type === 'MATERIAL_PURCHASE')
      .reduce((s, t) => s + t.amount, 0)
      .toFixed(2)
  );
  const factoryExpensesAmount = Number(
    activeCashTxs
      .filter((t) => t.transaction_type === 'FACTORY_EXPENSE')
      .reduce((s, t) => s + t.amount, 0)
      .toFixed(2)
  );

  const managerBalances = (db.manager_cash_accounts || []).map((a) => ({
    manager_id: a.manager_id,
    manager_name: a.manager_name,
    total_cash_received: a.total_cash_received,
    total_spent_purchases: a.total_spent_purchases,
    total_spent_expenses: a.total_spent_expenses,
    available_balance: a.available_balance,
  }));

  const bookerBalances = (db.bookers || []).map((b) => ({
    booker_id: b.id,
    booker_name: b.booker_name,
    apple_cartons_received: b.apple_cartons_received,
    mango_cartons_received: b.mango_cartons_received,
    total_cartons_received: b.total_cartons_received,
    total_amount_payable: b.total_amount_payable,
    total_payments_received: b.total_payments_received,
    remaining_outstanding_amount: b.remaining_outstanding_amount,
  }));

  return {
    period: dateToOptional ? `${yearMonthOrFrom} to ${dateToOptional}` : prefix,
    total_production_cartons: totalCartons,
    apple_cartons_produced: appleCartons,
    mango_cartons_produced: mangoCartons,
    total_pieces_produced: totalPieces,
    raw_material_purchases_total: rawMaterialPurchasesAmount,
    factory_expenses_total: factoryExpensesAmount,
    manager_cash_balances: managerBalances,
    booker_outstanding_balances: bookerBalances,
    total_booker_outstanding: Number(
      bookerBalances.reduce((s, b) => s + b.remaining_outstanding_amount, 0).toFixed(2)
    ),
  };
}

export function generateManagerWiseReport(
  db: ErpDatabaseState,
  params?: {
    manager_id?: string;
    date_from?: string;
    date_to?: string;
  }
) {
  const managers = db.users.filter(
    (u) =>
      u.role === 'PRODUCTION_MANAGER' &&
      (!params?.manager_id ||
        params.manager_id === 'ALL' ||
        u.id === params.manager_id ||
        u.full_name.toLowerCase().includes(params.manager_id.toLowerCase()))
  );

  const inRange = (d: string) => {
    if (params?.date_from && d < params.date_from) return false;
    if (params?.date_to && d > params.date_to) return false;
    return true;
  };

  return managers.map((mgr) => {
    const acc = recalculateManagerCashAccountFromLedger(db, mgr.id);
    const mgrCashTxs = (db.manager_cash_transactions || []).filter(
      (t) =>
        t.manager_id === mgr.id &&
        !t.is_reversed &&
        t.transaction_type !== 'REVERSAL_ADJUSTMENT' &&
        inRange(t.transaction_date)
    );

    const cashReceivedInPeriod = Number(
      mgrCashTxs
        .filter((t) => t.transaction_type === 'CASH_ISSUED_BY_OWNER')
        .reduce((s, t) => s + t.amount, 0)
        .toFixed(2)
    );
    const purchasesInPeriod = Number(
      mgrCashTxs
        .filter((t) => t.transaction_type === 'MATERIAL_PURCHASE')
        .reduce((s, t) => s + t.amount, 0)
        .toFixed(2)
    );
    const expensesInPeriod = Number(
      mgrCashTxs
        .filter((t) => t.transaction_type === 'FACTORY_EXPENSE')
        .reduce((s, t) => s + t.amount, 0)
        .toFixed(2)
    );

    const mgrBatches = (db.production_batches || []).filter(
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
        inRange(b.production_date)
    );

    const appleCartons = mgrBatches
      .filter((b) => (b.juice_type || b.product_name || '').toLowerCase().includes('apple'))
      .reduce((s, b) => s + b.actual_cartons, 0);
    const mangoCartons = mgrBatches
      .filter((b) => (b.juice_type || b.product_name || '').toLowerCase().includes('mango'))
      .reduce((s, b) => s + b.actual_cartons, 0);

    const materialConsumptionMap = new Map<
      string,
      { material_name: string; quantity: number; unit: string }
    >();
    for (const b of mgrBatches) {
      for (const u of b.material_usage) {
        const prev = materialConsumptionMap.get(u.raw_material_id);
        if (prev) {
          prev.quantity = Number((prev.quantity + u.actual_quantity).toFixed(4));
        } else {
          materialConsumptionMap.set(u.raw_material_id, {
            material_name: u.raw_material_name,
            quantity: u.actual_quantity,
            unit: String(u.unit),
          });
        }
      }
    }

    const transactionsByDate = [
      ...mgrCashTxs.map((t) => ({
        date: t.transaction_date,
        reference: t.reference_number,
        category: t.transaction_type,
        details: t.description,
        amount_pkr: t.amount,
      })),
      ...mgrBatches.map((b) => ({
        date: b.production_date,
        reference: b.batch_number,
        category: 'PRODUCTION_CONFIRMED',
        details: `${b.actual_cartons} Cartons (${(b.actual_cartons * 24).toLocaleString()} Pieces) ${
          b.juice_type || b.product_name
        }`,
        amount_pkr: 0,
      })),
    ].sort((a, b) => (a.date < b.date ? 1 : -1));

    return {
      manager_id: mgr.id,
      manager_name: mgr.full_name,
      total_cash_received: cashReceivedInPeriod,
      purchases_total: purchasesInPeriod,
      general_expenses_total: expensesInPeriod,
      current_balance: acc.available_balance,
      production_entries_count: mgrBatches.length,
      apple_cartons_produced: appleCartons,
      mango_cartons_produced: mangoCartons,
      total_cartons_produced: appleCartons + mangoCartons,
      total_pieces_produced: (appleCartons + mangoCartons) * 24,
      material_consumption: Array.from(materialConsumptionMap.values()),
      transactions_by_date: transactionsByDate,
    };
  });
}

export function generateInventoryReport(
  db: ErpDatabaseState,
  params?: {
    material_id?: string;
  }
) {
  return (db.raw_materials || [])
    .filter(
      (rm) =>
        !params?.material_id ||
        params.material_id === 'ALL' ||
        rm.id === params.material_id ||
        rm.name.toLowerCase() === params.material_id.toLowerCase()
    )
    .map((rm) => ({
      material_id: rm.id,
      material_code: rm.code,
      material_name: rm.name,
      category: rm.category,
      opening_stock: rm.opening_stock ?? 0,
      total_purchases: rm.stock_received ?? 0,
      total_consumption: rm.stock_consumed ?? 0,
      adjustments: rm.stock_adjusted ?? 0,
      current_available_stock: rm.current_stock ?? 0,
      minimum_stock_level: rm.minimum_stock_level ?? 0,
      unit: String(rm.unit),
      status:
        rm.current_stock <= 0
          ? 'OUT_OF_STOCK'
          : rm.minimum_stock_level > 0 && rm.current_stock <= rm.minimum_stock_level
          ? 'LOW_STOCK'
          : 'IN_STOCK',
    }));
}

export function generateBookerReport(
  db: ErpDatabaseState,
  params?: {
    booker_id?: string;
    date_from?: string;
    date_to?: string;
  }
) {
  for (const b of db.bookers || []) {
    recalculateBookerAccountFromLedger(db, b.id);
  }

  const hasDateFilter = Boolean(params?.date_from || params?.date_to);
  const activeTxs = (db.booker_transactions || []).filter(
    (t) => !t.is_reversed && t.transaction_type !== 'REVERSAL_ENTRY'
  );

  return (db.bookers || [])
    .filter(
      (b) =>
        !params?.booker_id ||
        params.booker_id === 'ALL' ||
        b.id === params.booker_id ||
        b.booker_name.toLowerCase() === params.booker_id.toLowerCase()
    )
    .map((b) => {
      if (!hasDateFilter) {
        return {
          booker_id: b.id,
          booker_name: b.booker_name,
          contact_number: b.contact_number || '—',
          apple_cartons_given: b.apple_cartons_received,
          mango_cartons_given: b.mango_cartons_received,
          total_cartons: b.total_cartons_received,
          total_pieces: b.total_pieces_received,
          total_amount_payable: b.total_amount_payable,
          payments_received: b.total_payments_received,
          outstanding_balance: b.remaining_outstanding_amount,
        };
      }

      const bTxs = activeTxs.filter((t) => {
        if (t.booker_id !== b.id) return false;
        if (params?.date_from && t.transaction_date < params.date_from) return false;
        if (params?.date_to && t.transaction_date > params.date_to) return false;
        return true;
      });

      const appleCtn = bTxs
        .filter((t) => t.transaction_type === 'CARTONS_GIVEN' && t.juice_type === 'Apple Juice')
        .reduce((s, t) => s + t.cartons_given, 0);
      const mangoCtn = bTxs
        .filter((t) => t.transaction_type === 'CARTONS_GIVEN' && t.juice_type === 'Mango Juice')
        .reduce((s, t) => s + t.cartons_given, 0);
      const totalCtn = appleCtn + mangoCtn;
      const payable = Number(
        bTxs
          .filter((t) => t.transaction_type === 'CARTONS_GIVEN')
          .reduce((s, t) => s + t.amount_payable, 0)
          .toFixed(2)
      );
      const received = Number(
        bTxs
          .filter((t) => t.transaction_type === 'PAYMENT_RECEIVED')
          .reduce((s, t) => s + t.payment_received, 0)
          .toFixed(2)
      );

      return {
        booker_id: b.id,
        booker_name: b.booker_name,
        contact_number: b.contact_number || '—',
        apple_cartons_given: appleCtn,
        mango_cartons_given: mangoCtn,
        total_cartons: totalCtn,
        total_pieces: totalCtn * 24,
        total_amount_payable: payable,
        payments_received: received,
        outstanding_balance: Number((payable - received).toFixed(2)),
      };
    });
}
