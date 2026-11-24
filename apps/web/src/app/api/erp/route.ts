import { NextResponse } from 'next/server';
import {
  readErpDatabase,
  withErpTransaction,
  appendAuditLog,
  createInitialSeedDatabase,
  createCleanProductionDatabase,
  writeErpDatabase,
  type ErpDatabaseState,
} from '@/lib/db/store';
import {
  verifyAndCompleteBatch,
  transitionOrderStatus,
  reverseDealerLedgerEntry,
  recalculateFinishedGoodsRow,
  haversineDistanceKm,
  recordRawMaterialPurchaseReceipt,
  createOrUpdateProductionBatch,
  reviewProductionBatchByAdmin,
  confirmProductionBatch,
  reverseOrCorrectProductionBatch,
  setFinishedGoodsOpeningStock,
  adjustRawMaterialStock,
  setRawMaterialOpeningStock,
  configureRawMaterialSettings,
  manageEmployeeAccount,
  switchDatabaseEnvironmentMode,
  postFinancialTransaction,
  reverseSupplierLedgerEntry,
  reverseFinancialTransaction,
  issueCashToManagerAccount,
  recordManagerCashPurchase,
  recordManagerCashExpense,
  reverseManagerCashTransaction,
  recalculateManagerCashAccountFromLedger,
  recalculateBookerAccountFromLedger,
  createOrUpdateBookerAccount,
  giveCartonsToBooker,
  receiveBookerPayment,
  reverseOrCorrectBookerTransaction,
} from '@/lib/db/operations';
import {
  checkHasSupabaseAdminSecretKey,
  checkIsSupabaseConfigured,
  getSupabaseAuthClient,
  getSupabaseServerClient,
} from '@/lib/supabase/client';
import {
  ERP_SESSION_COOKIE_NAME,
  createSignedSessionToken,
  hashPasswordSecure,
  resolveAuthenticatedSessionUser,
  verifyPasswordSecure,
} from '@/lib/auth/session';
import { provisionCoreFactoryAccounts } from '@/lib/auth/provision';
import type { RoleName, UserProfile } from '@juice-erp/shared-types';

function assertRole(actor: UserProfile, allowed: RoleName[], actionDescription: string) {
  if (!allowed.includes(actor.role)) {
    throw new Error(
      `Forbidden: Role "${actor.role}" is not permitted to perform "${actionDescription}". Required: ${allowed.join(' or ')}.`
    );
  }
}

function sanitizeUsers(users: UserProfile[]): UserProfile[] {
  return users.map(({ password_hash, ...rest }) => rest);
}

// Serialize concurrent POST requests to guarantee atomic balance & stock updates
let postMutationQueue: Promise<any> = Promise.resolve();
function enqueueAtomicMutation<T>(fn: () => Promise<T>): Promise<T> {
  const next = postMutationQueue.then(fn, fn);
  postMutationQueue = next.catch(() => {});
  return next;
}

function filterStateForActor(db: ErpDatabaseState, actor: UserProfile): ErpDatabaseState {
  // Always ensure manager cash account balances and booker account balances match their complete transaction ledgers
  for (const u of db.users) {
    if (u.role === 'PRODUCTION_MANAGER') {
      recalculateManagerCashAccountFromLedger(db, u.id);
    }
  }
  for (const b of db.bookers || []) {
    recalculateBookerAccountFromLedger(db, b.id);
  }
  const safeUsers = sanitizeUsers(db.users);
  if (actor.role === 'BOOKER') {
    const assignedDealers = db.dealers.filter((d) => d.assigned_booker_id === actor.id);
    const assignedDealerIds = new Set(assignedDealers.map((d) => d.id));
    return {
      ...db,
      users: safeUsers.filter((u) => u.id === actor.id),
      manager_cash_accounts: [],
      manager_cash_transactions: [],
      raw_materials: [],
      purchases: [],
      material_purchase_receipts: [],
      stock_ledger: [],
      production_batches: [],
      suppliers: [],
      supplier_ledger: [],
      dealers: assignedDealers,
      orders: db.orders.filter((o) => o.booker_id === actor.id),
      sales_returns: [],
      payments: db.payments.filter((p) => p.collected_by_id === actor.id),
      dealer_ledger: db.dealer_ledger.filter((l) => assignedDealerIds.has(l.dealer_id)),
      expenses: [],
      cash_bank_accounts: [],
      financial_transactions: [],
      location_points: db.location_points.filter((lp) => lp.booker_id === actor.id),
      shop_visits: db.shop_visits.filter((sv) => sv.booker_id === actor.id),
      audit_logs: [],
    };
  }

  if (actor.role === 'PRODUCTION_MANAGER') {
    // STRICT MANAGER DATA ISOLATION:
    // Kamran Bhai only sees Kamran Bhai's cash account, cash transactions, purchases, expenses, and own production records.
    // Imran Bhai only sees Imran Bhai's cash account, cash transactions, purchases, expenses, and own production records.
    return {
      ...db,
      users: safeUsers.filter((u) => u.id === actor.id),
      manager_cash_accounts: (db.manager_cash_accounts || []).filter(
        (acc) => acc.manager_id === actor.id
      ),
      manager_cash_transactions: (db.manager_cash_transactions || []).filter(
        (tx) => tx.manager_id === actor.id
      ),
      production_batches: (db.production_batches || []).filter(
        (b) =>
          b.created_by === actor.id ||
          b.submitted_by === actor.id ||
          b.submitted_by_id === actor.id
      ),
      suppliers: actor.can_record_purchases ? db.suppliers : [],
      supplier_ledger: [],
      purchases: (db.purchases || []).filter((p) => p.created_by === actor.id),
      material_purchase_receipts: (db.material_purchase_receipts || []).filter(
        (r) => r.entered_by_id === actor.id
      ),
      dealers: [],
      dealer_ledger: [],
      orders: [],
      sales_returns: [],
      payments: [],
      expenses: (db.expenses || []).filter((e) => e.created_by_id === actor.id),
      cash_bank_accounts: [],
      financial_transactions: [],
      location_points: [],
      shop_visits: [],
      audit_logs: db.audit_logs.filter((a) => a.actor_id === actor.id),
    };
  }

  return {
    ...db,
    users: safeUsers,
  };
}

export async function GET(request: Request) {
  try {
    const db = readErpDatabase();
    const actor = await resolveAuthenticatedSessionUser(request, db);
    if (!actor) {
      return NextResponse.json(
        {
          ok: false,
          authenticated: false,
          dbConnected: true,
          supabaseCloudConfigured: checkIsSupabaseConfigured(),
          error: 'Unauthorized: Valid authenticated session required.',
        },
        { status: 401 }
      );
    }

    const { password_hash, ...safeActor } = actor;
    return NextResponse.json({
      ok: true,
      authenticated: true,
      dbConnected: true,
      supabaseCloudConfigured: checkIsSupabaseConfigured(),
      actor: safeActor,
      state: filterStateForActor(db, actor),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        dbConnected: false,
        error: `Database connection error: ${err?.message || 'Unable to read persistent ERP database.'}`,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return enqueueAtomicMutation(() => handlePostInternal(request));
}

async function handlePostInternal(request: Request) {
  try {
    const body = await request.json();
    const { action, payload } = body as {
      action: string;
      payload: Record<string, any>;
    };

    const currentDb = readErpDatabase();

    // Handle LOGOUT_USER
    if (action === 'LOGOUT_USER') {
      const response = NextResponse.json({ ok: true, authenticated: false });
      response.cookies.set(ERP_SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });
      return response;
    }

    // Handle AUTHENTICATE_USER before session resolution
    if (action === 'AUTHENTICATE_USER') {
      const emailClean = String(payload?.email || '').trim().toLowerCase();
      const passwordInput = String(payload?.password || '');
      if (!emailClean || !passwordInput) {
        return NextResponse.json(
          { ok: false, error: 'Email and password are required.' },
          { status: 400 }
        );
      }

      const foundUser = currentDb.users.find((u) => u.email.toLowerCase() === emailClean);
      if (!foundUser) {
        return NextResponse.json(
          { ok: false, error: 'Invalid email or password.' },
          { status: 401 }
        );
      }
      if (!foundUser.is_active) {
        return NextResponse.json(
          {
            ok: false,
            error: 'This user account has been deactivated by the Owner / Super Admin.',
          },
          { status: 403 }
        );
      }

      // If Supabase Auth is configured, attempt Supabase signInWithPassword using the Publishable/Anon auth client
      // (auto-provisioning core accounts in Supabase Auth via the server-only Secret key if not yet created)
      let supabaseAuthUid: string | null = null;
      let supabaseVerified = false;
      if (checkIsSupabaseConfigured()) {
        const supabaseAuth = getSupabaseAuthClient();
        if (supabaseAuth) {
          let { data, error } = await supabaseAuth.auth.signInWithPassword({
            email: emailClean,
            password: passwordInput,
          });
          if ((error || !data?.user) && checkHasSupabaseAdminSecretKey()) {
            await provisionCoreFactoryAccounts();
            const retry = await supabaseAuth.auth.signInWithPassword({
              email: emailClean,
              password: passwordInput,
            });
            data = retry.data;
            error = retry.error;
          }
          if (!error && data?.user) {
            supabaseVerified = true;
            supabaseAuthUid = data.user.id;
          }
        }
      }

      const localHashVerified = verifyPasswordSecure(passwordInput, foundUser.password_hash);
      if (!supabaseVerified && !localHashVerified) {
        return NextResponse.json(
          { ok: false, error: 'Invalid email or password.' },
          { status: 401 }
        );
      }

      const loggedInUser = withErpTransaction((db) => {
        const u = db.users.find((usr) => usr.id === foundUser.id)!;
        u.last_login_at = new Date().toISOString();
        if (supabaseAuthUid) {
          u.auth_user_id = supabaseAuthUid;
        }
        appendAuditLog(db, {
          actor_id: u.id,
          actor_name: u.full_name,
          actor_role: u.role,
          action: 'USER_LOGIN_SUCCESS',
          entity_type: 'users',
          entity_id: u.id,
          summary: `${u.full_name} (${u.role}) signed in to Fruity Fun Juice Factory ERP.`,
        });
        return u;
      });

      const sessionToken = createSignedSessionToken(loggedInUser);
      const updatedDb = readErpDatabase();
      const { password_hash, ...safeActor } = loggedInUser;

      const response = NextResponse.json({
        ok: true,
        authenticated: true,
        sessionToken,
        actor: safeActor,
        state: filterStateForActor(updatedDb, loggedInUser),
      });
      response.cookies.set(ERP_SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 12 * 60 * 60,
      });
      return response;
    }

    // All other actions strictly require a verified server-side session token.
    // Client-supplied actorId is NEVER trusted.
    const actor = await resolveAuthenticatedSessionUser(request, currentDb);
    if (!actor) {
      return NextResponse.json(
        {
          ok: false,
          authenticated: false,
          error: 'Unauthorized: Valid authenticated session required.',
        },
        { status: 401 }
      );
    }

    switch (action) {
      case 'CREATE_FLAVOUR': {
        assertRole(actor, ['OWNER'], 'Configure Flavours');
        const created = withErpTransaction((db) => {
          const item = {
            id: `flv-${Date.now()}`,
            name: String(payload.name).trim(),
            code: String(payload.code).trim().toUpperCase(),
            color_hex: payload.color_hex || '#F59E0B',
            is_active: true,
            created_at: new Date().toISOString(),
          };
          db.flavours.push(item);
          appendAuditLog(db, {
            actor_id: actor.id,
            actor_name: actor.full_name,
            actor_role: actor.role,
            action: 'FLAVOUR_CREATED',
            entity_type: 'flavours',
            entity_id: item.id,
            summary: `Created juice flavour ${item.name} (${item.code}).`,
          });
          return item;
        });
        return NextResponse.json({ ok: true, data: created, state: readErpDatabase() });
      }

      case 'CREATE_BOTTLE_SIZE': {
        assertRole(actor, ['OWNER'], 'Configure Bottle Sizes');
        const created = withErpTransaction((db) => {
          const item = {
            id: `size-${Date.now()}`,
            label: String(payload.label).trim(),
            volume_ml: Number(payload.volume_ml),
            is_custom: Boolean(payload.is_custom),
            is_active: true,
            created_at: new Date().toISOString(),
          };
          db.bottle_sizes.push(item);
          return item;
        });
        return NextResponse.json({ ok: true, data: created, state: readErpDatabase() });
      }

      case 'CREATE_PRODUCT': {
        assertRole(actor, ['OWNER'], 'Create Product SKU');
        const created = withErpTransaction((db) => {
          const flv = db.flavours.find((f) => f.id === payload.flavour_id);
          const sz = db.bottle_sizes.find((s) => s.id === payload.bottle_size_id);
          const pkg = db.packaging_types.find((p) => p.id === payload.packaging_type_id) || db.packaging_types[0];
          if (!flv || !sz) throw new Error('Invalid flavour or bottle size.');

          const prod = {
            id: `prod-${Date.now()}`,
            sku: `FF-${flv.code}-${sz.volume_ml}`,
            name: payload.name || `Fruity Fun ${flv.name} ${sz.label}`,
            flavour_id: flv.id,
            flavour_name: flv.name,
            bottle_size_id: sz.id,
            bottle_size_label: sz.label,
            packaging_type_id: pkg.id,
            packaging_type_name: pkg.name,
            units_per_carton: Number(payload.units_per_carton || pkg.units_per_carton),
            wholesale_price_per_carton: Number(payload.wholesale_price_per_carton),
            retail_price_per_unit: Number(payload.retail_price_per_unit || 70),
            standard_cost_per_carton: Number(payload.standard_cost_per_carton || 850),
            min_stock_cartons: Number(payload.min_stock_cartons || 60),
            is_active: true,
            created_at: new Date().toISOString(),
          };
          db.products.push(prod);
          db.finished_goods.push({
            id: `fg-${prod.id}`,
            product_id: prod.id,
            product_name: prod.name,
            sku: prod.sku,
            flavour_name: prod.flavour_name,
            bottle_size_label: prod.bottle_size_label,
            packaging_type_name: prod.packaging_type_name,
            units_per_carton: prod.units_per_carton,
            opening_stock_cartons: Number(payload.opening_stock_cartons || 0),
            verified_production_cartons: 0,
            approved_returns_cartons: 0,
            dispatched_cartons: 0,
            damaged_cartons: 0,
            reserved_cartons: 0,
            closing_stock_cartons: Number(payload.opening_stock_cartons || 0),
            available_cartons: Number(payload.opening_stock_cartons || 0),
            latest_batch_number: 'OPENING',
            latest_production_date: new Date().toISOString().split('T')[0],
            valuation_per_carton: prod.standard_cost_per_carton,
            updated_at: new Date().toISOString(),
          });
          return prod;
        });
        return NextResponse.json({ ok: true, data: created, state: readErpDatabase() });
      }

      case 'CREATE_PRODUCTION_BATCH': {
        assertRole(actor, ['OWNER', 'PRODUCTION_MANAGER'], 'Create Production Batch');
        const createdBatch = withErpTransaction((db) => {
          const product = db.products.find((p) => p.id === payload.product_id);
          const machine = db.machines.find((m) => m.id === payload.machine_id) || db.machines[0];
          if (!product) throw new Error('Selected product not found.');

          const newBatch = {
            id: `batch-${Date.now()}`,
            batch_number: payload.batch_number || `BATCH-${Date.now().toString().slice(-6)}`,
            production_date: payload.production_date || new Date().toISOString().split('T')[0],
            product_id: product.id,
            product_name: product.name,
            flavour_name: product.flavour_name,
            bottle_size_label: product.bottle_size_label,
            packaging_type_name: product.packaging_type_name,
            units_per_carton: product.units_per_carton,
            target_cartons: Number(payload.target_cartons),
            actual_cartons: Number(payload.actual_cartons || 0),
            wastage_cartons: Number(payload.wastage_cartons || 0),
            damaged_units: Number(payload.damaged_units || 0),
            machine_id: machine.id,
            machine_name: machine.name,
            status: (payload.status || 'Planned') as any,
            inventory_posted: false,
            material_usage: [],
            total_production_cost: Number(payload.actual_cartons || payload.target_cartons) * product.standard_cost_per_carton,
            cost_per_carton: product.standard_cost_per_carton,
            remarks: payload.remarks || '',
            created_by: actor.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          db.production_batches.unshift(newBatch);
          return newBatch;
        });

        if (payload.status === 'Completed') {
          verifyAndCompleteBatch({
            batch_id: createdBatch.id,
            actual_cartons: createdBatch.actual_cartons,
            wastage_cartons: createdBatch.wastage_cartons,
            status: 'Completed',
            actor,
          });
        }

        return NextResponse.json({ ok: true, data: createdBatch, state: readErpDatabase() });
      }

      case 'UPDATE_PRODUCTION_BATCH_STATUS': {
        assertRole(actor, ['OWNER', 'PRODUCTION_MANAGER'], 'Update Production Batch');
        const updated = verifyAndCompleteBatch({
          batch_id: payload.batch_id,
          actual_cartons: payload.actual_cartons,
          wastage_cartons: payload.wastage_cartons,
          status: payload.status,
          actor,
        });
        return NextResponse.json({ ok: true, data: updated, state: readErpDatabase() });
      }

      case 'CREATE_RAW_MATERIAL': {
        assertRole(actor, ['OWNER', 'PRODUCTION_MANAGER'], 'Add Raw Material');
        const rm = withErpTransaction((db) => {
          const initialStock = Number(payload.current_stock || 0);
          const item = {
            id: `rm-${Date.now()}`,
            code: payload.code || `RM-${Date.now().toString().slice(-4)}`,
            name: payload.name,
            category: payload.category,
            unit: payload.unit,
            opening_stock: initialStock,
            stock_received: 0,
            stock_consumed: 0,
            stock_adjusted: 0,
            current_stock: initialStock,
            minimum_stock_level: Number(payload.minimum_stock_level || 50),
            average_cost_per_unit: Number(payload.average_cost_per_unit || 0),
            last_purchase_price: Number(payload.average_cost_per_unit || 0),
            damaged_quantity: 0,
            supplier_id: payload.supplier_id || null,
            updated_at: new Date().toISOString(),
          };
          db.raw_materials.push(item);
          return item;
        });
        return NextResponse.json({ ok: true, data: rm, state: readErpDatabase() });
      }

      case 'RECORD_RAW_MATERIAL_PURCHASE': {
        if (actor.role !== 'OWNER' && !(actor.role === 'PRODUCTION_MANAGER' && actor.can_record_purchases)) {
          throw new Error(
            'Forbidden: Production Manager cannot record supplier purchases unless Admin explicitly grants permission.'
          );
        }
        const purchase = withErpTransaction((db) => {
          const rm = db.raw_materials.find((r) => r.id === payload.raw_material_id);
          if (!rm) throw new Error('Raw material not found.');
          const supplier =
            db.suppliers.find((s) => s.id === payload.supplier_id) || db.suppliers[0];

          const qty = Number(payload.quantity);
          const unitPrice = Number(payload.unit_price);
          const totalCost = Math.round(qty * unitPrice);
          const paid = Number(payload.amount_paid ?? totalCost);

          // Weighted average cost calculation
          const existingValue = rm.current_stock * rm.average_cost_per_unit;
          const newStock = Number((rm.current_stock + qty).toFixed(3));
          rm.average_cost_per_unit =
            newStock > 0
              ? Number(((existingValue + totalCost) / newStock).toFixed(2))
              : unitPrice;
          rm.last_purchase_price = unitPrice;
          rm.current_stock = newStock;
          rm.updated_at = new Date().toISOString();

          if (totalCost > paid) {
            supplier.payable_balance += totalCost - paid;
          }

          const po = {
            id: `pur-${Date.now()}`,
            purchase_number: `PO-2026-${db.purchases.length + 103}`,
            supplier_id: supplier.id,
            supplier_name: supplier.name,
            purchase_date: payload.purchase_date || new Date().toISOString().split('T')[0],
            total_amount: totalCost,
            amount_paid: paid,
            payment_status: (paid >= totalCost ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID') as any,
            notes: payload.notes || '',
            created_by: actor.id,
            created_at: new Date().toISOString(),
            items: [
              {
                id: `pi-${Date.now()}`,
                purchase_id: '',
                raw_material_id: rm.id,
                raw_material_name: rm.name,
                quantity: qty,
                unit: rm.unit,
                unit_price: unitPrice,
                total_cost: totalCost,
              },
            ],
          };
          po.items[0].purchase_id = po.id;
          db.purchases.unshift(po);

          db.inventory_movements.unshift({
            id: `mov-po-${Date.now()}`,
            item_type: 'RAW_MATERIAL',
            item_id: rm.id,
            item_name: rm.name,
            movement_type: 'RAW_MATERIAL_PURCHASE',
            quantity_change: qty,
            balance_after: rm.current_stock,
            reference_type: 'PURCHASE',
            reference_id: po.purchase_number,
            notes: `Purchased from ${supplier.name} @ PKR ${unitPrice}/${rm.unit}`,
            performed_by: actor.full_name,
            created_at: new Date().toISOString(),
          });

          appendAuditLog(db, {
            actor_id: actor.id,
            actor_name: actor.full_name,
            actor_role: actor.role,
            action: 'RAW_MATERIAL_PURCHASED',
            entity_type: 'purchases',
            entity_id: po.id,
            summary: `Recorded purchase ${po.purchase_number}: +${qty} ${rm.unit} of ${rm.name} (PKR ${totalCost.toLocaleString()}).`,
          });

          return po;
        });
        return NextResponse.json({ ok: true, data: purchase, state: readErpDatabase() });
      }

      case 'ADJUST_RAW_MATERIAL_STOCK': {
        assertRole(actor, ['OWNER', 'PRODUCTION_MANAGER'], 'Adjust Raw Material Stock');
        const rm = withErpTransaction((db) => {
          const item = db.raw_materials.find((r) => r.id === payload.raw_material_id);
          if (!item) throw new Error('Raw material not found.');
          const delta = Number(payload.quantity_change);
          if (item.current_stock + delta < 0) {
            throw new Error('Adjustment rejected: Raw material stock cannot become negative.');
          }
          item.current_stock = Number((item.current_stock + delta).toFixed(3));
          if (payload.is_damage && delta < 0) {
            item.damaged_quantity = Number((item.damaged_quantity + Math.abs(delta)).toFixed(3));
          }
          item.updated_at = new Date().toISOString();

          db.inventory_movements.unshift({
            id: `mov-adj-${Date.now()}`,
            item_type: 'RAW_MATERIAL',
            item_id: item.id,
            item_name: item.name,
            movement_type: payload.is_damage ? 'RAW_MATERIAL_DAMAGED' : 'RAW_MATERIAL_ADJUSTMENT',
            quantity_change: delta,
            balance_after: item.current_stock,
            reference_type: 'ADJUSTMENT',
            reference_id: `ADJ-${Date.now().toString().slice(-5)}`,
            notes: payload.reason || 'Authorized stock adjustment',
            performed_by: actor.full_name,
            created_at: new Date().toISOString(),
          });
          return item;
        });
        return NextResponse.json({ ok: true, data: rm, state: readErpDatabase() });
      }

      case 'ADJUST_FINISHED_GOODS': {
        assertRole(actor, ['OWNER', 'PRODUCTION_MANAGER'], 'Adjust Finished Goods');
        const fg = withErpTransaction((db) => {
          const row = db.finished_goods.find((f) => f.product_id === payload.product_id);
          if (!row) throw new Error('Finished goods item not found.');
          const qty = Number(payload.quantity_cartons);
          if (qty <= 0) throw new Error('Quantity must be > 0.');

          if (payload.adjustment_type === 'APPROVED_RETURN') {
            row.approved_returns_cartons += qty;
          } else if (payload.adjustment_type === 'DAMAGE_WRITE_OFF') {
            if (row.available_cartons < qty) {
              throw new Error('Cannot write off more cartons than currently available.');
            }
            row.damaged_cartons += qty;
          } else if (payload.adjustment_type === 'OPENING_ADDITION') {
            row.opening_stock_cartons += qty;
          }
          recalculateFinishedGoodsRow(row);

          db.inventory_movements.unshift({
            id: `mov-fgadj-${Date.now()}`,
            item_type: 'FINISHED_GOOD',
            item_id: row.product_id,
            item_name: row.product_name,
            movement_type:
              payload.adjustment_type === 'APPROVED_RETURN'
                ? 'CUSTOMER_RETURN_APPROVED'
                : payload.adjustment_type === 'DAMAGE_WRITE_OFF'
                ? 'DAMAGE_WRITE_OFF'
                : 'AUTHORIZED_ADJUSTMENT',
            quantity_change: payload.adjustment_type === 'DAMAGE_WRITE_OFF' ? -qty : qty,
            balance_after: row.closing_stock_cartons,
            reference_type: 'ADJUSTMENT',
            reference_id: `FG-ADJ-${Date.now().toString().slice(-5)}`,
            notes: payload.notes || payload.adjustment_type,
            performed_by: actor.full_name,
            created_at: new Date().toISOString(),
          });

          return row;
        });
        return NextResponse.json({ ok: true, data: fg, state: readErpDatabase() });
      }

      case 'CREATE_DEALER': {
        assertRole(actor, ['OWNER', 'BOOKER'], 'Register Dealer / Shop');
        const dealer = withErpTransaction((db) => {
          const area = db.dealer_areas.find((a) => a.id === payload.area_id) || db.dealer_areas[0];
          const booker =
            db.users.find((u) => u.id === payload.assigned_booker_id) ||
            db.users.find((u) => u.role === 'BOOKER')!;
          const openingBal = Number(payload.opening_balance || 0);

          const newDealer = {
            id: `dlr-${Date.now()}`,
            code: `DLR-00${db.dealers.length + 1}`,
            dealer_name: payload.dealer_name,
            shop_name: payload.shop_name,
            contact_number: payload.contact_number,
            address: payload.address,
            area_id: area.id,
            area_name: area.name,
            assigned_booker_id: booker.id,
            assigned_booker_name: booker.full_name,
            opening_balance: openingBal,
            credit_limit: Number(payload.credit_limit || 300000),
            outstanding_balance: openingBal,
            latitude: Number(payload.latitude || 31.515),
            longitude: Number(payload.longitude || 74.342),
            geofence_radius_meters: Number(payload.geofence_radius_meters || 100),
            is_active: true,
            created_at: new Date().toISOString(),
          };
          db.dealers.push(newDealer);
          area.shop_count += 1;

          if (openingBal !== 0) {
            db.dealer_ledger.push({
              id: `ldg-ob-${Date.now()}`,
              dealer_id: newDealer.id,
              dealer_name: newDealer.dealer_name,
              shop_name: newDealer.shop_name,
              date: new Date().toISOString().split('T')[0],
              description: 'Opening Balance at Dealer Registration',
              entry_type: 'OPENING_BALANCE',
              debit: openingBal > 0 ? openingBal : 0,
              credit: openingBal < 0 ? Math.abs(openingBal) : 0,
              balance: openingBal,
              reference_number: `OB-${newDealer.code}`,
              payment_method: 'Credit',
              created_by: actor.id,
              created_at: new Date().toISOString(),
            });
          }

          appendAuditLog(db, {
            actor_id: actor.id,
            actor_name: actor.full_name,
            actor_role: actor.role,
            action: 'DEALER_REGISTERED',
            entity_type: 'dealers',
            entity_id: newDealer.id,
            summary: `Registered dealer ${newDealer.dealer_name} (${newDealer.shop_name}) in ${newDealer.area_name}.`,
          });

          return newDealer;
        });
        return NextResponse.json({ ok: true, data: dealer, state: readErpDatabase() });
      }

      case 'CREATE_ORDER': {
        assertRole(actor, ['OWNER', 'BOOKER'], 'Create Sales Order');
        const createdOrder = withErpTransaction((db) => {
          const idempKey = payload.idempotency_key || `ord-key-${Date.now()}`;
          const existing = db.orders.find((o) => o.idempotency_key === idempKey);
          if (existing) {
            throw new Error(`Duplicate order submission prevented (Order ${existing.order_number} already exists).`);
          }

          const dealer = db.dealers.find((d) => d.id === payload.dealer_id);
          if (!dealer) throw new Error('Selected dealer/shop not found.');

          // Booker restriction check
          if (actor.role === 'BOOKER' && dealer.assigned_booker_id !== actor.id) {
            throw new Error('Forbidden: Bookers can only place orders for their assigned dealers/shops.');
          }

          const product = db.products.find((p) => p.id === payload.product_id);
          if (!product) throw new Error('Selected product not found.');

          const qty = Number(payload.quantity_cartons);
          const rate = Number(payload.rate_per_carton || product.wholesale_price_per_carton);
          const discount = Number(payload.discount_amount || 0);
          const subtotal = qty * rate;
          const total = Math.max(0, subtotal - discount);
          const paidOnOrder = Number(payload.amount_paid_on_order || 0);

          // Credit limit enforcement on credit/partial orders (unless Owner explicitly overrides)
          const unpaidPortion = Math.max(0, total - paidOnOrder);
          if (
            unpaidPortion > 0 &&
            dealer.outstanding_balance + unpaidPortion > dealer.credit_limit &&
            !payload.owner_credit_override
          ) {
            throw new Error(
              `Credit Limit Exceeded for ${dealer.shop_name}: Current balance PKR ${dealer.outstanding_balance.toLocaleString()} + new credit PKR ${unpaidPortion.toLocaleString()} exceeds credit limit PKR ${dealer.credit_limit.toLocaleString()}.`
            );
          }
          const fgItem = db.finished_goods.find((f) => f.product_id === product.id);
          const cogsPerCarton =
            fgItem && fgItem.valuation_per_carton > 0
              ? fgItem.valuation_per_carton
              : product.standard_cost_per_carton;
          const totalCogs = Math.round(qty * cogsPerCarton);

          const bookerUser =
            db.users.find((u) => u.id === (payload.booker_id || dealer.assigned_booker_id)) ||
            actor;

          const newOrder = {
            id: `ord-${Date.now()}`,
            order_number: `ORD-2026-0${db.orders.length + 501}`,
            idempotency_key: idempKey,
            dealer_id: dealer.id,
            dealer_name: dealer.dealer_name,
            shop_name: dealer.shop_name,
            area_id: dealer.area_id,
            area_name: dealer.area_name,
            booker_id: bookerUser.id,
            booker_name: bookerUser.full_name,
            order_date: payload.order_date || new Date().toISOString().split('T')[0],
            status: 'Pending' as const,
            payment_status: (paidOnOrder >= total
              ? 'Paid'
              : paidOnOrder > 0
              ? 'Partially Paid'
              : payload.payment_status || 'Unpaid (Credit)') as any,
            subtotal_amount: subtotal,
            discount_total: discount,
            total_amount: total,
            amount_paid_on_order: paidOnOrder,
            total_cogs: totalCogs,
            delivery_notes: payload.delivery_notes || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            items: [
              {
                id: `oi-${Date.now()}`,
                product_id: product.id,
                product_name: product.name,
                flavour_name: product.flavour_name,
                bottle_size_label: product.bottle_size_label,
                quantity_cartons: qty,
                rate_per_carton: rate,
                discount_amount: discount,
                cogs_per_carton_snapshot: cogsPerCarton,
                line_total: total,
              },
            ],
          };

          db.orders.unshift(newOrder);

          db.notifications.unshift({
            id: `notif-ord-${Date.now()}`,
            type: 'NEW_ORDER',
            title: `New Order Received: ${newOrder.order_number} (PKR ${total.toLocaleString()})`,
            message: `${bookerUser.full_name} booked ${qty} cartons of ${product.name} for ${dealer.shop_name}.`,
            severity: 'info',
            target_roles: ['OWNER'],
            is_read: false,
            link_href: '/orders',
            created_at: new Date().toISOString(),
          });

          appendAuditLog(db, {
            actor_id: actor.id,
            actor_name: actor.full_name,
            actor_role: actor.role,
            action: 'ORDER_CREATED',
            entity_type: 'orders',
            entity_id: newOrder.id,
            summary: `Created order ${newOrder.order_number} for ${dealer.shop_name}: ${qty} cartons ${product.name} (PKR ${total.toLocaleString()}).`,
          });

          return newOrder;
        });

        // If requested to immediately dispatch (e.g. from confirmed Owner Voice Transaction)
        if (payload.auto_dispatch && actor.role === 'OWNER') {
          transitionOrderStatus({
            order_id: createdOrder.id,
            next_status: 'Dispatched',
            actor,
          });
        }

        return NextResponse.json({ ok: true, data: createdOrder, state: readErpDatabase() });
      }

      case 'TRANSITION_ORDER_STATUS': {
        assertRole(actor, ['OWNER', 'PRODUCTION_MANAGER'], 'Transition Order Status');
        const updated = transitionOrderStatus({
          order_id: payload.order_id,
          next_status: payload.next_status,
          actor,
        });
        return NextResponse.json({ ok: true, data: updated, state: readErpDatabase() });
      }

      case 'RECORD_PAYMENT': {
        assertRole(actor, ['OWNER', 'BOOKER'], 'Record Dealer Payment');
        const payment = withErpTransaction((db) => {
          const dealer = db.dealers.find((d) => d.id === payload.dealer_id);
          if (!dealer) throw new Error('Dealer not found.');

          if (actor.role === 'BOOKER' && dealer.assigned_booker_id !== actor.id) {
            throw new Error(
              'Forbidden: Bookers can only record collections for their assigned dealers/shops.'
            );
          }
          if (actor.role === 'BOOKER' && payload.direction === 'OUTGOING_TO_PERSON') {
            throw new Error(
              'Forbidden: Only the Owner can disburse outgoing payments to dealers/parties.'
            );
          }

          const amount = Number(payload.amount);
          if (amount <= 0) throw new Error('Amount must be greater than zero.');

          const direction = payload.direction || 'INCOMING_FROM_DEALER';
          const receiptNo = `RCPT-2026-00${db.payments.length + 1}`;
          const dateStr = payload.payment_date || new Date().toISOString().split('T')[0];

          // INCOMING_FROM_DEALER = Credit dealer ledger (reduces what dealer owes)
          // OUTGOING_TO_PERSON = Debit dealer ledger (e.g., "Ahmed ko 50 hazar rupay diye")
          const debit = direction === 'OUTGOING_TO_PERSON' ? amount : 0;
          const credit = direction === 'INCOMING_FROM_DEALER' ? amount : 0;
          dealer.outstanding_balance = dealer.outstanding_balance + debit - credit;

          const ledgerEntry = {
            id: `ldg-pay-${Date.now()}`,
            dealer_id: dealer.id,
            dealer_name: dealer.dealer_name,
            shop_name: dealer.shop_name,
            date: dateStr,
            description:
              payload.description ||
              (direction === 'INCOMING_FROM_DEALER'
                ? `Payment Received (${payload.payment_method || 'Cash'}) — Ref: ${
                    payload.reference_number || receiptNo
                  }`
                : `Payment Disbursed to ${dealer.dealer_name} (${
                    payload.payment_method || 'Cash'
                  })`),
            entry_type: (direction === 'INCOMING_FROM_DEALER'
              ? 'PAYMENT_RECEIVED'
              : 'PAYMENT_GIVEN') as any,
            debit,
            credit,
            balance: dealer.outstanding_balance,
            reference_number: payload.reference_number || receiptNo,
            payment_method: payload.payment_method || 'Cash',
            created_by: actor.id,
            created_at: new Date().toISOString(),
          };
          db.dealer_ledger.push(ledgerEntry);

          const rec = {
            id: `pay-${Date.now()}`,
            receipt_number: receiptNo,
            dealer_id: dealer.id,
            dealer_name: dealer.dealer_name,
            shop_name: dealer.shop_name,
            collected_by_id: actor.id,
            collected_by_name: actor.full_name,
            payment_date: dateStr,
            amount,
            direction,
            payment_method: payload.payment_method || 'Cash',
            reference_number: payload.reference_number || receiptNo,
            ledger_entry_id: ledgerEntry.id,
            is_reversed: false,
            notes: payload.notes || '',
            created_at: new Date().toISOString(),
          };
          db.payments.unshift(rec);

          // Post Cash or Bank transaction so Cash & Bank accounts stay 100% synchronized
          const payMethod = (payload.payment_method || 'Cash') as any;
          postFinancialTransaction(db, {
            transaction_date: dateStr,
            reference_number: rec.reference_number,
            transaction_type:
              direction === 'INCOMING_FROM_DEALER' ? 'DEALER_PAYMENT_RECEIPT' : 'EXPENSE_PAYMENT',
            payment_method: payMethod,
            direction: direction === 'INCOMING_FROM_DEALER' ? 'INFLOW' : 'OUTFLOW',
            amount,
            related_party_type: 'DEALER',
            related_party_id: dealer.id,
            related_party_name: `${dealer.shop_name} (${dealer.dealer_name})`,
            entered_by_id: actor.id,
            entered_by_name: actor.full_name,
            remarks:
              payload.notes ||
              (direction === 'INCOMING_FROM_DEALER'
                ? `Dealer payment received from ${dealer.shop_name} (${rec.receipt_number})`
                : `Outgoing payment to ${dealer.shop_name}`),
          });

          appendAuditLog(db, {
            actor_id: actor.id,
            actor_name: actor.full_name,
            actor_role: actor.role,
            action: 'PAYMENT_RECORDED',
            entity_type: 'payments',
            entity_id: rec.id,
            summary: `Recorded ${direction} of PKR ${amount.toLocaleString()} for ${dealer.shop_name} (${rec.receipt_number}).`,
          });

          return rec;
        });
        return NextResponse.json({
          ok: true,
          data: payment,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'RECORD_DEALER_RECEIVABLE_ADJUSTMENT': {
        assertRole(actor, ['OWNER'], 'Record Receivable Debit Entry');
        const entry = withErpTransaction((db) => {
          const dealer = db.dealers.find((d) => d.id === payload.dealer_id);
          if (!dealer) throw new Error('Dealer not found.');
          const amount = Number(payload.amount);
          if (amount <= 0) throw new Error('Amount must be > 0.');

          dealer.outstanding_balance += amount;
          const ldg = {
            id: `ldg-adj-${Date.now()}`,
            dealer_id: dealer.id,
            dealer_name: dealer.dealer_name,
            shop_name: dealer.shop_name,
            date: new Date().toISOString().split('T')[0],
            description: payload.description || `Receivable Recorded (${dealer.dealer_name})`,
            entry_type: 'CORRECTION_ADJUSTMENT' as const,
            debit: amount,
            credit: 0,
            balance: dealer.outstanding_balance,
            reference_number: `RCV-${Date.now().toString().slice(-5)}`,
            payment_method: 'Credit' as const,
            created_by: actor.id,
            created_at: new Date().toISOString(),
          };
          db.dealer_ledger.push(ldg);

          appendAuditLog(db, {
            actor_id: actor.id,
            actor_name: actor.full_name,
            actor_role: actor.role,
            action: 'RECEIVABLE_DEBIT_POSTED',
            entity_type: 'dealer_ledger',
            entity_id: ldg.id,
            summary: `Posted receivable debit of PKR ${amount.toLocaleString()} to ${dealer.shop_name}.`,
          });

          return ldg;
        });
        return NextResponse.json({ ok: true, data: entry, state: readErpDatabase() });
      }

      case 'REVERSE_LEDGER_ENTRY': {
        assertRole(actor, ['OWNER'], 'Reverse Financial Ledger Entry');
        const rev = reverseDealerLedgerEntry({
          ledger_entry_id: payload.ledger_entry_id || payload.entry_id,
          reason: payload.reason || 'Authorized Owner Correction',
          actor,
        });
        return NextResponse.json({
          ok: true,
          data: rev,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'CREATE_EXPENSE': {
        assertRole(actor, ['OWNER', 'PRODUCTION_MANAGER'], 'Create Expense');
        const exp = withErpTransaction((db) => {
          const isOwner = actor.role === 'OWNER';
          const item = {
            id: `exp-${Date.now()}`,
            expense_number: `EXP-2026-00${db.expenses.length + 1}`,
            category: payload.category,
            amount: Number(payload.amount),
            date: payload.date || new Date().toISOString().split('T')[0],
            description: payload.description,
            payment_method: payload.payment_method || 'Cash',
            receipt_attachment_url: payload.receipt_attachment_url || '/receipts/uploaded-voucher.pdf',
            created_by_id: actor.id,
            created_by_name: actor.full_name,
            approval_status: (isOwner ? 'Approved' : 'Pending') as any,
            approved_by: isOwner ? actor.id : null,
            approved_at: isOwner ? new Date().toISOString() : null,
            created_at: new Date().toISOString(),
          };
          db.expenses.unshift(item);

          if (isOwner) {
            postFinancialTransaction(db, {
              transaction_date: item.date,
              reference_number: item.expense_number,
              transaction_type: 'EXPENSE_PAYMENT',
              payment_method: (item.payment_method === 'Company Card' ? 'Bank Transfer' : item.payment_method) as any,
              direction: 'OUTFLOW',
              amount: item.amount,
              related_party_type: 'EXPENSE',
              related_party_id: item.id,
              related_party_name: item.category,
              entered_by_id: actor.id,
              entered_by_name: actor.full_name,
              remarks: `${item.category}: ${item.description}`,
            });
          } else {
            db.notifications.unshift({
              id: `notif-exp-${Date.now()}`,
              type: 'EXPENSE_APPROVAL_REQUEST',
              title: `Expense Approval Needed: PKR ${item.amount.toLocaleString()}`,
              message: `${actor.full_name} submitted ${item.category} expense (${item.description}).`,
              severity: 'info',
              target_roles: ['OWNER'],
              is_read: false,
              link_href: '/expenses',
              created_at: new Date().toISOString(),
            });
          }

          appendAuditLog(db, {
            actor_id: actor.id,
            actor_name: actor.full_name,
            actor_role: actor.role,
            action: 'EXPENSE_RECORDED',
            entity_type: 'expenses',
            entity_id: item.id,
            summary: `Recorded ${item.category} expense ${item.expense_number} of PKR ${item.amount.toLocaleString()} (${item.approval_status}).`,
          });

          return item;
        });
        return NextResponse.json({
          ok: true,
          data: exp,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'APPROVE_OR_REJECT_EXPENSE': {
        assertRole(actor, ['OWNER'], 'Approve or Reject Expense');
        const updated = withErpTransaction((db) => {
          const exp = db.expenses.find((e) => e.id === payload.expense_id);
          if (!exp) throw new Error('Expense not found.');
          const prevStatus = exp.approval_status;
          const nextDecision = payload.approval_status || payload.decision || 'Approved';
          exp.approval_status = nextDecision;
          exp.approved_by = actor.id;
          exp.approved_at = new Date().toISOString();

          if (prevStatus !== 'Approved' && nextDecision === 'Approved') {
            postFinancialTransaction(db, {
              transaction_date: exp.date,
              reference_number: exp.expense_number,
              transaction_type: 'EXPENSE_PAYMENT',
              payment_method: (exp.payment_method === 'Company Card' ? 'Bank Transfer' : exp.payment_method) as any,
              direction: 'OUTFLOW',
              amount: exp.amount,
              related_party_type: 'EXPENSE',
              related_party_id: exp.id,
              related_party_name: exp.category,
              entered_by_id: actor.id,
              entered_by_name: actor.full_name,
              remarks: `Approved Expense ${exp.expense_number} (${exp.category}): ${exp.description}`,
            });
          }

          appendAuditLog(db, {
            actor_id: actor.id,
            actor_name: actor.full_name,
            actor_role: actor.role,
            action: `EXPENSE_${String(nextDecision).toUpperCase()}`,
            entity_type: 'expenses',
            entity_id: exp.id,
            summary: `${nextDecision} expense ${exp.expense_number} (PKR ${exp.amount.toLocaleString()}).`,
          });
          return exp;
        });
        return NextResponse.json({
          ok: true,
          data: updated,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'REPORT_MACHINE_ISSUE': {
        assertRole(actor, ['OWNER', 'PRODUCTION_MANAGER'], 'Report Machine Maintenance Issue');
        const ticket = withErpTransaction((db) => {
          const machine = db.machines.find((m) => m.id === payload.machine_id);
          if (!machine) throw new Error('Machine not found.');

          machine.status = payload.priority === 'Critical' ? 'Breakdown' : 'Under Maintenance';

          const rec = {
            id: `maint-${Date.now()}`,
            ticket_number: `MNT-2026-00${db.maintenance_records.length + 1}`,
            machine_id: machine.id,
            machine_name: machine.name,
            machine_number: machine.machine_number,
            problem_description: payload.problem_description,
            issue_date: payload.issue_date || new Date().toISOString().split('T')[0],
            priority: payload.priority || 'High',
            status: 'Reported' as const,
            repair_notes: payload.repair_notes || '',
            maintenance_cost: Number(payload.maintenance_cost || 0),
            reported_by_id: actor.id,
            reported_by_name: actor.full_name,
            created_at: new Date().toISOString(),
          };
          db.maintenance_records.unshift(rec);

          db.notifications.unshift({
            id: `notif-mach-${Date.now()}`,
            type: 'MACHINE_ISSUE',
            title: `Machine Issue Reported [${rec.priority}]: ${machine.machine_number}`,
            message: `${machine.name}: ${rec.problem_description}`,
            severity: rec.priority === 'Critical' || rec.priority === 'High' ? 'critical' : 'warning',
            target_roles: ['OWNER', 'PRODUCTION_MANAGER'],
            is_read: false,
            link_href: '/machines',
            created_at: new Date().toISOString(),
          });

          appendAuditLog(db, {
            actor_id: actor.id,
            actor_name: actor.full_name,
            actor_role: actor.role,
            action: 'MACHINE_ISSUE_REPORTED',
            entity_type: 'maintenance_records',
            entity_id: rec.id,
            summary: `Reported ${rec.priority} issue on ${machine.name} (${rec.ticket_number}).`,
          });

          return rec;
        });
        return NextResponse.json({ ok: true, data: ticket, state: readErpDatabase() });
      }

      case 'RESOLVE_MACHINE_ISSUE': {
        assertRole(actor, ['OWNER', 'PRODUCTION_MANAGER'], 'Resolve Machine Issue');
        const resolved = withErpTransaction((db) => {
          const rec = db.maintenance_records.find((r) => r.id === payload.ticket_id);
          if (!rec) throw new Error('Maintenance ticket not found.');
          rec.status = 'Resolved';
          rec.resolved_at = new Date().toISOString();
          if (payload.repair_notes) rec.repair_notes = payload.repair_notes;
          if (typeof payload.maintenance_cost === 'number') {
            rec.maintenance_cost = payload.maintenance_cost;
          }

          const machine = db.machines.find((m) => m.id === rec.machine_id);
          if (machine) {
            machine.status = 'Operational';
            machine.last_serviced_date = new Date().toISOString().split('T')[0];
          }
          return rec;
        });
        return NextResponse.json({ ok: true, data: resolved, state: readErpDatabase() });
      }

      case 'RECORD_GPS_PING': {
        assertRole(actor, ['OWNER', 'BOOKER'], 'Record Booker GPS Ping');
        const result = withErpTransaction((db) => {
          const requestedBookerId =
            actor.role === 'BOOKER' ? actor.id : payload.booker_id || actor.id;
          const booker =
            db.users.find((u) => u.id === requestedBookerId) || actor;
          const lat = Number(payload.latitude);
          const lng = Number(payload.longitude);
          const accuracy = Number(payload.accuracy_meters || 6.5);

          const pt = {
            id: `loc-${Date.now()}`,
            booker_id: booker.id,
            booker_name: booker.full_name,
            latitude: lat,
            longitude: lng,
            accuracy_meters: accuracy,
            speed_kmh: Number(payload.speed_kmh ?? 15.2),
            battery_pct: Number(payload.battery_pct ?? 84),
            is_moving: Boolean(payload.is_moving ?? true),
            is_mock_location: false,
            recorded_at: new Date().toISOString(),
            synced_from_offline_queue: Boolean(payload.synced_from_offline_queue),
          };
          db.location_points.push(pt);

          // Automatic Geofencing Shop Visit Detection
          const assignedShops = db.dealers.filter((d) => d.assigned_booker_id === booker.id);
          let detectedVisit = null;
          const today = new Date().toISOString().split('T')[0];

          for (const shop of assignedShops) {
            const distMeters =
              haversineDistanceKm(lat, lng, shop.latitude, shop.longitude) * 1000;
            if (distMeters <= shop.geofence_radius_meters) {
              // Avoid duplicate visit events on the same day within the last 60 minutes
              const existingRecent = db.shop_visits.find(
                (v) =>
                  v.booker_id === booker.id &&
                  v.dealer_id === shop.id &&
                  v.visit_date === today &&
                  Date.now() - new Date(v.arrival_time).getTime() < 60 * 60 * 1000
              );

              if (!existingRecent) {
                detectedVisit = {
                  id: `vis-${Date.now()}`,
                  booker_id: booker.id,
                  booker_name: booker.full_name,
                  dealer_id: shop.id,
                  shop_name: shop.shop_name,
                  area_name: shop.area_name,
                  visit_date: today,
                  arrival_time: new Date().toISOString(),
                  departure_time: null,
                  duration_minutes: Number(payload.duration_minutes || 20),
                  gps_accuracy_meters: accuracy,
                  verification_type: (payload.manual_check_in
                    ? 'BOTH_VERIFIED'
                    : 'GPS_GEOFENCE_DETECTED') as any,
                  order_placed: false,
                  collection_made: false,
                  collection_amount: 0,
                  latitude: lat,
                  longitude: lng,
                  notes: payload.manual_check_in
                    ? `Manual check-in verified inside ${Math.round(distMeters)}m geofence`
                    : `Auto-detected inside ${shop.geofence_radius_meters}m shop geofence (${Math.round(
                        distMeters
                      )}m distance)`,
                };
                db.shop_visits.unshift(detectedVisit);
              } else if (payload.manual_check_in) {
                existingRecent.verification_type = 'BOTH_VERIFIED';
                detectedVisit = existingRecent;
              }
            }
          }

          return { point: pt, detectedVisit };
        });
        return NextResponse.json({ ok: true, data: result, state: readErpDatabase() });
      }

      case 'SYNC_OFFLINE_GPS_BATCH': {
        assertRole(actor, ['OWNER', 'BOOKER'], 'Synchronize Offline GPS Batch');
        const pointsInput = Array.isArray(payload.points) ? payload.points : [];
        if (pointsInput.length === 0) {
          throw new Error('Offline GPS sync batch cannot be empty.');
        }

        const syncSummary = withErpTransaction((db) => {
          const requestedBookerId =
            actor.role === 'BOOKER' ? actor.id : payload.booker_id || actor.id;
          const booker =
            db.users.find((u) => u.id === requestedBookerId) || actor;
          const assignedShops = db.dealers.filter(
            (d) => d.assigned_booker_id === booker.id
          );
          const today = new Date().toISOString().split('T')[0];

          let syncedPointsCount = 0;
          let detectedVisitsCount = 0;

          for (const rawPt of pointsInput) {
            const lat = Number(rawPt.latitude);
            const lng = Number(rawPt.longitude);
            const accuracy = Number(rawPt.accuracy_meters || 7.5);
            const recordedAt = rawPt.recorded_at || new Date().toISOString();

            db.location_points.push({
              id: `loc-sync-${Date.now()}-${syncedPointsCount}`,
              booker_id: booker.id,
              booker_name: booker.full_name,
              latitude: lat,
              longitude: lng,
              accuracy_meters: accuracy,
              speed_kmh: Number(rawPt.speed_kmh ?? 14.0),
              battery_pct: Number(rawPt.battery_pct ?? 80),
              is_moving: Boolean(rawPt.is_moving ?? true),
              is_mock_location: false,
              recorded_at: recordedAt,
              synced_from_offline_queue: true,
            });
            syncedPointsCount += 1;

            for (const shop of assignedShops) {
              const distMeters =
                haversineDistanceKm(lat, lng, shop.latitude, shop.longitude) * 1000;
              if (distMeters <= shop.geofence_radius_meters) {
                const existingRecent = db.shop_visits.find(
                  (v) =>
                    v.booker_id === booker.id &&
                    v.dealer_id === shop.id &&
                    v.visit_date === today
                );
                if (!existingRecent) {
                  db.shop_visits.unshift({
                    id: `vis-sync-${Date.now()}-${detectedVisitsCount}`,
                    booker_id: booker.id,
                    booker_name: booker.full_name,
                    dealer_id: shop.id,
                    shop_name: shop.shop_name,
                    area_name: shop.area_name,
                    visit_date: today,
                    arrival_time: recordedAt,
                    departure_time: null,
                    duration_minutes: Number(rawPt.duration_minutes || 22),
                    gps_accuracy_meters: accuracy,
                    verification_type: 'GPS_GEOFENCE_DETECTED',
                    order_placed: false,
                    collection_made: false,
                    collection_amount: 0,
                    latitude: lat,
                    longitude: lng,
                    notes: `Synced from Android offline queue inside ${shop.geofence_radius_meters}m geofence (${Math.round(distMeters)}m)`,
                  });
                  detectedVisitsCount += 1;
                }
              }
            }
          }

          appendAuditLog(db, {
            actor_id: actor.id,
            actor_name: actor.full_name,
            actor_role: actor.role,
            action: 'OFFLINE_GPS_BATCH_SYNCED',
            entity_type: 'location_points',
            entity_id: booker.id,
            summary: `Synchronized ${syncedPointsCount} offline-queued GPS points for ${booker.full_name} (${detectedVisitsCount} shop geofence visits detected).`,
          });

          return { syncedPointsCount, detectedVisitsCount };
        });

        return NextResponse.json({
          ok: true,
          data: syncSummary,
          state: readErpDatabase(),
        });
      }

      case 'TOGGLE_USER_ACTIVE': {
        assertRole(actor, ['OWNER'], 'Activate/Deactivate User Account');
        const target = withErpTransaction((db) => {
          const u = db.users.find((usr) => usr.id === payload.user_id);
          if (!u) throw new Error('User not found.');
          if (u.id === actor.id) throw new Error('Cannot deactivate your own Owner account.');
          u.is_active = !u.is_active;
          u.updated_at = new Date().toISOString();
          appendAuditLog(db, {
            actor_id: actor.id,
            actor_name: actor.full_name,
            actor_role: actor.role,
            action: u.is_active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
            entity_type: 'users',
            entity_id: u.id,
            summary: `${u.is_active ? 'Activated' : 'Deactivated'} user account ${u.full_name} (${u.role}).`,
          });
          return u;
        });
        return NextResponse.json({ ok: true, data: target, state: readErpDatabase() });
      }

      case 'TOGGLE_BOOKER_DUTY': {
        const updatedUser = withErpTransaction((db) => {
          const u = db.users.find((usr) => usr.id === (payload.booker_id || actor.id));
          if (!u) throw new Error('User not found.');
          u.duty_status = u.duty_status === 'ON_DUTY' ? 'OFF_DUTY' : 'ON_DUTY';
          u.updated_at = new Date().toISOString();
          return u;
        });
        return NextResponse.json({ ok: true, data: updatedUser, state: readErpDatabase() });
      }

      case 'MARK_NOTIFICATION_READ': {
        withErpTransaction((db) => {
          if (payload.mark_all) {
            db.notifications.forEach((n) => {
              n.is_read = true;
            });
          } else {
            const n = db.notifications.find((item) => item.id === payload.notification_id);
            if (n) n.is_read = true;
          }
        });
        return NextResponse.json({ ok: true, state: readErpDatabase() });
      }

      case 'RESET_DEMO_SEED': {
        assertRole(actor, ['OWNER'], 'Reset Demo Seed Data');
        const fresh = createInitialSeedDatabase();
        writeErpDatabase(fresh);
        return NextResponse.json({ ok: true, state: filterStateForActor(fresh, actor) });
      }

      case 'ADD_RAW_MATERIAL_STOCK_RECEIPT': {
        if (actor.role !== 'OWNER' && !(actor.role === 'PRODUCTION_MANAGER' && actor.can_record_purchases)) {
          throw new Error(
            'Forbidden: Production Manager cannot record supplier purchases or incoming stock receipts unless Admin explicitly grants permission.'
          );
        }
        const result = recordRawMaterialPurchaseReceipt({
          material_id: payload.material_id,
          material_name: payload.material_name,
          category: payload.category,
          quantity: Number(payload.quantity),
          unit: payload.unit,
          opening_stock: payload.opening_stock !== undefined ? Number(payload.opening_stock) : undefined,
          supplier_name: payload.supplier_name,
          purchase_price_total: Number(payload.purchase_price_total),
          amount_paid: payload.amount_paid !== undefined ? Number(payload.amount_paid) : undefined,
          payment_method: payload.payment_method,
          purchase_date: payload.purchase_date,
          invoice_number: payload.invoice_number,
          minimum_stock_level: payload.minimum_stock_level,
          notes: payload.notes,
          actor,
        });
        return NextResponse.json({
          ok: true,
          data: result,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'CONFIRM_PRODUCTION_BATCH': {
        assertRole(actor, ['OWNER', 'PRODUCTION_MANAGER'], 'Confirm Daily Production Batch');
        const confirmed = confirmProductionBatch({
          production_date: payload.production_date,
          juice_type: payload.juice_type || payload.product_name,
          cartons_produced: Number(payload.cartons_produced ?? payload.actual_cartons),
          consumed_materials: payload.consumed_materials || [],
          notes: payload.notes ?? payload.remarks,
          idempotency_key: payload.idempotency_key,
          actor,
        });
        return NextResponse.json({
          ok: true,
          data: confirmed,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'REVERSE_OR_CORRECT_PRODUCTION_BATCH': {
        assertRole(actor, ['OWNER', 'PRODUCTION_MANAGER'], 'Reverse or Correct Production Batch');
        const corrected = reverseOrCorrectProductionBatch({
          batch_id: payload.batch_id,
          reason: payload.reason,
          corrected_production: payload.corrected_production,
          actor,
        });
        return NextResponse.json({
          ok: true,
          data: corrected,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'SET_FINISHED_GOODS_OPENING_STOCK': {
        assertRole(actor, ['OWNER'], 'Set Finished Goods Opening Stock');
        const fgOpened = setFinishedGoodsOpeningStock({
          juice_type: payload.juice_type || payload.product_name,
          opening_cartons: Number(payload.opening_cartons),
          opening_date: payload.opening_date || payload.date,
          notes: payload.notes,
          actor,
        });
        return NextResponse.json({
          ok: true,
          data: fgOpened,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'SAVE_PRODUCTION_BATCH':
      case 'CREATE_OR_UPDATE_PRODUCTION_BATCH': {
        assertRole(actor, ['OWNER', 'PRODUCTION_MANAGER'], 'Create or Submit Production Batch');
        const batch = createOrUpdateProductionBatch({
          batch_id: payload.batch_id,
          product_id: payload.product_id,
          product_name: payload.product_name,
          flavour_name: payload.flavour_name,
          bottle_size_label: payload.bottle_size_label,
          target_bottles: payload.target_bottles,
          actual_bottles: Number(payload.actual_bottles),
          wastage_bottles: Number(payload.wastage_bottles || 0),
          production_date: payload.production_date,
          machine_id: payload.machine_id,
          remarks: payload.remarks,
          status: payload.status === 'SUBMITTED' ? 'SUBMITTED' : 'DRAFT',
          consumed_materials: payload.consumed_materials || [],
          actor,
        });
        return NextResponse.json({
          ok: true,
          data: batch,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'REVIEW_PRODUCTION_BATCH': {
        assertRole(actor, ['OWNER'], 'Approve or Reject Production Batch');
        const reviewed = reviewProductionBatchByAdmin({
          batch_id: payload.batch_id,
          decision: payload.decision === 'REJECTED' ? 'REJECTED' : 'APPROVED',
          rejection_reason: payload.rejection_reason,
          actor,
        });
        return NextResponse.json({
          ok: true,
          data: reviewed,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'ADMIN_ADJUST_RAW_MATERIAL_STOCK': {
        assertRole(actor, ['OWNER'], 'Authorized Owner Raw Material Stock Adjustment');
        const adjusted = adjustRawMaterialStock({
          material_id: payload.material_id,
          adjustment_type: payload.adjustment_type,
          adjustment_quantity: Number(payload.adjustment_quantity),
          unit: payload.unit,
          reason: payload.reason,
          adjustment_date: payload.adjustment_date || payload.date,
          actor,
        });
        return NextResponse.json({
          ok: true,
          data: adjusted,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'SET_RAW_MATERIAL_OPENING_STOCK': {
        assertRole(actor, ['OWNER'], 'Set Raw Material Opening Stock');
        const opened = setRawMaterialOpeningStock({
          material_id: payload.material_id,
          opening_quantity: Number(payload.opening_quantity),
          unit: payload.unit,
          opening_date: payload.opening_date || payload.date,
          notes: payload.notes,
          actor,
        });
        return NextResponse.json({
          ok: true,
          data: opened,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'CONFIGURE_RAW_MATERIAL_SETTINGS': {
        assertRole(actor, ['OWNER'], 'Configure Raw Material Threshold & Conversion');
        const updated = configureRawMaterialSettings({
          material_id: payload.material_id,
          minimum_stock_level:
            payload.minimum_stock_level !== undefined
              ? Number(payload.minimum_stock_level)
              : undefined,
          box_to_piece_factor:
            payload.box_to_piece_factor !== undefined
              ? payload.box_to_piece_factor === '' || payload.box_to_piece_factor === null
                ? null
                : Number(payload.box_to_piece_factor)
              : undefined,
          actor,
        });
        return NextResponse.json({
          ok: true,
          data: updated,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'MANAGE_EMPLOYEE': {
        assertRole(actor, ['OWNER'], 'Manage Employee Account');
        const emp = manageEmployeeAccount({
          user_id: payload.user_id,
          full_name: payload.full_name,
          email: payload.email,
          phone: payload.phone,
          role: payload.role,
          password: payload.password,
          department: payload.department,
          can_record_purchases: payload.can_record_purchases,
          assigned_area_id: payload.assigned_area_id,
          is_active: payload.is_active,
          actor,
        });
        const { password_hash, ...safeEmp } = emp;
        return NextResponse.json({
          ok: true,
          data: safeEmp,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'RESET_USER_PASSWORD': {
        const targetId = payload.target_user_id || payload.user_id || actor.id;
        if (actor.role !== 'OWNER' && targetId !== actor.id) {
          throw new Error('Forbidden: Only Owner / Super Admin can reset another employee password.');
        }
        const newPassword = String(payload.new_password || '').trim();
        if (newPassword.length < 4) {
          throw new Error('New password must be at least 4 characters.');
        }
        const updatedUser = withErpTransaction((db) => {
          const u = db.users.find((usr) => usr.id === targetId);
          if (!u) throw new Error('User not found.');
          u.password_hash = hashPasswordSecure(newPassword);
          u.updated_at = new Date().toISOString();
          appendAuditLog(db, {
            actor_id: actor.id,
            actor_name: actor.full_name,
            actor_role: actor.role,
            action: 'USER_PASSWORD_RESET',
            entity_type: 'users',
            entity_id: u.id,
            summary: `Password reset completed for ${u.full_name} (${u.email}).`,
          });
          return u;
        });
        const { password_hash, ...safeUser } = updatedUser;
        return NextResponse.json({
          ok: true,
          data: safeUser,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'UPDATE_MY_PROFILE': {
        const updatedProfile = withErpTransaction((db) => {
          const u = db.users.find((usr) => usr.id === actor.id);
          if (!u) throw new Error('User profile not found.');
          if (payload.full_name && String(payload.full_name).trim()) {
            u.full_name = String(payload.full_name).trim();
          }
          if (payload.phone && String(payload.phone).trim()) {
            u.phone = String(payload.phone).trim();
          }
          if (payload.department !== undefined) {
            u.department = String(payload.department).trim();
          }
          if (payload.working_hours_start) u.working_hours_start = String(payload.working_hours_start);
          if (payload.working_hours_end) u.working_hours_end = String(payload.working_hours_end);
          if (payload.new_password && String(payload.new_password).trim()) {
            u.password_hash = hashPasswordSecure(String(payload.new_password).trim());
          }
          u.updated_at = new Date().toISOString();
          appendAuditLog(db, {
            actor_id: u.id,
            actor_name: u.full_name,
            actor_role: u.role,
            action: 'USER_PROFILE_UPDATED',
            entity_type: 'users',
            entity_id: u.id,
            summary: `${u.full_name} updated their account profile.`,
          });
          return u;
        });
        const { password_hash, ...safeActor } = updatedProfile;
        return NextResponse.json({
          ok: true,
          actor: safeActor,
          data: safeActor,
          state: filterStateForActor(readErpDatabase(), updatedProfile),
        });
      }

      case 'CREATE_OR_UPDATE_BOOKER': {
        assertRole(actor, ['OWNER', 'PRODUCTION_MANAGER'], 'Create or Manage Booker Account');
        const booker = createOrUpdateBookerAccount({
          booker_id: payload.booker_id,
          booker_name: payload.booker_name,
          contact_number: payload.contact_number,
          created_date: payload.created_date || payload.date,
          is_active: payload.is_active,
          actor,
        });
        return NextResponse.json({
          ok: true,
          data: booker,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'GIVE_CARTONS_TO_BOOKER': {
        assertRole(actor, ['OWNER', 'PRODUCTION_MANAGER'], 'Give Cartons to Booker');
        const given = giveCartonsToBooker({
          booker_id: payload.booker_id,
          booker_name: payload.booker_name,
          contact_number: payload.contact_number,
          juice_type: payload.juice_type || payload.product_name,
          cartons_given: Number(payload.cartons_given),
          amount_payable: Number(payload.amount_payable),
          transaction_date: payload.transaction_date || payload.date,
          notes: payload.notes,
          idempotency_key: payload.idempotency_key,
          actor,
        });
        return NextResponse.json({
          ok: true,
          data: given,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'RECEIVE_BOOKER_PAYMENT': {
        assertRole(actor, ['OWNER', 'PRODUCTION_MANAGER'], 'Receive Payment from Booker');
        const received = receiveBookerPayment({
          booker_id: payload.booker_id,
          payment_amount: Number(payload.payment_amount ?? payload.amount),
          payment_date: payload.payment_date || payload.date,
          notes: payload.notes,
          idempotency_key: payload.idempotency_key,
          actor,
        });
        return NextResponse.json({
          ok: true,
          data: received,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'REVERSE_OR_CORRECT_BOOKER_TRANSACTION': {
        assertRole(actor, ['OWNER', 'PRODUCTION_MANAGER'], 'Reverse or Correct Booker Transaction');
        const revResult = reverseOrCorrectBookerTransaction({
          transaction_id: payload.transaction_id,
          reason: payload.reason,
          corrected_allocation: payload.corrected_allocation,
          corrected_payment: payload.corrected_payment,
          actor,
        });
        return NextResponse.json({
          ok: true,
          data: revResult,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'ISSUE_CASH_TO_MANAGER': {
        assertRole(actor, ['OWNER'], 'Issue Cash to Manager');
        const tx = issueCashToManagerAccount({
          manager_id: payload.manager_id,
          amount: Number(payload.amount),
          reference_number: payload.reference_number,
          description: payload.description,
          transaction_date: payload.transaction_date,
          idempotency_key: payload.idempotency_key,
          actor,
        });
        return NextResponse.json({
          ok: true,
          data: tx,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'RECORD_MANAGER_CASH_PURCHASE': {
        assertRole(actor, ['PRODUCTION_MANAGER'], 'Record Manager Cash Purchase');
        const result = recordManagerCashPurchase({
          material_id: payload.material_id,
          material_name: payload.material_name,
          category: payload.category,
          quantity: Number(payload.quantity),
          unit: payload.unit,
          total_amount: Number(payload.total_amount),
          purchase_date: payload.purchase_date,
          description: payload.description,
          idempotency_key: payload.idempotency_key,
          actor,
        });
        return NextResponse.json({
          ok: true,
          data: result,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'RECORD_MANAGER_CASH_EXPENSE': {
        assertRole(actor, ['PRODUCTION_MANAGER'], 'Record Manager Cash Expense');
        const result = recordManagerCashExpense({
          category: payload.category,
          amount: Number(payload.amount),
          expense_date: payload.expense_date || payload.date,
          description: payload.description,
          idempotency_key: payload.idempotency_key,
          actor,
        });
        return NextResponse.json({
          ok: true,
          data: result,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'REVERSE_MANAGER_CASH_TRANSACTION': {
        assertRole(actor, ['OWNER'], 'Reverse Manager Cash Transaction');
        const rev = reverseManagerCashTransaction({
          transaction_id: payload.transaction_id,
          reason: payload.reason,
          actor,
        });
        return NextResponse.json({
          ok: true,
          data: rev,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'CREATE_SUPPLIER': {
        assertRole(actor, ['OWNER'], 'Register Supplier');
        const supplier = withErpTransaction((db) => {
          const openingPayable = Math.max(0, Number(payload.opening_payable || 0));
          const nowIso = new Date().toISOString();
          const newSup = {
            id: `sup-${Date.now()}`,
            code: `SUP-00${db.suppliers.length + 1}`,
            name: String(payload.name || '').trim(),
            contact_person: String(payload.contact_person || '').trim() || 'Primary Contact',
            phone: String(payload.phone || '').trim() || 'N/A',
            email: String(payload.email || '').trim(),
            address: String(payload.address || '').trim() || 'Industrial Estate',
            opening_balance: openingPayable,
            payable_balance: openingPayable,
            created_at: nowIso,
          };
          if (!newSup.name) throw new Error('Supplier name is required.');
          db.suppliers.push(newSup);

          if (openingPayable > 0) {
            db.supplier_ledger.push({
              id: `sldg-ob-${Date.now()}`,
              supplier_id: newSup.id,
              supplier_name: newSup.name,
              date: nowIso.split('T')[0],
              description: 'Opening Payable Balance at Supplier Registration',
              entry_type: 'OPENING_BALANCE',
              debit: 0,
              credit: openingPayable,
              balance: openingPayable,
              reference_number: `OB-${newSup.code}`,
              payment_method: 'Credit',
              entered_by_id: actor.id,
              entered_by_name: actor.full_name,
              remarks: 'Opening balance',
              created_at: nowIso,
            });
          }

          appendAuditLog(db, {
            actor_id: actor.id,
            actor_name: actor.full_name,
            actor_role: actor.role,
            action: 'SUPPLIER_CREATED',
            entity_type: 'suppliers',
            entity_id: newSup.id,
            summary: `Registered supplier ${newSup.name} (Opening payable: PKR ${newSup.payable_balance.toLocaleString()}).`,
          });
          return newSup;
        });
        return NextResponse.json({
          ok: true,
          data: supplier,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'RECORD_SUPPLIER_PAYMENT': {
        assertRole(actor, ['OWNER'], 'Record Supplier Payment');
        const result = withErpTransaction((db) => {
          const sup = db.suppliers.find((s) => s.id === payload.supplier_id);
          if (!sup) throw new Error('Supplier not found.');
          const amt = Number(payload.amount);
          if (!Number.isFinite(amt) || amt <= 0) throw new Error('Payment amount must be > 0.');
          const payMethod = (payload.payment_method || 'Cash') as 'Cash' | 'Bank Transfer' | 'Cheque';
          const payDate = payload.payment_date || new Date().toISOString().split('T')[0];
          const refNo = payload.reference_number || `SPAY-${Date.now().toString().slice(-5)}`;
          const nowIso = new Date().toISOString();

          sup.payable_balance = Math.max(0, Number((sup.payable_balance - amt).toFixed(2)));

          db.supplier_ledger.push({
            id: `sldg-pay-${Date.now()}`,
            supplier_id: sup.id,
            supplier_name: sup.name,
            date: payDate,
            description: payload.remarks || `Payment made to ${sup.name} (${payMethod})`,
            entry_type: 'PAYMENT_MADE',
            debit: amt,
            credit: 0,
            balance: sup.payable_balance,
            reference_number: refNo,
            payment_method: payMethod,
            entered_by_id: actor.id,
            entered_by_name: actor.full_name,
            remarks: payload.remarks || `Ref: ${refNo}`,
            created_at: nowIso,
          });

          postFinancialTransaction(db, {
            transaction_date: payDate,
            reference_number: refNo,
            transaction_type: 'SUPPLIER_PAYMENT',
            payment_method: payMethod,
            direction: 'OUTFLOW',
            amount: amt,
            related_party_type: 'SUPPLIER',
            related_party_id: sup.id,
            related_party_name: sup.name,
            entered_by_id: actor.id,
            entered_by_name: actor.full_name,
            remarks: payload.remarks || `Supplier payment to ${sup.name}`,
          });

          appendAuditLog(db, {
            actor_id: actor.id,
            actor_name: actor.full_name,
            actor_role: actor.role,
            action: 'SUPPLIER_PAYMENT_DISBURSED',
            entity_type: 'suppliers',
            entity_id: sup.id,
            summary: `Paid PKR ${amt.toLocaleString()} (${payMethod}) to supplier ${sup.name} (${refNo}). Remaining payable: PKR ${sup.payable_balance.toLocaleString()}.`,
          });
          return sup;
        });
        return NextResponse.json({
          ok: true,
          data: result,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'REVERSE_SUPPLIER_LEDGER_ENTRY': {
        assertRole(actor, ['OWNER'], 'Reverse Supplier Ledger Entry');
        const rev = reverseSupplierLedgerEntry({
          ledger_entry_id: payload.ledger_entry_id || payload.entry_id,
          reason: payload.reason || 'Authorized Owner Reversal',
          actor,
        });
        return NextResponse.json({
          ok: true,
          data: rev,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'RECORD_SALES_RETURN': {
        assertRole(actor, ['OWNER'], 'Record Sales Return');
        const salesReturn = withErpTransaction((db) => {
          const dealer = db.dealers.find((d) => d.id === payload.dealer_id);
          if (!dealer) throw new Error('Dealer not found.');
          const product = db.products.find((p) => p.id === payload.product_id);
          if (!product) throw new Error('Product not found.');
          const qtyCartons = Number(payload.quantity_cartons);
          if (!Number.isFinite(qtyCartons) || qtyCartons <= 0) {
            throw new Error('Return quantity (cartons) must be greater than zero.');
          }
          const rate = Number(payload.rate_per_carton || product.wholesale_price_per_carton);
          const creditAmount = Math.round(qtyCartons * rate);
          const returnDate = payload.return_date || new Date().toISOString().split('T')[0];
          const returnNo = `RET-2026-00${db.sales_returns.length + 1}`;
          const restock = payload.restock_good_condition !== false;
          const nowIso = new Date().toISOString();

          const retRecord = {
            id: `sret-${Date.now()}`,
            return_number: returnNo,
            return_date: returnDate,
            order_id: payload.order_id,
            dealer_id: dealer.id,
            dealer_name: dealer.dealer_name,
            shop_name: dealer.shop_name,
            product_id: product.id,
            product_name: product.name,
            bottle_size_label: product.bottle_size_label,
            quantity_cartons: qtyCartons,
            rate_per_carton: rate,
            credit_amount: creditAmount,
            reason: String(payload.reason || 'Dealer return').trim(),
            restock_good_condition: restock,
            entered_by_id: actor.id,
            entered_by_name: actor.full_name,
            created_at: nowIso,
          };
          db.sales_returns.unshift(retRecord);

          // Update Finished Goods if restocked in good condition
          const fg = db.finished_goods.find((f) => f.product_id === product.id);
          if (fg && restock) {
            fg.approved_returns_cartons = Number((fg.approved_returns_cartons + qtyCartons).toFixed(2));
            recalculateFinishedGoodsRow(fg);
            db.inventory_movements.unshift({
              id: `mov-ret-${Date.now()}`,
              item_type: 'FINISHED_GOOD',
              item_id: product.id,
              item_name: product.name,
              movement_type: 'CUSTOMER_RETURN_APPROVED',
              quantity_change: qtyCartons,
              balance_after: fg.closing_stock_cartons,
              reference_type: 'RETURN',
              reference_id: returnNo,
              notes: `Sales return from ${dealer.shop_name}: +${qtyCartons} cartons`,
              performed_by: actor.full_name,
              created_at: nowIso,
            });
          }

          // Credit Dealer Ledger & reduce outstanding balance
          dealer.outstanding_balance = Number((dealer.outstanding_balance - creditAmount).toFixed(2));
          db.dealer_ledger.push({
            id: `ldg-ret-${Date.now()}`,
            dealer_id: dealer.id,
            dealer_name: dealer.dealer_name,
            shop_name: dealer.shop_name,
            date: returnDate,
            description: `Sales Return Credit Note ${returnNo}: ${qtyCartons}x ${product.name} (${retRecord.reason})`,
            entry_type: 'SALES_RETURN_CREDIT',
            debit: 0,
            credit: creditAmount,
            balance: dealer.outstanding_balance,
            reference_number: returnNo,
            payment_method: 'Credit',
            created_by: actor.id,
            created_at: nowIso,
          });

          appendAuditLog(db, {
            actor_id: actor.id,
            actor_name: actor.full_name,
            actor_role: actor.role,
            action: 'SALES_RETURN_RECORDED',
            entity_type: 'sales_returns',
            entity_id: retRecord.id,
            summary: `Recorded sales return ${returnNo} for ${dealer.shop_name}: ${qtyCartons} cartons ${product.name} (Credit PKR ${creditAmount.toLocaleString()}).`,
          });

          return retRecord;
        });
        return NextResponse.json({
          ok: true,
          data: salesReturn,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'RECORD_CASH_BANK_TRANSACTION': {
        assertRole(actor, ['OWNER'], 'Manage Cash & Bank Accounts');
        const txResult = withErpTransaction((db) => {
          const txType = payload.transaction_type as
            | 'OPENING_BALANCE'
            | 'CAPITAL_INJECTION'
            | 'CASH_DEPOSIT_TO_BANK'
            | 'BANK_WITHDRAWAL_TO_CASH';
          const amount = Number(payload.amount);
          if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error('Transaction amount must be greater than zero.');
          }
          const dateStr = payload.transaction_date || new Date().toISOString().split('T')[0];
          const refNo = payload.reference_number || `CB-${Date.now().toString().slice(-5)}`;
          const remarks = String(payload.remarks || '').trim() || txType.replace(/_/g, ' ');

          if (txType === 'CASH_DEPOSIT_TO_BANK') {
            postFinancialTransaction(db, {
              transaction_date: dateStr,
              reference_number: `${refNo}-OUT`,
              transaction_type: 'CASH_DEPOSIT_TO_BANK',
              payment_method: 'Cash',
              direction: 'OUTFLOW',
              amount,
              account_id: 'acc-cash',
              related_party_type: 'INTERNAL_TRANSFER',
              related_party_name: 'Transfer to Corporate Bank Account',
              entered_by_id: actor.id,
              entered_by_name: actor.full_name,
              remarks: `Cash deposited to Bank: ${remarks}`,
            });
            const inTx = postFinancialTransaction(db, {
              transaction_date: dateStr,
              reference_number: `${refNo}-IN`,
              transaction_type: 'CASH_DEPOSIT_TO_BANK',
              payment_method: 'Bank Transfer',
              direction: 'INFLOW',
              amount,
              account_id: 'acc-bank',
              related_party_type: 'INTERNAL_TRANSFER',
              related_party_name: 'Cash Deposit from Factory Cash',
              entered_by_id: actor.id,
              entered_by_name: actor.full_name,
              remarks: `Cash deposited from Factory Cash: ${remarks}`,
            });
            appendAuditLog(db, {
              actor_id: actor.id,
              actor_name: actor.full_name,
              actor_role: actor.role,
              action: 'CASH_DEPOSIT_TO_BANK',
              entity_type: 'financial_transactions',
              entity_id: inTx.id,
              summary: `Transferred PKR ${amount.toLocaleString()} from Factory Cash to Bank (${refNo}).`,
            });
            return inTx;
          }

          if (txType === 'BANK_WITHDRAWAL_TO_CASH') {
            postFinancialTransaction(db, {
              transaction_date: dateStr,
              reference_number: `${refNo}-OUT`,
              transaction_type: 'BANK_WITHDRAWAL_TO_CASH',
              payment_method: 'Bank Transfer',
              direction: 'OUTFLOW',
              amount,
              account_id: 'acc-bank',
              related_party_type: 'INTERNAL_TRANSFER',
              related_party_name: 'Withdrawal to Factory Cash',
              entered_by_id: actor.id,
              entered_by_name: actor.full_name,
              remarks: `Withdrawn from Bank to Cash: ${remarks}`,
            });
            const inTx = postFinancialTransaction(db, {
              transaction_date: dateStr,
              reference_number: `${refNo}-IN`,
              transaction_type: 'BANK_WITHDRAWAL_TO_CASH',
              payment_method: 'Cash',
              direction: 'INFLOW',
              amount,
              account_id: 'acc-cash',
              related_party_type: 'INTERNAL_TRANSFER',
              related_party_name: 'Bank Withdrawal Received',
              entered_by_id: actor.id,
              entered_by_name: actor.full_name,
              remarks: `Cash received from Bank withdrawal: ${remarks}`,
            });
            appendAuditLog(db, {
              actor_id: actor.id,
              actor_name: actor.full_name,
              actor_role: actor.role,
              action: 'BANK_WITHDRAWAL_TO_CASH',
              entity_type: 'financial_transactions',
              entity_id: inTx.id,
              summary: `Withdrew PKR ${amount.toLocaleString()} from Bank to Factory Cash (${refNo}).`,
            });
            return inTx;
          }

          // OPENING_BALANCE or CAPITAL_INJECTION
          const targetAccId = payload.account_id || 'acc-cash';
          const tx = postFinancialTransaction(db, {
            transaction_date: dateStr,
            reference_number: refNo,
            transaction_type: txType || 'CAPITAL_INJECTION',
            payment_method: targetAccId === 'acc-cash' ? 'Cash' : 'Bank Transfer',
            direction: 'INFLOW',
            amount,
            account_id: targetAccId,
            related_party_type: 'OWNER',
            related_party_id: actor.id,
            related_party_name: 'Sikandar Raja (Owner / Capital)',
            entered_by_id: actor.id,
            entered_by_name: actor.full_name,
            remarks,
          });
          appendAuditLog(db, {
            actor_id: actor.id,
            actor_name: actor.full_name,
            actor_role: actor.role,
            action: txType,
            entity_type: 'financial_transactions',
            entity_id: tx.id,
            summary: `Recorded ${txType} of PKR ${amount.toLocaleString()} into ${tx.account_name} (${refNo}).`,
          });
          return tx;
        });
        return NextResponse.json({
          ok: true,
          data: txResult,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'REVERSE_FINANCIAL_TRANSACTION': {
        assertRole(actor, ['OWNER'], 'Reverse Financial Transaction');
        const rev = reverseFinancialTransaction({
          transaction_id: payload.transaction_id,
          reason: payload.reason || 'Authorized Owner Reversal',
          actor,
        });
        return NextResponse.json({
          ok: true,
          data: rev,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'UPDATE_FACTORY_SETTINGS': {
        assertRole(actor, ['OWNER'], 'Update Factory Settings');
        const updatedSettings = withErpTransaction((db) => {
          db.factory_settings = {
            ...db.factory_settings,
            company_name: String(payload.company_name || 'Fruity Fun Juice Factory').trim(),
            owner_name: String(payload.owner_name || 'Sikandar Raja').trim(),
            owner_role_title: String(payload.owner_role_title || 'Owner / Super Admin').trim(),
            factory_address: String(payload.factory_address || db.factory_settings.factory_address).trim(),
            factory_phone: String(payload.factory_phone || db.factory_settings.factory_phone).trim(),
            ntn_strn: String(payload.ntn_strn || db.factory_settings.ntn_strn).trim(),
            default_credit_limit: Number(payload.default_credit_limit || db.factory_settings.default_credit_limit),
            updated_at: new Date().toISOString(),
          };
          appendAuditLog(db, {
            actor_id: actor.id,
            actor_name: actor.full_name,
            actor_role: actor.role,
            action: 'FACTORY_SETTINGS_UPDATED',
            entity_type: 'factory_settings',
            entity_id: 'settings-1',
            summary: `Updated factory settings for ${db.factory_settings.company_name}.`,
          });
          return db.factory_settings;
        });
        return NextResponse.json({
          ok: true,
          data: updatedSettings,
          state: filterStateForActor(readErpDatabase(), actor),
        });
      }

      case 'SWITCH_ENVIRONMENT_MODE': {
        assertRole(actor, ['OWNER'], 'Switch Database Environment Mode');
        const updatedState = switchDatabaseEnvironmentMode({
          mode: payload.mode === 'TEST_SEED_MODE' ? 'TEST_SEED_MODE' : 'PRODUCTION_CLEAN',
          actor,
        });
        return NextResponse.json({
          ok: true,
          state: filterStateForActor(updatedState, actor),
        });
      }

      default:
        return NextResponse.json(
          { ok: false, error: `Unknown ERP action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Transaction failed' },
      { status: 400 }
    );
  }
}
