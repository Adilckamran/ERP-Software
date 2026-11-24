'use client';

import React, { useState } from 'react';
import type { ErpDatabaseState } from '@/lib/db/store';
import type { UserProfile } from '@juice-erp/shared-types';

interface Props {
  db: ErpDatabaseState;
  actor: UserProfile;
  onMutate: (action: string, payload: Record<string, any>) => Promise<boolean>;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

type MobileTab =
  | 'dashboard'
  | 'areas'
  | 'shops'
  | 'register'
  | 'new_order'
  | 'order_history'
  | 'collection'
  | 'ledger'
  | 'daily_sales'
  | 'visits'
  | 'gps'
  | 'profile';

export function BookerMobilePortalModule({ db, actor, onMutate, showToast }: Props) {
  const bookers = db.users.filter((u) => u.role === 'BOOKER');
  const [selectedBookerId] = useState(
    actor.role === 'BOOKER' ? actor.id : bookers[0]?.id || 'user-booker-1'
  );
  const activeBooker =
    db.users.find((u) => u.id === selectedBookerId) || bookers[0] || actor;

  const [tab, setTab] = useState<MobileTab>('new_order');

  const assignedShops = db.dealers.filter(
    (d) => d.assigned_booker_id === activeBooker.id
  );
  const assignedAreas = db.dealer_areas.filter(
    (a) => a.assigned_booker_id === activeBooker.id
  );
  const bookerOrders = db.orders.filter((o) => o.booker_id === activeBooker.id);
  const bookerVisits = db.shop_visits.filter((v) => v.booker_id === activeBooker.id);
  const bookerPayments = db.payments.filter(
    (p) => p.collected_by_id === activeBooker.id
  );

  const [orderShopId, setOrderShopId] = useState(assignedShops[0]?.id || '');
  const [orderProductId, setOrderProductId] = useState(db.products[0]?.id || '');
  const [orderQty, setOrderQty] = useState(25);
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [orderPaymentStatus, setOrderPaymentStatus] = useState<
    'Unpaid (Credit)' | 'Partially Paid' | 'Paid'
  >('Unpaid (Credit)');
  const [orderNotes, setOrderNotes] = useState('');

  const [payShopId, setPayShopId] = useState(assignedShops[0]?.id || '');
  const [payAmount, setPayAmount] = useState(25000);
  const [payMethod, setPayMethod] = useState<'Cash' | 'Bank Transfer'>('Cash');
  const [payRef, setPayRef] = useState('');

  const [regDealerName, setRegDealerName] = useState('');
  const [regShopName, setRegShopName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regAddress, setRegAddress] = useState('');

  const selectedProduct =
    db.products.find((p) => p.id === orderProductId) || db.products[0];
  const lineSubtotal = (selectedProduct?.wholesale_price_per_carton || 0) * orderQty;
  const lineTotal = Math.max(0, lineSubtotal - orderDiscount);

  const submitNewOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetDealer = assignedShops.find((s) => s.id === orderShopId) || assignedShops[0];
    if (!targetDealer) {
      showToast('Select an assigned shop first.', 'error');
      return;
    }
    const ok = await onMutate('CREATE_ORDER', {
      idempotency_key: `mob-ord-${activeBooker.id}-${Date.now()}`,
      dealer_id: targetDealer.id,
      booker_id: activeBooker.id,
      product_id: selectedProduct.id,
      quantity_cartons: orderQty,
      rate_per_carton: selectedProduct.wholesale_price_per_carton,
      discount_amount: orderDiscount,
      payment_status: orderPaymentStatus,
      delivery_notes: orderNotes || 'Booker Order',
    });
    if (ok) {
      showToast('Order submitted.', 'success');
      setOrderNotes('');
      setTab('order_history');
    }
  };

  const submitCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetDealer = assignedShops.find((s) => s.id === payShopId) || assignedShops[0];
    if (!targetDealer) return;
    const ok = await onMutate('RECORD_PAYMENT', {
      dealer_id: targetDealer.id,
      amount: payAmount,
      direction: 'INCOMING_FROM_DEALER',
      payment_method: payMethod,
      reference_number: payRef || `RCPT-${Date.now().toString().slice(-4)}`,
      notes: `Collected by ${activeBooker.full_name}`,
    });
    if (ok) {
      showToast('Payment recorded.', 'success');
      setPayRef('');
      setTab('ledger');
    }
  };

  const submitNewShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regDealerName || !regShopName) {
      showToast('Dealer name and shop name are required.', 'error');
      return;
    }
    const ok = await onMutate('CREATE_DEALER', {
      dealer_name: regDealerName,
      shop_name: regShopName,
      contact_number: regPhone || '+92-300-0000000',
      address: regAddress || 'Assigned Zone',
      area_id: assignedAreas[0]?.id || db.dealer_areas[0].id,
      assigned_booker_id: activeBooker.id,
      opening_balance: 0,
      credit_limit: 250000,
    });
    if (ok) {
      showToast('Shop registered.', 'success');
      setRegDealerName('');
      setRegShopName('');
      setRegPhone('');
      setRegAddress('');
      setTab('shops');
    }
  };

  return (
    <div className="space-y-4">
      {/* Compact Booker Navigation Bar */}
      <div className="bg-white border border-slate-200 rounded p-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Booker Panel — {activeBooker.full_name}
          </span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
              activeBooker.duty_status === 'ON_DUTY'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-slate-100 text-slate-600 border-slate-300'
            }`}
          >
            {activeBooker.duty_status}
          </span>
        </div>

        <div className="flex flex-wrap gap-1">
          {[
            { id: 'dashboard', label: 'Summary' },
            { id: 'new_order', label: 'New Order' },
            { id: 'order_history', label: 'Orders' },
            { id: 'collection', label: 'Collection' },
            { id: 'ledger', label: 'Ledger' },
            { id: 'shops', label: 'Shops' },
            { id: 'register', label: 'Add Shop' },
            { id: 'areas', label: 'Areas' },
            { id: 'daily_sales', label: 'Daily Sales' },
            { id: 'visits', label: 'Visits' },
            { id: 'gps', label: 'GPS Duty' },
            { id: 'profile', label: 'Profile' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as MobileTab)}
              className={`px-2.5 py-1 rounded text-xs font-medium border transition ${
                tab === item.id
                  ? 'bg-[#0B192C] text-white border-[#0B192C]'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active Booker View */}
      <div className="bg-white border border-slate-200 rounded p-4 text-xs">
        {tab === 'dashboard' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded">
              <div className="text-slate-500">Assigned Shops</div>
              <div className="text-sm font-bold text-slate-900 mt-1 tabular-nums">
                {assignedShops.length}
              </div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded">
              <div className="text-slate-500">Orders</div>
              <div className="text-sm font-bold text-slate-900 mt-1 tabular-nums">
                {bookerOrders.length}
              </div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded">
              <div className="text-slate-500">Booked Sales</div>
              <div className="text-sm font-bold text-slate-900 mt-1 tabular-nums">
                PKR {bookerOrders.reduce((a, b) => a + b.total_amount, 0).toLocaleString()}
              </div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded">
              <div className="text-slate-500">Collections</div>
              <div className="text-sm font-bold text-emerald-700 mt-1 tabular-nums">
                PKR {bookerPayments.reduce((a, b) => a + b.amount, 0).toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {tab === 'areas' && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
              Assigned Areas
            </h3>
            {assignedAreas.map((a) => (
              <div
                key={a.id}
                className="p-2.5 rounded bg-slate-50 border border-slate-200 flex items-center justify-between"
              >
                <span className="font-semibold text-slate-900">{a.name}</span>
                <span className="text-slate-600">
                  {a.city} • {a.shop_count} Shops
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === 'shops' && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
              Assigned Shops ({assignedShops.length})
            </h3>
            {assignedShops.length === 0 ? (
              <div className="text-slate-500">No assigned shops.</div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2 px-3">Shop</th>
                    <th className="py-2 px-3">Dealer</th>
                    <th className="py-2 px-3">Phone</th>
                    <th className="py-2 px-3 text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {assignedShops.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2 px-3 font-semibold text-slate-900">{s.shop_name}</td>
                      <td className="py-2 px-3 text-slate-700">{s.dealer_name}</td>
                      <td className="py-2 px-3 tabular-nums text-slate-600">{s.contact_number}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold">
                        PKR {s.outstanding_balance.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'register' && (
          <form onSubmit={submitNewShop} className="max-w-md space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Add Shop
            </h3>
            <input
              type="text"
              placeholder="Dealer Name *"
              value={regDealerName}
              onChange={(e) => setRegDealerName(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5"
            />
            <input
              type="text"
              placeholder="Shop Name *"
              value={regShopName}
              onChange={(e) => setRegShopName(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5"
            />
            <input
              type="text"
              placeholder="Phone"
              value={regPhone}
              onChange={(e) => setRegPhone(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5"
            />
            <input
              type="text"
              placeholder="Address"
              value={regAddress}
              onChange={(e) => setRegAddress(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5"
            />
            <button
              type="submit"
              className="px-4 py-1.5 rounded bg-[#0B192C] text-white font-semibold"
            >
              Save Shop
            </button>
          </form>
        )}

        {tab === 'new_order' && (
          <form onSubmit={submitNewOrder} className="max-w-lg space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              New Order
            </h3>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Shop
              </label>
              <select
                value={orderShopId}
                onChange={(e) => setOrderShopId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5"
              >
                {assignedShops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.shop_name} ({s.dealer_name})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Product
              </label>
              <select
                value={orderProductId}
                onChange={(e) => setOrderProductId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5"
              >
                {db.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — PKR {p.wholesale_price_per_carton}/Ctn
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Cartons
                </label>
                <input
                  type="number"
                  min={1}
                  value={orderQty}
                  onChange={(e) => setOrderQty(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Discount
                </label>
                <input
                  type="number"
                  min={0}
                  value={orderDiscount}
                  onChange={(e) => setOrderDiscount(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Terms
                </label>
                <select
                  value={orderPaymentStatus}
                  onChange={(e) => setOrderPaymentStatus(e.target.value as any)}
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5"
                >
                  <option value="Unpaid (Credit)">Credit</option>
                  <option value="Partially Paid">Partial</option>
                  <option value="Paid">Paid</option>
                </select>
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-50 border border-slate-200 flex items-center justify-between">
              <span className="text-slate-600 font-medium">Total:</span>
              <span className="font-bold text-slate-900 tabular-nums">
                PKR {lineTotal.toLocaleString()}
              </span>
            </div>
            <button
              type="submit"
              className="px-4 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
            >
              Submit Order
            </button>
          </form>
        )}

        {tab === 'order_history' && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
              Orders ({bookerOrders.length})
            </h3>
            {bookerOrders.length === 0 ? (
              <div className="text-slate-500">No orders recorded.</div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2 px-3">Order #</th>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Shop</th>
                    <th className="py-2 px-3 text-right">Amount</th>
                    <th className="py-2 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {bookerOrders.map((o) => (
                    <tr key={o.id}>
                      <td className="py-2 px-3 font-semibold tabular-nums">{o.order_number}</td>
                      <td className="py-2 px-3 tabular-nums text-slate-600">{o.order_date}</td>
                      <td className="py-2 px-3 text-slate-900">{o.shop_name}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold">
                        PKR {o.total_amount.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-center">{o.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'collection' && (
          <form onSubmit={submitCollection} className="max-w-md space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Payment Collection
            </h3>
            <select
              value={payShopId}
              onChange={(e) => setPayShopId(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5"
            >
              {assignedShops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.shop_name} (PKR {s.outstanding_balance.toLocaleString()})
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={payAmount}
              onChange={(e) => setPayAmount(Number(e.target.value))}
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 tabular-nums"
              placeholder="Amount (PKR)"
            />
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as any)}
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5"
            >
              <option value="Cash">Cash</option>
              <option value="Bank Transfer">Bank Transfer</option>
            </select>
            <input
              type="text"
              placeholder="Reference #"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5"
            />
            <button
              type="submit"
              className="px-4 py-1.5 rounded bg-emerald-700 text-white font-semibold"
            >
              Save Collection
            </button>
          </form>
        )}

        {tab === 'ledger' && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
              Shop Ledgers
            </h3>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-2 px-3">Shop</th>
                  <th className="py-2 px-3">Details</th>
                  <th className="py-2 px-3 text-right">Debit</th>
                  <th className="py-2 px-3 text-right">Credit</th>
                  <th className="py-2 px-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {db.dealer_ledger
                  .filter((l) => assignedShops.some((s) => s.id === l.dealer_id))
                  .map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 px-3 font-semibold">{l.shop_name}</td>
                      <td className="py-2 px-3 text-slate-600">{l.description}</td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {l.debit.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-emerald-700">
                        {l.credit.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold">
                        PKR {l.balance.toLocaleString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'daily_sales' && (
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div className="p-3 rounded bg-slate-50 border border-slate-200">
              <div className="text-slate-500">Cartons Booked</div>
              <div className="text-sm font-bold text-slate-900 mt-1 tabular-nums">
                {bookerOrders.reduce(
                  (acc, o) => acc + o.items.reduce((s, i) => s + i.quantity_cartons, 0),
                  0
                )}{' '}
                Cartons
              </div>
            </div>
            <div className="p-3 rounded bg-slate-50 border border-slate-200">
              <div className="text-slate-500">Sales Amount</div>
              <div className="text-sm font-bold text-emerald-700 mt-1 tabular-nums">
                PKR {bookerOrders.reduce((acc, o) => acc + o.total_amount, 0).toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {tab === 'visits' && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
              Shop Visits ({bookerVisits.length})
            </h3>
            {bookerVisits.map((v) => (
              <div
                key={v.id}
                className="p-2.5 rounded bg-slate-50 border border-slate-200 flex items-center justify-between"
              >
                <span className="font-semibold text-slate-900">{v.shop_name}</span>
                <span className="text-slate-600 tabular-nums">
                  {v.duration_minutes} mins • {v.verification_type}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === 'gps' && (
          <div className="max-w-sm space-y-2.5">
            <div className="p-3 rounded bg-slate-50 border border-slate-200 space-y-1">
              <div className="text-slate-500">Duty Status</div>
              <div className="text-sm font-bold text-slate-900">{activeBooker.duty_status}</div>
              <div className="text-[11px] text-slate-500 tabular-nums">
                Shift: {activeBooker.working_hours_start} – {activeBooker.working_hours_end}
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                onMutate('TOGGLE_BOOKER_DUTY', { booker_id: activeBooker.id })
              }
              className="px-4 py-1.5 rounded bg-[#0B192C] text-white font-semibold"
            >
              {activeBooker.duty_status === 'ON_DUTY' ? 'End Duty' : 'Start Duty'}
            </button>
          </div>
        )}

        {tab === 'profile' && (
          <div className="max-w-sm p-3 rounded bg-slate-50 border border-slate-200 space-y-1.5">
            <div>
              <span className="text-slate-500">Name: </span>
              <strong className="text-slate-900">{activeBooker.full_name}</strong>
            </div>
            <div>
              <span className="text-slate-500">Email: </span>
              <span className="text-slate-800">{activeBooker.email}</span>
            </div>
            <div>
              <span className="text-slate-500">Phone: </span>
              <span className="text-slate-800 tabular-nums">{activeBooker.phone}</span>
            </div>
            <div>
              <span className="text-slate-500">Role: </span>
              <span className="font-semibold text-slate-800">Booker</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
