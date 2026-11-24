import Anthropic from '@anthropic-ai/sdk';
import { readErpDatabase, type ErpDatabaseState } from '../db/store';
import type { ParsedVoiceTransaction, ExpenseCategory, MaterialUnit } from '@juice-erp/shared-types';

/**
 * Helper to parse Pakistani / South Asian & English numerical words
 * e.g. "50 hazar" -> 50000, "45 thousand" -> 45000, "2 lakh" -> 200000
 */
function extractNumbersFromTranscript(text: string): {
  amountOrPrimaryNumber: number | null;
  allNumbers: number[];
} {
  const urduDigitMap: Record<string, string> = {
    '۰': '0',
    '۱': '1',
    '۲': '2',
    '۳': '3',
    '۴': '4',
    '۵': '5',
    '۶': '6',
    '۷': '7',
    '۸': '8',
    '۹': '9',
  };
  const digitNormalized = text.replace(/[۰-۹]/g, (ch) => urduDigitMap[ch] || ch);
  const normalized = digitNormalized.toLowerCase().replace(/,/g, '');

  const hazarMatch = normalized.match(
    /(\d+(?:\.\d+)?)\s*(?:hazar|hazaar|thousand|k\b|ہزار)/i
  );
  if (hazarMatch) {
    const val = Math.round(parseFloat(hazarMatch[1]) * 1000);
    return { amountOrPrimaryNumber: val, allNumbers: [val] };
  }

  const lakhMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lac|لاکھ)/i);
  if (lakhMatch) {
    const val = Math.round(parseFloat(lakhMatch[1]) * 100000);
    return { amountOrPrimaryNumber: val, allNumbers: [val] };
  }

  const rawMatches = normalized.match(/\d+(?:\.\d+)?/g) || [];
  const nums = rawMatches.map((n) => parseFloat(n));
  return {
    amountOrPrimaryNumber: nums.length > 0 ? nums[0] : null,
    allNumbers: nums,
  };
}

function normalizeSpokenUnit(raw: string): MaterialUnit {
  const u = (raw || '').toLowerCase().trim();
  if (['kilo', 'kilogram', 'kilograms', 'kg', 'kgs', 'کلو'].includes(u)) return 'KG';
  if (['gram', 'grams', 'gm', 'g', 'گرام'].includes(u)) return 'GRAM';
  if (['liter', 'liters', 'litre', 'litres', 'ltr', 'l', 'لیٹر'].includes(u)) return 'LITRE';
  if (['ml', 'milliliter', 'millilitre'].includes(u)) return 'ML';
  if (['piece', 'pieces', 'pcs', 'pc', 'bottle', 'bottles'].includes(u)) return 'PIECES';
  if (['packet', 'packets', 'pkt'].includes(u)) return 'PACKETS';
  if (['carton', 'cartons', 'peti', 'box'].includes(u)) return 'CARTONS';
  return 'KG';
}

/**
 * Deterministic Entity & Roman-Urdu/Urdu/English Voice Parser
 * Grounded against actual database records.
 */
export function parseVoiceCommandDeterministically(
  transcript: string,
  db: ErpDatabaseState
): ParsedVoiceTransaction {
  const clean = transcript.trim();
  const lower = clean.toLowerCase();

  const hasUrduScript = /[\u0600-\u06FF]/.test(clean);
  const isRomanUrdu =
    hasUrduScript ||
    /\b(ko|se|ke|ka|ki|diye|lene|hain|wasool|kiye|kiya|hazar|rupay|peti|bill|mein|hua|hai|aaj|hui|aur|aa|raha)\b/i.test(
      lower
    );
  const language_detected: ParsedVoiceTransaction['language_detected'] = isRomanUrdu
    ? 'Roman Urdu / Urdu'
    : 'English';

  const urduDealerAliases: Record<string, string> = {
    'احمد': 'ahmed',
    'بلال': 'bilal',
    'علی': 'ali',
    'نوید': 'naveed',
    'سلمان': 'salman',
  };
  let enrichedLower = lower;
  for (const [urduWord, latinWord] of Object.entries(urduDealerAliases)) {
    if (clean.includes(urduWord)) {
      enrichedLower += ` ${latinWord}`;
    }
  }
  if (clean.includes('آم') || clean.includes('مینگو')) enrichedLower += ' mango';
  if (clean.includes('مالٹا') || clean.includes('اورنج')) enrichedLower += ' orange concentrate';
  if (clean.includes('سیب')) enrichedLower += ' apple';
  if (clean.includes('امرود')) enrichedLower += ' guava';
  if (clean.includes('بجلی')) enrichedLower += ' electricity bill';
  if (clean.includes('کارٹن') || clean.includes('پیٹی')) enrichedLower += ' cartons';
  if (clean.includes('دیے') || clean.includes('دئیے')) enrichedLower += ' ko diye';
  if (clean.includes('لینے ہیں')) enrichedLower += ' se lene hain';
  if (clean.includes('خریدے')) enrichedLower += ' purchase kiye';

  const { amountOrPrimaryNumber, allNumbers } = extractNumbersFromTranscript(enrichedLower);

  // =========================================================================
  // CASE A: MACHINE ISSUE REPORT
  // e.g. "Machine number 2 mein issue aa raha hai."
  // =========================================================================
  if (
    /\b(machine|line|filler|pasteurizer|labeler)\b/i.test(enrichedLower) &&
    /\b(issue|problem|fault|breakdown|kharab|error|stop)\b/i.test(enrichedLower)
  ) {
    const machNumMatch = enrichedLower.match(/machine\s*(?:number|no|#)?\s*(\d+)/i);
    const machIdx = machNumMatch ? Math.max(0, parseInt(machNumMatch[1], 10) - 1) : 0;
    const matchedMachine =
      db.machines[machIdx] ||
      db.machines.find((m) => enrichedLower.includes(m.name.toLowerCase())) ||
      db.machines[0];

    return {
      transcript: clean,
      language_detected,
      intent: 'MACHINE_ISSUE_REPORT',
      confidence: 0.96,
      is_complete: Boolean(matchedMachine),
      missing_fields: matchedMachine ? [] : ['Machine ID'],
      clarification_question: matchedMachine ? null : 'Which machine number has an issue?',
      extracted: {
        machine_id: matchedMachine?.id || 'mach-2',
        machine_name: matchedMachine
          ? `${matchedMachine.machine_number} — ${matchedMachine.name}`
          : 'Machine #2',
        problem_description: clean,
        priority: /\b(critical|stop|breakdown)\b/i.test(enrichedLower) ? 'Critical' : 'High',
        ledger_impact_preview: 'No financial ledger impact (Operational Maintenance Ticket)',
        inventory_impact_preview: matchedMachine
          ? `Marks "${matchedMachine.name}" as Under Maintenance and logs maintenance ticket`
          : 'Logs maintenance issue ticket',
      },
    };
  }

  // =========================================================================
  // CASE B: PRODUCTION BATCH & MATERIAL CONSUMPTION REPORT (Manager / Admin)
  // e.g. "Aaj 500 bottles mango juice produce hui hain."
  // e.g. "Is production mein 500 gram chemical aur 10 kilo sugar use hui."
  // =========================================================================
  if (
    /\b(produce|produced|production|batch)\b/i.test(enrichedLower) ||
    (/\b(use hui|istimal|consumed)\b/i.test(enrichedLower) &&
      /\b(gram|kilo|kg|litre|liter|chemical|sugar|concentrate)\b/i.test(enrichedLower))
  ) {
    // Extract bottle quantity if mentioned (e.g., "500 bottles")
    const bottleMatch = enrichedLower.match(/(\d+)\s*(?:bottles|bottle|botal)/i);
    const bottleQty = bottleMatch ? parseInt(bottleMatch[1], 10) : 500;

    // Extract bottle size if mentioned
    const sizeMatch = enrichedLower.match(/\b(250\s*ml|500\s*ml|1000\s*ml|1\s*l)\b/i);
    const bottleSize = sizeMatch ? sizeMatch[1].toUpperCase().replace(/\s+/g, ' ') : '250 ML';

    // Match product
    const matchedProduct =
      db.products.find((p) => enrichedLower.includes(p.flavour_name.toLowerCase())) ||
      db.products[0];
    const productName = matchedProduct?.name || 'Mango Juice';

    // Extract material consumption clauses like "500 gram chemical", "10 kilo sugar", "5 litre concentrate"
    const consumedList: NonNullable<ParsedVoiceTransaction['extracted']['consumed_materials']> = [];
    const consumptionRegex =
      /(\d+(?:\.\d+)?)\s*(gram|grams|gm|g|kilo|kilogram|kilograms|kg|litre|litres|liter|liters|ml|pieces|piece)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/gi;

    let match: RegExpExecArray | null;
    while ((match = consumptionRegex.exec(enrichedLower)) !== null) {
      const qtyVal = parseFloat(match[1]);
      const unitVal = normalizeSpokenUnit(match[2]);
      const rawKeyword = match[3].trim().toLowerCase();

      // Match against db.raw_materials
      const foundRm = db.raw_materials.find((rm) => {
        const rmLower = rm.name.toLowerCase();
        if (rawKeyword.includes('chemical') && (rmLower.includes('chemical') || rmLower.includes('citric'))) {
          return true;
        }
        if (rawKeyword.includes('sugar') && rmLower.includes('sugar')) return true;
        if (
          (rawKeyword.includes('concentrate') || rawKeyword.includes('mango')) &&
          (rmLower.includes('concentrate') || rmLower.includes('pulp'))
        ) {
          return true;
        }
        if (rawKeyword.includes('bottle') && rmLower.includes('bottle')) return true;
        if (rawKeyword.includes('cap') && rmLower.includes('cap')) return true;
        if (rawKeyword.includes('label') && rmLower.includes('label')) return true;
        return rmLower.includes(rawKeyword);
      });

      if (foundRm) {
        consumedList.push({
          raw_material_id: foundRm.id,
          raw_material_name: foundRm.name,
          entered_quantity: qtyVal,
          entered_unit: unitVal,
        });
      }
    }

    // If the user only said "Aaj 500 bottles mango juice produce hui hain" without listing materials yet,
    // pre-populate standard available materials from db.raw_materials so the preview is ready for confirmation/editing
    if (consumedList.length === 0 && db.raw_materials.length > 0) {
      for (const rm of db.raw_materials) {
        const rmLower = rm.name.toLowerCase();
        if (rmLower.includes('chemical') || rmLower.includes('citric')) {
          consumedList.push({
            raw_material_id: rm.id,
            raw_material_name: rm.name,
            entered_quantity: 500,
            entered_unit: 'GRAM',
          });
        } else if (rmLower.includes('sugar')) {
          consumedList.push({
            raw_material_id: rm.id,
            raw_material_name: rm.name,
            entered_quantity: Math.max(1, Math.min(10, rm.current_stock)),
            entered_unit: 'KG',
          });
        } else if (rmLower.includes('concentrate') || rmLower.includes('pulp')) {
          consumedList.push({
            raw_material_id: rm.id,
            raw_material_name: rm.name,
            entered_quantity: Math.max(1, Math.min(5, rm.current_stock)),
            entered_unit: String(rm.unit).toUpperCase(),
          });
        }
      }
    }

    const missing: string[] = [];
    if (consumedList.length === 0) {
      missing.push('Available Raw Materials in Inventory (Receive stock first or specify materials)');
    }

    const summaryMaterials = consumedList
      .map((c) => `${c.raw_material_name}: ${c.entered_quantity} ${c.entered_unit}`)
      .join(', ');

    return {
      transcript: clean,
      language_detected,
      intent: 'PRODUCTION_BATCH_REPORT',
      confidence: 0.95,
      is_complete: missing.length === 0,
      missing_fields: missing,
      clarification_question:
        missing.length > 0
          ? `Please ensure raw materials are available in stock and specify consumed quantities.`
          : null,
      extracted: {
        product_or_flavour: matchedProduct?.flavour_name || 'Mango',
        matched_product_id: matchedProduct?.id || null,
        matched_product_name: productName,
        bottle_size_label: bottleSize,
        quantity: bottleQty,
        unit: 'BOTTLES',
        consumed_materials: consumedList,
        ledger_impact_preview: `Creates SUBMITTED Production Batch for Admin review (${bottleQty} Bottles of ${productName} ${bottleSize})`,
        inventory_impact_preview:
          consumedList.length > 0
            ? `Upon Admin approval: Deducts [${summaryMaterials}] and adds +${bottleQty} Bottles to Finished Goods`
            : 'Specify material consumption before submitting',
      },
    };
  }

  // Match dealer from actual database dealers
  const matchedDealer = db.dealers.find((d) => {
    const firstName = d.dealer_name.split(' ')[0].toLowerCase();
    const fullName = d.dealer_name.toLowerCase();
    const shopLower = d.shop_name.toLowerCase();
    return (
      enrichedLower.includes(firstName) ||
      enrichedLower.includes(fullName) ||
      enrichedLower.includes(shopLower)
    );
  });

  // Match product / flavour from actual database products
  const matchedProduct = db.products.find((p) => {
    const flv = p.flavour_name.toLowerCase();
    return enrichedLower.includes(flv) || enrichedLower.includes(p.name.toLowerCase());
  });

  // Match raw material from actual database raw_materials
  const matchedRawMaterial = db.raw_materials.find((rm) => {
    const rmLower = rm.name.toLowerCase();
    if (enrichedLower.includes('chemical') && rmLower.includes('chemical')) return true;
    if (enrichedLower.includes('orange concentrate') && rmLower.includes('orange')) return true;
    if (enrichedLower.includes('mango') && (rmLower.includes('mango') || rmLower.includes('concentrate'))) return true;
    if (enrichedLower.includes('sugar') && rmLower.includes('sugar')) return true;
    if (enrichedLower.includes('citric') && rmLower.includes('citric')) return true;
    if (enrichedLower.includes('bottle') && rmLower.includes('bottle')) return true;
    if (enrichedLower.includes('cap') && rmLower.includes('cap')) return true;
    if (enrichedLower.includes('label') && rmLower.includes('label')) return true;
    return enrichedLower.includes(rmLower);
  });

  // =========================================================================
  // CASE 1: RAW MATERIAL STOCK RECEIPT OR SUPPLIER PURCHASE
  // e.g. "Factory mein 2 kilo chemical receive hua hai."
  // e.g. "ABC supplier se 10 kilo sugar purchase ki."
  // =========================================================================
  if (
    /\b(receive|received|wasool hua|aaya|purchase|purchased|khareed|khareede|bought|buy)\b/i.test(
      enrichedLower
    ) &&
    /\b(kilo|kilogram|kg|gram|litre|liter|ml|piece|pieces|chemical|sugar|concentrate|bottle|cap|label)\b/i.test(
      enrichedLower
    )
  ) {
    const isReceiveCommand = /\b(receive|received|factory mein)\b/i.test(enrichedLower);
    const qty = allNumbers.length > 0 ? allNumbers[0] : null;

    // Determine unit from transcript
    let detectedUnit: MaterialUnit = 'KG';
    if (/\b(gram|grams|gm)\b/i.test(enrichedLower)) detectedUnit = 'GRAM';
    else if (/\b(litre|litres|liter|liters|ltr)\b/i.test(enrichedLower)) detectedUnit = 'LITRE';
    else if (/\b(ml)\b/i.test(enrichedLower)) detectedUnit = 'ML';
    else if (/\b(piece|pieces|pcs|bottle|bottles|cap|caps|label|labels)\b/i.test(enrichedLower))
      detectedUnit = 'PIECES';

    // Determine material name even if not yet in db.raw_materials
    let materialName = matchedRawMaterial?.name || null;
    if (!materialName) {
      if (enrichedLower.includes('chemical')) materialName = 'Juice Chemical';
      else if (enrichedLower.includes('sugar')) materialName = 'Sugar';
      else if (enrichedLower.includes('mango')) materialName = 'Mango Concentrate';
      else if (enrichedLower.includes('orange')) materialName = 'Orange Concentrate';
      else if (enrichedLower.includes('bottle')) materialName = 'Bottles';
      else if (enrichedLower.includes('cap')) materialName = 'Caps';
      else if (enrichedLower.includes('label')) materialName = 'Labels';
    }

    // Determine supplier name from transcript
    let supplierName =
      db.suppliers.find((s) => enrichedLower.includes(s.name.split(' ')[0].toLowerCase()))?.name ||
      null;
    if (!supplierName) {
      const supMatch = clean.match(/([A-Za-z0-9\s]+?)\s+(?:supplier|company|traders|chemicals)/i);
      if (supMatch) {
        supplierName = `${supMatch[1].trim()} Supplier`;
      } else if (materialName?.toLowerCase().includes('chemical')) {
        supplierName = 'ABC Chemicals';
      } else {
        supplierName = 'ABC Supplier';
      }
    }

    const unitPrice =
      matchedRawMaterial?.last_purchase_price ||
      matchedRawMaterial?.average_cost_per_unit ||
      (materialName?.toLowerCase().includes('chemical') ? 2500 : 150);
    const totalPrice =
      allNumbers.length > 1 ? allNumbers[1] : qty ? Math.round(qty * unitPrice) : 5000;

    const missing: string[] = [];
    if (!materialName) missing.push('Raw Material Name');
    if (!qty || qty <= 0) missing.push('Quantity');

    return {
      transcript: clean,
      language_detected,
      intent: isReceiveCommand ? 'RAW_MATERIAL_STOCK_RECEIPT' : 'RAW_MATERIAL_PURCHASE',
      confidence: materialName && qty ? 0.96 : 0.6,
      is_complete: missing.length === 0,
      missing_fields: missing,
      clarification_question:
        missing.length > 0
          ? `Please clarify the missing stock entry details: ${missing.join(', ')}.`
          : null,
      extracted: {
        raw_material_query: materialName,
        matched_raw_material_id: matchedRawMaterial?.id || null,
        matched_raw_material_name: materialName,
        matched_supplier_id: matchedRawMaterial?.supplier_id || null,
        matched_supplier_name: supplierName,
        quantity: qty,
        unit: detectedUnit,
        unit_price_pkr: unitPrice,
        amount_pkr: totalPrice,
        payment_method: 'Cash',
        ledger_impact_preview:
          materialName && qty
            ? `Record Purchase Receipt from ${supplierName}: PKR ${totalPrice.toLocaleString()} (${qty} ${detectedUnit} of ${materialName})`
            : 'Awaiting material & quantity',
        inventory_impact_preview:
          materialName && qty
            ? `Increase "${materialName}" stock by +${qty} ${detectedUnit} and create permanent Stock Ledger Entry`
            : 'No inventory change until clarified',
      },
    };
  }

  // Match expense category
  let expenseCategory: ExpenseCategory | null = null;
  if (/\b(electricity|bijli|lesco|wapda)\b/i.test(enrichedLower)) expenseCategory = 'Electricity';
  else if (/\b(fuel|diesel|petrol)\b/i.test(enrichedLower)) expenseCategory = 'Fuel';
  else if (/\b(salary|salaries|tankhwah)\b/i.test(enrichedLower)) expenseCategory = 'Salaries';
  else if (/\b(rent|kiraya)\b/i.test(enrichedLower)) expenseCategory = 'Factory rent';
  else if (/\b(maintenance|repair)\b/i.test(enrichedLower))
    expenseCategory = 'Machine maintenance';
  else if (/\b(transport|freight|loader)\b/i.test(enrichedLower))
    expenseCategory = 'Transportation';
  else if (/\b(marketing|ads)\b/i.test(enrichedLower)) expenseCategory = 'Marketing';

  // CASE 2: Expense payment
  if (expenseCategory || /\b(bill|expense|kharcha)\b/i.test(enrichedLower)) {
    const amount = amountOrPrimaryNumber;
    const missing: string[] = [];
    if (!expenseCategory) missing.push('Expense Category');
    if (!amount || amount <= 0) missing.push('Expense Amount (PKR)');

    return {
      transcript: clean,
      language_detected,
      intent: 'EXPENSE_PAYMENT',
      confidence: expenseCategory && amount ? 0.97 : 0.6,
      is_complete: missing.length === 0,
      missing_fields: missing,
      clarification_question:
        missing.length > 0
          ? `Please specify the missing expense details: ${missing.join(', ')}.`
          : null,
      extracted: {
        expense_category: expenseCategory,
        amount_pkr: amount,
        payment_method: /\b(bank|transfer|online)\b/i.test(enrichedLower) ? 'Bank Transfer' : 'Cash',
        ledger_impact_preview:
          expenseCategory && amount
            ? `Record Approved Operating Expense (${expenseCategory}): PKR ${amount.toLocaleString()} in Factory P&L`
            : 'Awaiting expense category & amount',
        inventory_impact_preview: 'No inventory change (Financial Operating Expense)',
      },
    };
  }

  // CASE 3: Sales / Carton order or dispatch to dealer (e.g., "Ali dealer ko 100 cartons mango juice dispatch kiye")
  if (/\b(carton|cartons|peti|dispatch|dispatched)\b/i.test(enrichedLower) || matchedProduct) {
    const qty = allNumbers.length > 0 ? allNumbers[0] : null;
    const missing: string[] = [];
    if (!matchedDealer) missing.push('Verified Dealer Name (from Dealer Directory)');
    if (!matchedProduct) missing.push('Verified Juice Product/Flavour');
    if (!qty || qty <= 0) missing.push('Carton Quantity');

    const rate = matchedProduct?.wholesale_price_per_carton || 0;
    const totalAmt = qty && rate ? qty * rate : null;

    return {
      transcript: clean,
      language_detected,
      intent: 'SALES_ORDER_OR_DISPATCH',
      confidence: matchedDealer && matchedProduct && qty ? 0.96 : 0.55,
      is_complete: missing.length === 0,
      missing_fields: missing,
      clarification_question:
        missing.length > 0
          ? `Cannot create order without: ${missing.join(', ')}. Please clarify.`
          : null,
      extracted: {
        party_name: matchedDealer?.dealer_name || null,
        matched_dealer_id: matchedDealer?.id || null,
        matched_dealer_name: matchedDealer
          ? `${matchedDealer.dealer_name} (${matchedDealer.shop_name})`
          : null,
        product_or_flavour: matchedProduct?.flavour_name || null,
        matched_product_id: matchedProduct?.id || null,
        matched_product_name: matchedProduct?.name || null,
        quantity: qty,
        unit: 'CARTONS',
        unit_price_pkr: rate,
        amount_pkr: totalAmt,
        payment_method: 'Credit',
        ledger_impact_preview:
          matchedDealer && totalAmt
            ? `Debit ${matchedDealer.shop_name} Ledger by PKR ${totalAmt.toLocaleString()} (New Balance: PKR ${(
                matchedDealer.outstanding_balance + totalAmt
              ).toLocaleString()})`
            : 'Awaiting dealer, product, and carton quantity',
        inventory_impact_preview:
          matchedProduct && qty
            ? `Dispatch -${qty} cartons of "${matchedProduct.name}" from Finished Goods Inventory`
            : 'Awaiting product & quantity confirmation',
      },
    };
  }

  // CASE 4: Receivable / Collection from Dealer ("Bilal se 80 hazar lene hain" or "Bilal se 80 hazar wasool kiye")
  if (
    /\b(se|from)\b/i.test(enrichedLower) ||
    /\b(lene hain|receivable|wasool|received|collect)\b/i.test(enrichedLower)
  ) {
    const amount = amountOrPrimaryNumber;
    const isPaymentReceived = /\b(wasool|mile|received|collected|jama)\b/i.test(enrichedLower);
    const intent = isPaymentReceived
      ? 'PAYMENT_RECEIVED_FROM_DEALER'
      : 'PAYMENT_RECEIVABLE_RECORD';

    const missing: string[] = [];
    if (!matchedDealer) missing.push('Dealer Name (must match an existing dealer in database)');
    if (!amount || amount <= 0) missing.push('Amount in PKR');

    return {
      transcript: clean,
      language_detected,
      intent,
      confidence: matchedDealer && amount ? 0.95 : 0.5,
      is_complete: missing.length === 0,
      missing_fields: missing,
      clarification_question:
        missing.length > 0 ? `Please clarify: ${missing.join(', ')}.` : null,
      extracted: {
        party_name: matchedDealer?.dealer_name || null,
        matched_dealer_id: matchedDealer?.id || null,
        matched_dealer_name: matchedDealer
          ? `${matchedDealer.dealer_name} (${matchedDealer.shop_name})`
          : null,
        amount_pkr: amount,
        payment_method: isPaymentReceived ? 'Cash' : 'Credit',
        ledger_impact_preview:
          matchedDealer && amount
            ? isPaymentReceived
              ? `Credit ${matchedDealer.shop_name} Ledger by PKR ${amount.toLocaleString()} (Reduces receivable to PKR ${(
                  matchedDealer.outstanding_balance - amount
                ).toLocaleString()})`
              : `Debit Receivable on ${matchedDealer.shop_name} Ledger by PKR ${amount.toLocaleString()} (New receivable balance: PKR ${(
                  matchedDealer.outstanding_balance + amount
                ).toLocaleString()})`
            : 'Awaiting verified dealer and amount',
        inventory_impact_preview: 'No physical stock change (Financial Ledger Entry)',
      },
    };
  }

  // CASE 5: Payment given to party/dealer ("Ahmed ko 50 hazar rupay diye")
  if (
    /\b(ko|to)\b/i.test(enrichedLower) &&
    /\b(diye|paid|pay|transfer|gave)\b/i.test(enrichedLower)
  ) {
    const amount = amountOrPrimaryNumber;
    const missing: string[] = [];
    if (!matchedDealer) missing.push('Dealer / Party Name (must match an existing dealer)');
    if (!amount || amount <= 0) missing.push('Amount in PKR');

    return {
      transcript: clean,
      language_detected,
      intent: 'PAYMENT_GIVEN_TO_PARTY',
      confidence: matchedDealer && amount ? 0.95 : 0.5,
      is_complete: missing.length === 0,
      missing_fields: missing,
      clarification_question:
        missing.length > 0 ? `Please clarify: ${missing.join(', ')}.` : null,
      extracted: {
        party_name: matchedDealer?.dealer_name || null,
        matched_dealer_id: matchedDealer?.id || null,
        matched_dealer_name: matchedDealer
          ? `${matchedDealer.dealer_name} (${matchedDealer.shop_name})`
          : null,
        amount_pkr: amount,
        payment_method: 'Cash',
        ledger_impact_preview:
          matchedDealer && amount
            ? `Debit ${matchedDealer.shop_name} Ledger by PKR ${amount.toLocaleString()} for cash/payment given (New balance: PKR ${(
                matchedDealer.outstanding_balance + amount
              ).toLocaleString()})`
            : 'Awaiting verified dealer and amount',
        inventory_impact_preview: 'No physical stock change (Financial Ledger Entry)',
      },
    };
  }

  return {
    transcript: clean,
    language_detected,
    intent: 'AMBIGUOUS_OR_INCOMPLETE',
    confidence: 0.25,
    is_complete: false,
    missing_fields: ['Transaction Type', 'Verified Entity / Material / Product', 'Amount or Quantity'],
    clarification_question:
      'Could not unambiguously determine the transaction details. Please state clearly (e.g., "Factory mein 2 kilo chemical receive hua hai" or "Aaj 500 bottles mango juice produce hui hain").',
    extracted: {
      ledger_impact_preview: 'None — requires clarification',
      inventory_impact_preview: 'None — requires clarification',
    },
  };
}

/**
 * Primary Voice Transaction Understanding Pipeline (Claude API + Deterministic Entity Verification)
 */
export async function interpretVoiceCommand(
  transcript: string
): Promise<ParsedVoiceTransaction> {
  const db = readErpDatabase();
  const deterministicResult = parseVoiceCommandDeterministically(transcript, db);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.includes('your-anthropic-api-key')) {
    return deterministicResult;
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const dealerList = db.dealers.map((d) => ({
      id: d.id,
      dealer_name: d.dealer_name,
      shop_name: d.shop_name,
      outstanding_balance: d.outstanding_balance,
    }));
    const productList = db.products.map((p) => ({
      id: p.id,
      name: p.name,
      flavour: p.flavour_name,
      wholesale_price_per_carton: p.wholesale_price_per_carton,
    }));
    const rmList = db.raw_materials.map((r) => ({
      id: r.id,
      name: r.name,
      unit: r.unit,
      last_purchase_price: r.last_purchase_price,
    }));

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-latest',
      max_tokens: 700,
      system: `You are the Financial & Production Voice Transaction Parser for Fruity Fun Juice Factory Management ERP.
Never invent dealer names, product names, quantities, or amounts. Match against the provided database records:
Dealers: ${JSON.stringify(dealerList)}
Products: ${JSON.stringify(productList)}
RawMaterials: ${JSON.stringify(rmList)}
Return ONLY valid JSON matching ParsedVoiceTransaction.`,
      messages: [{ role: 'user', content: transcript }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (textBlock && textBlock.type === 'text') {
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as ParsedVoiceTransaction;
        if (parsed && parsed.intent && parsed.extracted) {
          return parsed;
        }
      }
    }
  } catch {
    // Fall back cleanly to deterministic verified parser
  }

  return deterministicResult;
}
