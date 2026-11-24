'use client';

import React, { useState, useMemo } from 'react';
import type { ErpDatabaseState } from '@/lib/db/store';

interface Props {
  db: ErpDatabaseState;
  onMutate: (action: string, payload: Record<string, any>) => Promise<boolean>;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

function calcDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function LiveGpsAndBookerModule({ db, onMutate, showToast }: Props) {
  const bookers = useMemo(
    () => db.users.filter((u) => u.role === 'BOOKER'),
    [db.users]
  );
  const [selectedBookerId, setSelectedBookerId] = useState<string>(
    bookers[0]?.id || 'user-booker-1'
  );
  const [selectedMarkerBookerId, setSelectedMarkerBookerId] = useState<string | null>(
    bookers[0]?.id || null
  );
  const [simShopId, setSimShopId] = useState<string>(db.dealers[0]?.id || '');
  const [manualCheckInFlag, setManualCheckInFlag] = useState<boolean>(false);

  const bookerStats = useMemo(() => {
    return bookers.map((b) => {
      const points = db.location_points
        .filter((p) => p.booker_id === b.id)
        .sort((x, y) => new Date(x.recorded_at).getTime() - new Date(y.recorded_at).getTime());

      let totalDistKm = 0;
      for (let i = 1; i < points.length; i++) {
        totalDistKm += calcDistanceKm(
          points[i - 1].latitude,
          points[i - 1].longitude,
          points[i].latitude,
          points[i].longitude
        );
      }

      const latestPoint = points[points.length - 1] || null;
      const assignedShops = db.dealers.filter((d) => d.assigned_booker_id === b.id);
      const visits = db.shop_visits.filter((v) => v.booker_id === b.id);
      const visitedShopIds = new Set(visits.map((v) => v.dealer_id));
      const unvisitedShops = assignedShops.filter((s) => !visitedShopIds.has(s.id));

      const bOrders = db.orders.filter(
        (o) => o.booker_id === b.id && !['Cancelled', 'Rejected'].includes(o.status)
      );
      const totalSales = bOrders.reduce((acc, o) => acc + o.total_amount, 0);
      const bPayments = db.payments.filter(
        (p) => p.collected_by_id === b.id && !p.is_reversed
      );
      const totalCollections = bPayments.reduce((acc, p) => acc + p.amount, 0);
      const outstanding = assignedShops.reduce((acc, d) => acc + d.outstanding_balance, 0);
      const totalVisitDuration = visits.reduce((acc, v) => acc + v.duration_minutes, 0);
      const avgVisitDuration =
        visits.length > 0 ? Math.round(totalVisitDuration / visits.length) : 0;

      return {
        booker: b,
        points,
        latestPoint,
        totalDistKm: Number(totalDistKm.toFixed(2)),
        assignedShops,
        visits,
        unvisitedShops,
        ordersCount: bOrders.length,
        totalSales,
        totalCollections,
        outstanding,
        totalVisitDuration,
        avgVisitDuration,
      };
    });
  }, [bookers, db]);

  const handleSimulateAndroidGpsPingAtShop = async () => {
    const targetShop = db.dealers.find((d) => d.id === simShopId);
    if (!targetShop) return;
    const ok = await onMutate('RECORD_GPS_PING', {
      booker_id: targetShop.assigned_booker_id,
      latitude: targetShop.latitude + 0.0001,
      longitude: targetShop.longitude + 0.0001,
      accuracy_meters: 5.4,
      speed_kmh: 0,
      battery_pct: 85,
      is_moving: false,
      manual_check_in: manualCheckInFlag,
      duration_minutes: 25,
    });
    if (ok) {
      showToast(`GPS ping recorded at ${targetShop.shop_name}.`, 'success');
    }
  };

  const toMapXY = (lat: number, lng: number) => {
    const minLat = 31.455;
    const maxLat = 31.535;
    const minLng = 74.26;
    const maxLng = 74.39;
    const x = Math.max(40, Math.min(760, ((lng - minLng) / (maxLng - minLng)) * 720 + 40));
    const y = Math.max(40, Math.min(380, ((maxLat - lat) / (maxLat - minLat)) * 340 + 40));
    return { x, y };
  };

  return (
    <div className="space-y-4">
      {/* Top Toolbar */}
      <div className="bg-white border border-slate-200 rounded px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
          Booker GPS &amp; Route Tracking
        </h2>

        {db.dealers.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={simShopId}
              onChange={(e) => setSimShopId(e.target.value)}
              className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800"
            >
              {db.dealers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.shop_name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={manualCheckInFlag}
                onChange={(e) => setManualCheckInFlag(e.target.checked)}
                className="rounded border-slate-300"
              />
              Check-In
            </label>
            <button
              type="button"
              onClick={handleSimulateAndroidGpsPingAtShop}
              className="px-3 py-1 rounded bg-[#0B192C] hover:bg-slate-800 text-white font-semibold text-xs"
            >
              Record GPS Ping
            </button>
          </div>
        )}
      </div>

      {/* Route Map & Booker Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded p-3.5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Route Map
            </span>
            <div className="flex items-center gap-1.5">
              {bookerStats.map((bs) => (
                <button
                  key={bs.booker.id}
                  type="button"
                  onClick={() => {
                    setSelectedBookerId(bs.booker.id);
                    setSelectedMarkerBookerId(bs.booker.id);
                  }}
                  className={`px-2.5 py-1 rounded text-xs font-medium border transition ${
                    selectedBookerId === bs.booker.id
                      ? 'bg-[#0B192C] border-[#0B192C] text-white'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {bs.booker.full_name}
                </button>
              ))}
            </div>
          </div>

          <div className="relative rounded overflow-hidden border border-slate-200 bg-slate-50">
            <svg viewBox="0 0 800 420" className="w-full h-[340px]">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path
                    d="M 40 0 L 0 0 0 40"
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth="1"
                  />
                </pattern>
              </defs>
              <rect width="800" height="420" fill="url(#grid)" />

              <path
                d="M 40 360 Q 320 220 760 60"
                stroke="#cbd5e1"
                strokeWidth="6"
                fill="none"
              />
              <path
                d="M 110 40 Q 410 210 710 380"
                stroke="#cbd5e1"
                strokeWidth="4"
                fill="none"
              />
              <text x="580" y="95" fill="#64748b" fontSize="10" fontWeight="bold">
                GULBERG ZONE
              </text>
              <text x="85" y="325" fill="#64748b" fontSize="10" fontWeight="bold">
                JOHAR TOWN ZONE
              </text>
              <text x="590" y="340" fill="#64748b" fontSize="10" fontWeight="bold">
                DHA ZONE
              </text>

              {db.dealers.map((shop) => {
                const { x, y } = toMapXY(shop.latitude, shop.longitude);
                return (
                  <g key={shop.id}>
                    <circle
                      cx={x}
                      cy={y}
                      r={20}
                      fill="rgba(5, 150, 105, 0.08)"
                      stroke="rgba(5, 150, 105, 0.4)"
                      strokeDasharray="3 3"
                    />
                    <circle cx={x} cy={y} r={4.5} fill="#059669" />
                    <text
                      x={x + 8}
                      y={y + 4}
                      fill="#1e293b"
                      fontSize="10"
                      fontWeight="600"
                    >
                      {shop.shop_name}
                    </text>
                  </g>
                );
              })}

              {bookerStats.map((bs, idx) => {
                const color = idx === 0 ? '#0B192C' : '#0284c7';
                const polyPoints = bs.points
                  .map((pt) => {
                    const { x, y } = toMapXY(pt.latitude, pt.longitude);
                    return `${x},${y}`;
                  })
                  .join(' ');

                const latest = bs.latestPoint;
                if (!latest) return null;
                const latestXY = toMapXY(latest.latitude, latest.longitude);

                return (
                  <g key={bs.booker.id}>
                    {bs.points.length > 1 && (
                      <polyline
                        fill="none"
                        stroke={color}
                        strokeWidth="2.5"
                        strokeDasharray="5 3"
                        points={polyPoints}
                      />
                    )}
                    {bs.points.map((pt) => {
                      const xy = toMapXY(pt.latitude, pt.longitude);
                      return (
                        <circle
                          key={pt.id}
                          cx={xy.x}
                          cy={xy.y}
                          r={3}
                          fill={color}
                        />
                      );
                    })}
                    <g
                      className="cursor-pointer"
                      onClick={() => setSelectedMarkerBookerId(bs.booker.id)}
                    >
                      <circle
                        cx={latestXY.x}
                        cy={latestXY.y}
                        r={7}
                        fill={color}
                        stroke="#ffffff"
                        strokeWidth="2"
                      />
                      <text
                        x={latestXY.x - 30}
                        y={latestXY.y - 12}
                        fill="#0f172a"
                        fontSize="11"
                        fontWeight="bold"
                      >
                        {bs.booker.full_name}
                      </text>
                    </g>
                  </g>
                );
              })}
            </svg>

            {selectedMarkerBookerId && (
              <div className="absolute bottom-2.5 left-2.5 bg-white border border-slate-300 rounded p-2.5 text-xs shadow-sm w-72">
                {(() => {
                  const st = bookerStats.find(
                    (b) => b.booker.id === selectedMarkerBookerId
                  );
                  if (!st) return null;
                  return (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">
                          {st.booker.full_name}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                          {st.booker.duty_status}
                        </span>
                      </div>
                      <div className="text-slate-600 tabular-nums">
                        {st.latestPoint
                          ? `${st.latestPoint.latitude.toFixed(4)}° N, ${st.latestPoint.longitude.toFixed(4)}° E`
                          : 'No active coordinates'}
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-slate-600">
                        <span>Distance: {st.totalDistKm} km</span>
                        <button
                          type="button"
                          onClick={() =>
                            onMutate('TOGGLE_BOOKER_DUTY', { booker_id: st.booker.id })
                          }
                          className="text-slate-900 hover:underline font-semibold"
                        >
                          Toggle Duty
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {bookerStats.map((st) => (
            <div
              key={st.booker.id}
              className="bg-white border border-slate-200 rounded p-3.5 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900">{st.booker.full_name}</h3>
                  <p className="text-[11px] text-slate-500 tabular-nums">
                    Shift: {st.booker.working_hours_start} – {st.booker.working_hours_end}
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                    st.booker.duty_status === 'ON_DUTY'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-300'
                  }`}
                >
                  {st.booker.duty_status}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-50 p-2 rounded border border-slate-200">
                  <div className="text-[10px] text-slate-500">Distance</div>
                  <div className="text-xs font-bold text-slate-900 tabular-nums">
                    {st.totalDistKm} km
                  </div>
                </div>
                <div className="bg-slate-50 p-2 rounded border border-slate-200">
                  <div className="text-[10px] text-slate-500">Visited</div>
                  <div className="text-xs font-bold text-emerald-700 tabular-nums">
                    {st.visits.length} / {st.assignedShops.length}
                  </div>
                </div>
                <div className="bg-slate-50 p-2 rounded border border-slate-200">
                  <div className="text-[10px] text-slate-500">Orders</div>
                  <div className="text-xs font-bold text-slate-900 tabular-nums">
                    {st.ordersCount}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Booker Summary Table */}
      <div className="bg-white border border-slate-200 rounded overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Booker Activity Summary
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                <th className="py-2 px-3">Booker</th>
                <th className="py-2 px-3">Assigned / Visited</th>
                <th className="py-2 px-3 text-right">Orders</th>
                <th className="py-2 px-3 text-right">Sales</th>
                <th className="py-2 px-3 text-right">Collections</th>
                <th className="py-2 px-3 text-right">Receivables</th>
                <th className="py-2 px-3 text-right">Distance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {bookerStats.map((st) => (
                <tr key={st.booker.id} className="hover:bg-slate-50">
                  <td className="py-2 px-3 font-semibold text-slate-900">
                    {st.booker.full_name}
                  </td>
                  <td className="py-2 px-3 tabular-nums text-slate-700">
                    {st.assignedShops.length} assigned / {st.visits.length} visited
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums font-semibold">
                    {st.ordersCount}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums font-semibold text-slate-900">
                    PKR {st.totalSales.toLocaleString()}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums font-semibold text-emerald-700">
                    PKR {st.totalCollections.toLocaleString()}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums font-semibold text-slate-800">
                    PKR {st.outstanding.toLocaleString()}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-slate-600">
                    {st.totalDistKm} km
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shop Visits Table */}
      <div className="bg-white border border-slate-200 rounded overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Shop Visit Log ({db.shop_visits.length})
          </h3>
        </div>
        {db.shop_visits.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">No shop visits logged.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-2 px-3">Date &amp; Time</th>
                  <th className="py-2 px-3">Booker</th>
                  <th className="py-2 px-3">Shop</th>
                  <th className="py-2 px-3 text-right">Duration</th>
                  <th className="py-2 px-3">Verification</th>
                  <th className="py-2 px-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {db.shop_visits.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 tabular-nums text-slate-600">
                      {v.visit_date} • {new Date(v.arrival_time).toLocaleTimeString()}
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-900">{v.booker_name}</td>
                    <td className="py-2 px-3 font-semibold text-slate-900">{v.shop_name}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-700">
                      {v.duration_minutes} mins
                    </td>
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                        {v.verification_type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-600">{v.notes}</td>
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
