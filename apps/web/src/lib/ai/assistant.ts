import Anthropic from '@anthropic-ai/sdk';
import { readErpDatabase } from '../db/store';
import type { RoleName } from '@juice-erp/shared-types';

export interface AiAssistantResponse {
  answer: string;
  engine: 'claude-3-5-sonnet' | 'grounded-sql-analytics-engine';
  supporting_metrics: Array<{ label: string; value: string }>;
  generated_at: string;
}

export async function queryBusinessAssistant(params: {
  question: string;
  actor_role: RoleName;
}): Promise<AiAssistantResponse> {
  if (params.actor_role !== 'OWNER') {
    throw new Error(
      'Access Denied: Only the Owner / Super Admin can query financial business intelligence.'
    );
  }

  const db = readErpDatabase();
  const today = new Date().toISOString().split('T')[0];

  // Live Sales & Financials
  const activeOrders = db.orders.filter(
    (o) => !['Cancelled', 'Rejected'].includes(o.status)
  );
  const todayOrders = activeOrders.filter((o) => o.order_date === today);
  const todaySales = todayOrders.reduce((acc, o) => acc + o.total_amount, 0);
  const totalSales = activeOrders.reduce((acc, o) => acc + o.total_amount, 0);
  const totalCogs = activeOrders.reduce((acc, o) => acc + o.total_cogs, 0);
  const approvedExpenses = db.expenses
    .filter((e) => e.approval_status === 'Approved')
    .reduce((acc, e) => acc + e.amount, 0);
  const grossProfit = totalSales - totalCogs;
  const netProfit = grossProfit - approvedExpenses;

  // Approved / Completed Production Batches
  const completedBatches = db.production_batches.filter(
    (b) => b.status === 'APPROVED' || b.status === 'Completed'
  );
  const totalProductionCartons = Number(
    completedBatches.reduce((acc, b) => acc + b.actual_cartons, 0).toFixed(2)
  );
  const totalProductionBottles = completedBatches.reduce(
    (acc, b) =>
      acc + (b.actual_bottles ?? Math.round(b.actual_cartons * (b.units_per_carton || 24))),
    0
  );
  const todayProductionBottles = completedBatches
    .filter((b) => b.production_date === today)
    .reduce(
      (acc, b) =>
        acc + (b.actual_bottles ?? Math.round(b.actual_cartons * (b.units_per_carton || 24))),
      0
    );

  // Product-wise production ranking
  const productProdMap = new Map<
    string,
    { product: string; bottles: number; cartons: number; batches: number }
  >();
  for (const b of completedBatches) {
    const key = `${b.product_name} (${b.bottle_size_label})`;
    const cur = productProdMap.get(key) || {
      product: key,
      bottles: 0,
      cartons: 0,
      batches: 0,
    };
    const btl = b.actual_bottles ?? Math.round(b.actual_cartons * (b.units_per_carton || 24));
    cur.bottles += btl;
    cur.cartons = Number((cur.cartons + b.actual_cartons).toFixed(2));
    cur.batches += 1;
    productProdMap.set(key, cur);
  }
  const topProducedProducts = Array.from(productProdMap.values()).sort(
    (a, b) => b.bottles - a.bottles
  );

  // Raw material consumption (especially Sugar, Chemical, Concentrate)
  const materialConsumedMap = new Map<string, { name: string; consumed: number; unit: string }>();
  for (const rm of db.raw_materials) {
    materialConsumedMap.set(rm.id, {
      name: rm.name,
      consumed: rm.stock_consumed || 0,
      unit: String(rm.unit).toUpperCase(),
    });
  }
  for (const b of completedBatches) {
    for (const u of b.material_usage || []) {
      const existing = materialConsumedMap.get(u.raw_material_id);
      if (!existing) {
        materialConsumedMap.set(u.raw_material_id, {
          name: u.raw_material_name,
          consumed: u.actual_quantity,
          unit: String(u.unit).toUpperCase(),
        });
      } else if (existing.consumed === 0 && u.actual_quantity > 0) {
        existing.consumed += u.actual_quantity;
      }
    }
  }
  const sugarRecord = Array.from(materialConsumedMap.values()).find((m) =>
    m.name.toLowerCase().includes('sugar')
  );
  const sugarConsumed = sugarRecord?.consumed ?? 0;
  const sugarUnit = sugarRecord?.unit ?? 'KG';

  // Dealer receivables ranking
  const dealersByDebt = [...db.dealers].sort(
    (a, b) => b.outstanding_balance - a.outstanding_balance
  );
  const totalReceivables = db.dealers.reduce(
    (acc, d) => acc + Math.max(0, d.outstanding_balance),
    0
  );
  const totalSupplierPayables = db.suppliers.reduce(
    (acc, s) => acc + Math.max(0, s.payable_balance),
    0
  );

  // Low raw materials
  const lowRawMaterials = db.raw_materials.filter(
    (rm) => rm.current_stock <= rm.minimum_stock_level
  );

  const q = params.question.toLowerCase();

  // If ANTHROPIC_API_KEY is configured, call Claude with the exact grounded facts
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && !apiKey.includes('your-anthropic-api-key')) {
    try {
      const anthropic = new Anthropic({ apiKey });
      const factualSnapshot = {
        today,
        todaySales,
        todayOrdersCount: todayOrders.length,
        totalSales,
        totalCogs,
        approvedExpenses,
        grossProfit,
        netProfit,
        totalReceivables,
        totalSupplierPayables,
        topProducedProducts,
        sugarConsumed,
        sugarUnit,
        dealersByDebt: dealersByDebt.map((d) => ({
          dealer: d.dealer_name,
          shop: d.shop_name,
          outstanding: d.outstanding_balance,
          area: d.area_name,
        })),
        lowRawMaterials: lowRawMaterials.map((r) => ({
          name: r.name,
          current: r.current_stock,
          minimum: r.minimum_stock_level,
          unit: r.unit,
        })),
        todayProductionBottles,
        totalProductionBottles,
        totalProductionCartons,
      };

      const msg = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-latest',
        max_tokens: 600,
        system: `You are the Senior ERP Business Intelligence AI for Fruity Fun Juice Factory.
Answer using ONLY the exact database figures provided in JSON below. Never fabricate any numbers. Format currency in PKR.
Database Snapshot: ${JSON.stringify(factualSnapshot)}`,
        messages: [{ role: 'user', content: params.question }],
      });

      const textBlock = msg.content.find((b) => b.type === 'text');
      if (textBlock && textBlock.type === 'text') {
        return {
          answer: textBlock.text,
          engine: 'claude-3-5-sonnet',
          supporting_metrics: [
            { label: "Today's Sales", value: `PKR ${todaySales.toLocaleString()}` },
            { label: 'Total Production', value: `${totalProductionBottles.toLocaleString()} Bottles` },
            { label: 'Total Receivables', value: `PKR ${totalReceivables.toLocaleString()}` },
          ],
          generated_at: new Date().toISOString(),
        };
      }
    } catch {
      // Fall back to deterministic grounded SQL analytics responder
    }
  }

  // 1. Today's total sales
  if (q.includes('today') && q.includes('sale')) {
    return {
      answer: `Today's (${today}) total sales across ${todayOrders.length} active orders are **PKR ${todaySales.toLocaleString()}**. Cumulative active sales stand at **PKR ${totalSales.toLocaleString()}**.`,
      engine: 'grounded-sql-analytics-engine',
      supporting_metrics: [
        { label: "Today's Sales", value: `PKR ${todaySales.toLocaleString()}` },
        { label: "Today's Orders", value: `${todayOrders.length} Orders` },
        { label: 'Cumulative Sales', value: `PKR ${totalSales.toLocaleString()}` },
      ],
      generated_at: new Date().toISOString(),
    };
  }

  // 2. Which product had the highest production?
  if (
    (q.includes('highest') && q.includes('production')) ||
    (q.includes('which product') && q.includes('produc'))
  ) {
    if (topProducedProducts.length === 0) {
      return {
        answer: 'No approved production batches have been recorded yet.',
        engine: 'grounded-sql-analytics-engine',
        supporting_metrics: [{ label: 'Approved Batches', value: '0 Batches' }],
        generated_at: new Date().toISOString(),
      };
    }
    const best = topProducedProducts[0];
    const breakdown = topProducedProducts
      .map(
        (p, idx) =>
          `${idx + 1}. **${p.product}**: ${p.bottles.toLocaleString()} Bottles (${p.cartons} Cartons across ${p.batches} batches)`
      )
      .join('\n');
    return {
      answer: `**${best.product}** had the highest approved production with **${best.bottles.toLocaleString()} Bottles** (${best.cartons} Cartons).\n\nProduction Breakdown:\n${breakdown}`,
      engine: 'grounded-sql-analytics-engine',
      supporting_metrics: topProducedProducts.slice(0, 3).map((p) => ({
        label: p.product,
        value: `${p.bottles.toLocaleString()} Bottles`,
      })),
      generated_at: new Date().toISOString(),
    };
  }

  // 3. How much sugar (or material) was consumed this week?
  if (q.includes('sugar') || q.includes('consumed') || q.includes('consumption')) {
    const allConsumed = Array.from(materialConsumedMap.values()).filter((m) => m.consumed > 0);
    const listText =
      allConsumed.length > 0
        ? allConsumed.map((m) => `- **${m.name}**: **${m.consumed} ${m.unit}**`).join('\n')
        : 'No raw materials consumed in approved batches yet.';
    return {
      answer: `Total **Sugar** consumed across approved production batches is **${sugarConsumed} ${sugarUnit}**.\n\nComplete Raw Material Consumption Summary:\n${listText}`,
      engine: 'grounded-sql-analytics-engine',
      supporting_metrics: [
        { label: 'Sugar Consumed', value: `${sugarConsumed} ${sugarUnit}` },
        { label: 'Approved Batches', value: `${completedBatches.length} Batches` },
      ],
      generated_at: new Date().toISOString(),
    };
  }

  // 4. Which raw material is running low?
  if (q.includes('raw material') || q.includes('low')) {
    if (lowRawMaterials.length === 0) {
      return {
        answer:
          db.raw_materials.length === 0
            ? 'No raw material stock entries exist yet.'
            : 'All raw materials are currently above their minimum safety stock thresholds.',
        engine: 'grounded-sql-analytics-engine',
        supporting_metrics: [{ label: 'Low Stock Items', value: '0 Items' }],
        generated_at: new Date().toISOString(),
      };
    }
    const itemsText = lowRawMaterials
      .map(
        (r) =>
          `- **${r.name} (${r.code})**: **${r.current_stock} ${r.unit}** remaining (Minimum required: ${r.minimum_stock_level} ${r.unit})`
      )
      .join('\n');
    return {
      answer: `There are currently **${lowRawMaterials.length} raw materials** running at or below minimum stock level:\n${itemsText}`,
      engine: 'grounded-sql-analytics-engine',
      supporting_metrics: lowRawMaterials.map((r) => ({
        label: r.name,
        value: `${r.current_stock} / ${r.minimum_stock_level} ${r.unit}`,
      })),
      generated_at: new Date().toISOString(),
    };
  }

  // 5. Which dealer owes the most money? / Total outstanding amount
  if (q.includes('dealer') || q.includes('owe') || q.includes('outstanding') || q.includes('receivable')) {
    if (dealersByDebt.length === 0) {
      return {
        answer: `Total outstanding dealer receivables are **PKR 0** (0 dealers registered).`,
        engine: 'grounded-sql-analytics-engine',
        supporting_metrics: [{ label: 'Total Outstanding', value: 'PKR 0' }],
        generated_at: new Date().toISOString(),
      };
    }
    const top = dealersByDebt[0];
    const list = dealersByDebt
      .map(
        (d, i) =>
          `${i + 1}. **${d.dealer_name} (${d.shop_name})** — PKR ${d.outstanding_balance.toLocaleString()} (${d.area_name})`
      )
      .join('\n');
    return {
      answer: `**${top.dealer_name} (${top.shop_name})** owes the highest balance at **PKR ${top.outstanding_balance.toLocaleString()}**. Total outstanding receivables across all ${db.dealers.length} dealers equal **PKR ${totalReceivables.toLocaleString()}**.\n\nDealer Receivables Ranking:\n${list}`,
      engine: 'grounded-sql-analytics-engine',
      supporting_metrics: [
        { label: 'Highest Debtor', value: `${top.dealer_name} (PKR ${top.outstanding_balance.toLocaleString()})` },
        { label: 'Total Outstanding', value: `PKR ${totalReceivables.toLocaleString()}` },
        { label: 'Supplier Payables', value: `PKR ${totalSupplierPayables.toLocaleString()}` },
      ],
      generated_at: new Date().toISOString(),
    };
  }

  // 6. What was this month's / week's production?
  if (q.includes('production') || q.includes('batch')) {
    return {
      answer: `Total approved production is **${totalProductionBottles.toLocaleString()} Bottles** (**${totalProductionCartons.toLocaleString()} Cartons**) across **${completedBatches.length} approved batches**. Today's approved output is **${todayProductionBottles.toLocaleString()} Bottles**.`,
      engine: 'grounded-sql-analytics-engine',
      supporting_metrics: [
        { label: "Today's Production", value: `${todayProductionBottles.toLocaleString()} Bottles` },
        { label: 'Cumulative Production', value: `${totalProductionBottles.toLocaleString()} Bottles (${totalProductionCartons} Cartons)` },
        { label: 'Approved Batches', value: `${completedBatches.length} Batches` },
      ],
      generated_at: new Date().toISOString(),
    };
  }

  if (q.includes('profit') || q.includes('margin') || q.includes('p&l')) {
    return {
      answer: `Based on actual accounting records (**Net Profit = Revenue - COGS - Approved Operating Expenses**):\n- **Gross Sales Revenue**: PKR ${totalSales.toLocaleString()}\n- **Cost of Goods Sold (COGS)**: PKR ${totalCogs.toLocaleString()}\n- **Gross Profit**: PKR ${grossProfit.toLocaleString()}\n- **Approved Operating Expenses**: PKR ${approvedExpenses.toLocaleString()}\n- **Estimated Net Profit**: **PKR ${netProfit.toLocaleString()}**`,
      engine: 'grounded-sql-analytics-engine',
      supporting_metrics: [
        { label: 'Gross Profit', value: `PKR ${grossProfit.toLocaleString()}` },
        { label: 'Approved Expenses', value: `PKR ${approvedExpenses.toLocaleString()}` },
        { label: 'Net Profit', value: `PKR ${netProfit.toLocaleString()}` },
      ],
      generated_at: new Date().toISOString(),
    };
  }

  return {
    answer: `**Factory Executive Snapshot (${today})**:\n- **Today's Sales**: PKR ${todaySales.toLocaleString()} (${todayOrders.length} orders)\n- **Approved Production**: ${totalProductionBottles.toLocaleString()} Bottles (${completedBatches.length} batches)\n- **Sugar Consumed**: ${sugarConsumed} ${sugarUnit}\n- **Dealer Outstanding Receivables**: PKR ${totalReceivables.toLocaleString()}\n- **Net Profit**: PKR ${netProfit.toLocaleString()}`,
    engine: 'grounded-sql-analytics-engine',
    supporting_metrics: [
      { label: 'Total Production', value: `${totalProductionBottles.toLocaleString()} Bottles` },
      { label: 'Total Sales', value: `PKR ${totalSales.toLocaleString()}` },
      { label: 'Total Outstanding', value: `PKR ${totalReceivables.toLocaleString()}` },
    ],
    generated_at: new Date().toISOString(),
  };
}
