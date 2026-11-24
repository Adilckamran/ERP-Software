import assert from 'node:assert';
import {
  createCleanProductionDatabase,
  readErpDatabase,
  writeErpDatabase,
} from './src/lib/db/store';
import {
  issueCashToManagerAccount,
  recordManagerCashPurchase,
  recordManagerCashExpense,
  setRawMaterialOpeningStock,
  adjustRawMaterialStock,
  confirmProductionBatch,
  reverseOrCorrectProductionBatch,
  createOrUpdateBookerAccount,
  giveCartonsToBooker,
  receiveBookerPayment,
  reverseOrCorrectBookerTransaction,
  generateDailyFactoryReport,
  generateMonthlyFactoryReport,
  generateManagerWiseReport,
  generateInventoryReport,
  generateBookerReport,
} from './src/lib/db/operations';
import {
  createSignedSessionToken,
  verifySignedSessionToken,
} from './src/lib/auth/session';

async function runPhase5EndToEndVerification() {
  console.log(
    '=== FRUITY FUN JUICE FACTORY ERP — PHASE 5 COMPLETE END-TO-END INTEGRATION SUITE (25 TESTS) ===\n'
  );

  // Start from an isolated clean production database
  writeErpDatabase(createCleanProductionDatabase());
  let db = readErpDatabase();

  const owner = db.users.find((u) => u.role === 'OWNER')!;
  const kamran = db.users.find((u) => u.id === 'user-mgr-kamran')!;
  const imran = db.users.find((u) => u.id === 'user-mgr-imran')!;

  assert(owner && owner.full_name === 'Sikandar Raja', 'Owner Sikandar Raja must exist');
  assert(kamran && kamran.full_name === 'Kamran Bhai', 'Manager Kamran Bhai must exist');
  assert(imran && imran.full_name === 'Imran Bhai', 'Manager Imran Bhai must exist');
  assert.strictEqual(db.raw_materials.length, 27, 'All 27 raw materials must exist at 0 stock');
  assert.strictEqual(db.products.length, 2, 'Only Apple Juice & Mango Juice products must exist');

  const testDate = '2026-11-23';
  const testMonth = '2026-11';

  const sugarMat = db.raw_materials.find((m) => m.name === 'Sugar')!;
  const compoundMat = db.raw_materials.find((m) => m.name === 'Compound')!;
  const flavourMat = db.raw_materials.find((m) => m.name === 'flavour')!;
  const palpMat = db.raw_materials.find((m) => m.name === 'palp')!;

  // Owner enters initial opening stock for Compound (5 KG) and Flavour (3 LITRE)
  setRawMaterialOpeningStock({
    material_id: compoundMat.id,
    opening_quantity: 5,
    unit: 'KG',
    opening_date: testDate,
    actor: owner,
  });
  setRawMaterialOpeningStock({
    material_id: flavourMat.id,
    opening_quantity: 3,
    unit: 'LITRE',
    opening_date: testDate,
    actor: owner,
  });

  // =========================================================================
  // TEST 1: Owner issues Rs. 100,000 to Kamran
  // =========================================================================
  const cashIss1 = issueCashToManagerAccount({
    manager_id: kamran.id,
    amount: 100000,
    reference_number: 'ISS-KAM-001',
    description: 'Initial factory operations cash issued to Kamran Bhai',
    transaction_date: testDate,
    idempotency_key: 'p5-iss-kam-1',
    actor: owner,
  });
  assert.strictEqual(cashIss1.amount, 100000);
  assert.strictEqual(cashIss1.updated_balance, 100000);
  console.log('[PASS] TEST 1: Owner issued Rs. 100,000 to Kamran Bhai.');

  // =========================================================================
  // TEST 2 & 3: Kamran purchases sugar for Rs. 1,500 & verify cash decreases + sugar stock increases
  // =========================================================================
  const sugarPur = recordManagerCashPurchase({
    material_id: sugarMat.id,
    material_name: 'Sugar',
    quantity: 10,
    unit: 'KG',
    total_amount: 1500,
    purchase_date: testDate,
    description: '10 KG Sugar purchased from cash market',
    idempotency_key: 'p5-pur-kam-1',
    actor: kamran,
  });
  db = readErpDatabase();
  const kamranAccAfterPur = db.manager_cash_accounts.find((a) => a.manager_id === kamran.id)!;
  const sugarAfterPur = db.raw_materials.find((m) => m.id === sugarMat.id)!;
  assert.strictEqual(kamranAccAfterPur.available_balance, 98500, '100,000 - 1,500 = Rs. 98,500');
  assert.strictEqual(kamranAccAfterPur.total_spent_purchases, 1500);
  assert.strictEqual(sugarAfterPur.current_stock, 10, 'Sugar stock increased from 0 to 10 KG');
  console.log(
    '[PASS] TEST 2 & 3: Kamran Bhai purchased 10 KG Sugar for Rs. 1,500; cash decreased to Rs. 98,500 and Sugar stock increased to 10 KG.'
  );

  // =========================================================================
  // TEST 4 & 5: Kamran records a factory expense & verify cash decreases without stock increasing
  // =========================================================================
  const rawStockSumBeforeExp = db.raw_materials.reduce((s, m) => s + m.current_stock, 0);
  const expRes = recordManagerCashExpense({
    category: 'Fuel',
    amount: 3500,
    expense_date: testDate,
    description: 'Diesel for standby generator',
    idempotency_key: 'p5-exp-kam-1',
    actor: kamran,
  });
  db = readErpDatabase();
  const kamranAccAfterExp = db.manager_cash_accounts.find((a) => a.manager_id === kamran.id)!;
  const rawStockSumAfterExp = db.raw_materials.reduce((s, m) => s + m.current_stock, 0);
  assert.strictEqual(kamranAccAfterExp.available_balance, 95000, '98,500 - 3,500 = Rs. 95,000');
  assert.strictEqual(kamranAccAfterExp.total_spent_expenses, 3500);
  assert.strictEqual(
    rawStockSumAfterExp,
    rawStockSumBeforeExp,
    'Factory expense must NOT increase raw material inventory'
  );
  console.log(
    '[PASS] TEST 4 & 5: Kamran Bhai recorded Rs. 3,500 factory expense; cash decreased to Rs. 95,000 without increasing stock.'
  );

  // =========================================================================
  // TEST 6 & 7: Owner issues another Rs. 20,000 & verify old balance carries forward
  // =========================================================================
  const cashIss2 = issueCashToManagerAccount({
    manager_id: kamran.id,
    amount: 20000,
    reference_number: 'ISS-KAM-002',
    description: 'Top-up cash issued to Kamran Bhai',
    transaction_date: testDate,
    idempotency_key: 'p5-iss-kam-2',
    actor: owner,
  });
  db = readErpDatabase();
  const kamranAccCarry = db.manager_cash_accounts.find((a) => a.manager_id === kamran.id)!;
  assert.strictEqual(cashIss2.previous_balance, 95000);
  assert.strictEqual(cashIss2.updated_balance, 115000);
  assert.strictEqual(kamranAccCarry.total_cash_received, 120000, '100,000 + 20,000 = Rs. 120,000');
  assert.strictEqual(kamranAccCarry.available_balance, 115000, '95,000 + 20,000 = Rs. 115,000');
  console.log(
    '[PASS] TEST 6 & 7: Owner issued another Rs. 20,000 to Kamran Bhai; previous Rs. 95,000 carried forward to Rs. 115,000.'
  );

  // Also issue Rs. 50,000 to Imran Bhai and have Imran purchase 8 KG palp for Rs. 3,000
  issueCashToManagerAccount({
    manager_id: imran.id,
    amount: 50000,
    reference_number: 'ISS-IMR-001',
    description: 'Initial cash issued to Imran Bhai',
    transaction_date: testDate,
    idempotency_key: 'p5-iss-imr-1',
    actor: owner,
  });
  recordManagerCashPurchase({
    material_id: palpMat.id,
    material_name: 'palp',
    quantity: 8,
    unit: 'KG',
    total_amount: 3000,
    purchase_date: testDate,
    description: '8 KG mango pulp purchased',
    idempotency_key: 'p5-pur-imr-1',
    actor: imran,
  });

  // =========================================================================
  // TEST 8 & 9: Kamran confirms Apple production & verify raw material consumption + FG addition
  // =========================================================================
  const appleProd = confirmProductionBatch({
    production_date: testDate,
    juice_type: 'Apple Juice',
    cartons_produced: 60,
    consumed_materials: [
      { raw_material_id: sugarMat.id, entered_quantity: 5, entered_unit: 'KG' },
      { raw_material_id: compoundMat.id, entered_quantity: 500, entered_unit: 'GRAM' },
      { raw_material_id: flavourMat.id, entered_quantity: 250, entered_unit: 'ML' },
    ],
    notes: 'Kamran Apple Juice batch',
    idempotency_key: 'p5-prod-apple-1',
    actor: kamran,
  });
  db = readErpDatabase();
  assert.strictEqual(
    db.raw_materials.find((m) => m.id === sugarMat.id)!.current_stock,
    5,
    'Sugar: 10 - 5 = 5 KG'
  );
  assert.strictEqual(
    db.raw_materials.find((m) => m.id === compoundMat.id)!.current_stock,
    4.5,
    'Compound: 5 - 0.5 (500 GRAM) = 4.5 KG'
  );
  assert.strictEqual(
    db.raw_materials.find((m) => m.id === flavourMat.id)!.current_stock,
    2.75,
    'Flavour: 3 - 0.25 (250 ML) = 2.75 LITRE'
  );
  const appleFg = db.finished_goods.find((f) => f.product_name === 'Apple Juice')!;
  assert.strictEqual(appleFg.available_cartons, 60);
  assert.strictEqual(appleFg.available_bottles, 1440, '60 cartons * 24 = 1,440 pieces');
  // Production consumption must NOT reduce manager cash
  assert.strictEqual(
    db.manager_cash_accounts.find((a) => a.manager_id === kamran.id)!.available_balance,
    115000,
    'Production consumption must not reduce manager cash'
  );
  console.log(
    '[PASS] TEST 8 & 9: Kamran Bhai confirmed 60 cartons (1,440 pieces) Apple Juice; raw materials deducted and finished goods added.'
  );

  // =========================================================================
  // TEST 10 & 11: Imran confirms Mango production & verify separate manager production history
  // =========================================================================
  const mangoProd = confirmProductionBatch({
    production_date: testDate,
    juice_type: 'Mango Juice',
    cartons_produced: 40,
    consumed_materials: [
      { raw_material_id: sugarMat.id, entered_quantity: 3, entered_unit: 'KG' },
      { raw_material_id: palpMat.id, entered_quantity: 4, entered_unit: 'KG' },
      { raw_material_id: flavourMat.id, entered_quantity: 250, entered_unit: 'ML' },
    ],
    notes: 'Imran Mango Juice batch',
    idempotency_key: 'p5-prod-mango-1',
    actor: imran,
  });
  db = readErpDatabase();
  const kamranBatches = db.production_batches.filter((b) => b.submitted_by === kamran.id);
  const imranBatches = db.production_batches.filter((b) => b.submitted_by === imran.id);
  assert.strictEqual(kamranBatches.length, 1);
  assert.strictEqual(kamranBatches[0].product_name, 'Apple Juice');
  assert.strictEqual(imranBatches.length, 1);
  assert.strictEqual(imranBatches[0].product_name, 'Mango Juice');
  console.log(
    '[PASS] TEST 10 & 11: Imran Bhai confirmed 40 cartons (960 pieces) Mango Juice; separate manager production history verified.'
  );

  // =========================================================================
  // TEST 12, 13 & 14: Give Apple cartons to a booker & verify FG decreases + booker outstanding increases
  // =========================================================================
  const bookerAlloc = giveCartonsToBooker({
    booker_name: 'Ahmed',
    contact_number: '0300-1234567',
    juice_type: 'Apple Juice',
    cartons_given: 40,
    amount_payable: 20000,
    transaction_date: testDate,
    notes: '40 Apple Juice cartons given to Booker Ahmed',
    idempotency_key: 'p5-bkr-alloc-1',
    actor: owner,
  });
  db = readErpDatabase();
  const appleFgAfterBooker = db.finished_goods.find((f) => f.product_name === 'Apple Juice')!;
  const ahmedAfterAlloc = db.bookers.find((b) => b.id === bookerAlloc.booker.id)!;
  assert.strictEqual(appleFgAfterBooker.available_cartons, 20, '60 - 40 = 20 Apple cartons remaining');
  assert.strictEqual(appleFgAfterBooker.available_bottles, 480, '1,440 - 960 = 480 Apple pieces remaining');
  assert.strictEqual(ahmedAfterAlloc.total_cartons_received, 40);
  assert.strictEqual(ahmedAfterAlloc.total_amount_payable, 20000);
  assert.strictEqual(ahmedAfterAlloc.remaining_outstanding_amount, 20000);
  console.log(
    '[PASS] TEST 12, 13 & 14: Gave 40 Apple cartons (960 pieces) to Booker Ahmed for Rs. 20,000; FG decreased to 20 cartons and booker outstanding increased to Rs. 20,000.'
  );

  // =========================================================================
  // TEST 15, 16 & 17: Receive partial booker payment, verify outstanding decreases & manager cash is unchanged
  // =========================================================================
  const bookerPay = receiveBookerPayment({
    booker_id: bookerAlloc.booker.id,
    payment_amount: 12000,
    payment_date: testDate,
    notes: 'First partial payment from Ahmed',
    idempotency_key: 'p5-bkr-pay-1',
    actor: kamran,
  });
  db = readErpDatabase();
  const ahmedAfterPay = db.bookers.find((b) => b.id === bookerAlloc.booker.id)!;
  assert.strictEqual(ahmedAfterPay.total_payments_received, 12000);
  assert.strictEqual(ahmedAfterPay.remaining_outstanding_amount, 8000, '20,000 - 12,000 = Rs. 8,000');

  // Verify manager cash accounts are completely unchanged by booker payment
  const kamranCashCheck = db.manager_cash_accounts.find((a) => a.manager_id === kamran.id)!;
  const imranCashCheck = db.manager_cash_accounts.find((a) => a.manager_id === imran.id)!;
  assert.strictEqual(kamranCashCheck.available_balance, 115000);
  assert.strictEqual(imranCashCheck.available_balance, 47000, '50,000 - 3,000 = Rs. 47,000');
  console.log(
    '[PASS] TEST 15, 16 & 17: Received Rs. 12,000 partial booker payment; outstanding decreased to Rs. 8,000 and manager cash balances remained unchanged.'
  );

  // =========================================================================
  // TEST 18: Verify Owner Dashboard totals
  // =========================================================================
  const combinedCashIssued =
    kamranCashCheck.total_cash_received + imranCashCheck.total_cash_received;
  const combinedSpending =
    kamranCashCheck.total_spent_purchases +
    kamranCashCheck.total_spent_expenses +
    imranCashCheck.total_spent_purchases +
    imranCashCheck.total_spent_expenses;
  const combinedRemainingCash =
    kamranCashCheck.available_balance + imranCashCheck.available_balance;

  assert.strictEqual(combinedCashIssued, 170000, '120,000 + 50,000 = Rs. 170,000');
  assert.strictEqual(combinedSpending, 8000, '1,500 + 3,500 + 3,000 = Rs. 8,000');
  assert.strictEqual(combinedRemainingCash, 162000, '115,000 + 47,000 = Rs. 162,000');
  console.log(
    '[PASS] TEST 18: Verified Owner Dashboard totals (Combined Cash Issued: Rs. 170,000; Spending: Rs. 8,000; Remaining Cash: Rs. 162,000).'
  );

  // =========================================================================
  // TEST 19: Verify Daily Factory Report
  // =========================================================================
  const dailyRep = generateDailyFactoryReport(db, testDate);
  assert.strictEqual(dailyRep.cash_issued_total, 170000);
  assert.strictEqual(dailyRep.manager_purchases_total, 4500, '1,500 + 3,000 = Rs. 4,500');
  assert.strictEqual(dailyRep.general_expenses_total, 3500);
  assert.strictEqual(dailyRep.apple_production_cartons, 60);
  assert.strictEqual(dailyRep.apple_production_pieces, 1440);
  assert.strictEqual(dailyRep.mango_production_cartons, 40);
  assert.strictEqual(dailyRep.mango_production_pieces, 960);
  assert.strictEqual(dailyRep.booker_allocations_cartons, 40);
  assert.strictEqual(dailyRep.booker_allocations_payable, 20000);
  assert.strictEqual(dailyRep.booker_payments_total, 12000);
  console.log('[PASS] TEST 19: Verified Daily Factory Report accuracy across all sections.');

  // =========================================================================
  // TEST 20: Verify Monthly Factory Report
  // =========================================================================
  const monthlyRep = generateMonthlyFactoryReport(db, testMonth);
  assert.strictEqual(monthlyRep.total_production_cartons, 100);
  assert.strictEqual(monthlyRep.apple_cartons_produced, 60);
  assert.strictEqual(monthlyRep.mango_cartons_produced, 40);
  assert.strictEqual(monthlyRep.total_pieces_produced, 2400);
  assert.strictEqual(monthlyRep.raw_material_purchases_total, 4500);
  assert.strictEqual(monthlyRep.factory_expenses_total, 3500);
  assert.strictEqual(monthlyRep.total_booker_outstanding, 8000);
  console.log('[PASS] TEST 20: Verified Monthly Factory Report accuracy.');

  // =========================================================================
  // TEST 21: Verify Manager-Wise Reports (Kamran Bhai & Imran Bhai)
  // =========================================================================
  const mgrReports = generateManagerWiseReport(db);
  const kamranRep = mgrReports.find((r) => r.manager_name === 'Kamran Bhai')!;
  const imranRep = mgrReports.find((r) => r.manager_name === 'Imran Bhai')!;

  assert.strictEqual(kamranRep.total_cash_received, 120000);
  assert.strictEqual(kamranRep.purchases_total, 1500);
  assert.strictEqual(kamranRep.general_expenses_total, 3500);
  assert.strictEqual(kamranRep.current_balance, 115000);
  assert.strictEqual(kamranRep.apple_cartons_produced, 60);
  assert.strictEqual(kamranRep.mango_cartons_produced, 0);

  assert.strictEqual(imranRep.total_cash_received, 50000);
  assert.strictEqual(imranRep.purchases_total, 3000);
  assert.strictEqual(imranRep.general_expenses_total, 0);
  assert.strictEqual(imranRep.current_balance, 47000);
  assert.strictEqual(imranRep.apple_cartons_produced, 0);
  assert.strictEqual(imranRep.mango_cartons_produced, 40);
  console.log('[PASS] TEST 21: Verified Manager-Wise Reports for Kamran Bhai and Imran Bhai.');

  // =========================================================================
  // TEST 22: Verify Inventory Report
  // =========================================================================
  const invReport = generateInventoryReport(db);
  assert.strictEqual(invReport.length, 27, 'Inventory report lists all 27 raw materials');
  const sugarInvRow = invReport.find((r) => r.material_name === 'Sugar')!;
  assert.strictEqual(sugarInvRow.opening_stock, 0);
  assert.strictEqual(sugarInvRow.total_purchases, 10);
  assert.strictEqual(sugarInvRow.total_consumption, 8, '5 KG (Apple) + 3 KG (Mango) = 8 KG');
  assert.strictEqual(sugarInvRow.current_available_stock, 2, '10 - 8 = 2 KG remaining');
  console.log('[PASS] TEST 22: Verified Inventory Report across all 27 raw materials.');

  // =========================================================================
  // TEST 23: Verify Booker Report
  // =========================================================================
  const bkrReport = generateBookerReport(db);
  assert.strictEqual(bkrReport.length, 1);
  assert.strictEqual(bkrReport[0].booker_name, 'Ahmed');
  assert.strictEqual(bkrReport[0].apple_cartons_given, 40);
  assert.strictEqual(bkrReport[0].mango_cartons_given, 0);
  assert.strictEqual(bkrReport[0].total_cartons, 40);
  assert.strictEqual(bkrReport[0].total_amount_payable, 20000);
  assert.strictEqual(bkrReport[0].payments_received, 12000);
  assert.strictEqual(bkrReport[0].outstanding_balance, 8000);
  console.log('[PASS] TEST 23: Verified Booker Report.');

  // =========================================================================
  // TEST 24: Verify unauthorized access is blocked
  // =========================================================================
  // 24a. Manager cannot issue cash
  assert.throws(
    () =>
      issueCashToManagerAccount({
        manager_id: kamran.id,
        amount: 5000,
        actor: kamran,
      }),
    /Forbidden/
  );
  // 24b. Manager cannot set opening stock
  assert.throws(
    () =>
      setRawMaterialOpeningStock({
        material_id: sugarMat.id,
        opening_quantity: 50,
        actor: kamran,
      }),
    /Forbidden/
  );
  // 24c. Manager cannot perform owner stock adjustment
  assert.throws(
    () =>
      adjustRawMaterialStock({
        material_id: sugarMat.id,
        adjustment_type: 'INCREASE',
        adjustment_quantity: 5,
        reason: 'Unauthorized adjustment attempt',
        actor: imran,
      }),
    /Forbidden/
  );
  // 24d. Manager cannot reverse another manager's production batch
  assert.throws(
    () =>
      reverseOrCorrectProductionBatch({
        batch_id: mangoProd.batch.id,
        reason: 'Cross-manager reversal attempt',
        actor: kamran,
      }),
    /Forbidden/
  );
  // 24e. Forged session token is rejected
  const validToken = createSignedSessionToken(owner);
  assert(verifySignedSessionToken(validToken)?.uid === owner.id);
  assert.strictEqual(verifySignedSessionToken(`${validToken}tampered`), null);
  console.log(
    '[PASS] TEST 24: Verified unauthorized access and forged tokens are strictly blocked.'
  );

  // =========================================================================
  // TEST 25: Verify duplicate submissions cannot corrupt any ledger
  // =========================================================================
  issueCashToManagerAccount({
    manager_id: kamran.id,
    amount: 100000,
    idempotency_key: 'p5-iss-kam-1',
    actor: owner,
  });
  recordManagerCashPurchase({
    material_id: sugarMat.id,
    material_name: 'Sugar',
    quantity: 10,
    unit: 'KG',
    total_amount: 1500,
    idempotency_key: 'p5-pur-kam-1',
    actor: kamran,
  });
  recordManagerCashExpense({
    category: 'Fuel',
    amount: 3500,
    description: 'Diesel',
    idempotency_key: 'p5-exp-kam-1',
    actor: kamran,
  });
  confirmProductionBatch({
    production_date: testDate,
    juice_type: 'Apple Juice',
    cartons_produced: 60,
    consumed_materials: [
      { raw_material_id: sugarMat.id, entered_quantity: 5, entered_unit: 'KG' },
    ],
    idempotency_key: 'p5-prod-apple-1',
    actor: kamran,
  });
  giveCartonsToBooker({
    booker_id: bookerAlloc.booker.id,
    juice_type: 'Apple Juice',
    cartons_given: 40,
    amount_payable: 20000,
    idempotency_key: 'p5-bkr-alloc-1',
    actor: owner,
  });
  receiveBookerPayment({
    booker_id: bookerAlloc.booker.id,
    payment_amount: 12000,
    idempotency_key: 'p5-bkr-pay-1',
    actor: kamran,
  });

  db = readErpDatabase();
  assert.strictEqual(
    db.manager_cash_accounts.find((a) => a.manager_id === kamran.id)!.available_balance,
    115000,
    'Duplicate submissions must not alter manager cash ledger'
  );
  assert.strictEqual(
    db.raw_materials.find((m) => m.id === sugarMat.id)!.current_stock,
    2,
    'Duplicate submissions must not alter raw material inventory ledger'
  );
  assert.strictEqual(
    db.finished_goods.find((f) => f.product_name === 'Apple Juice')!.available_cartons,
    20,
    'Duplicate submissions must not alter finished goods ledger'
  );
  assert.strictEqual(
    db.bookers.find((b) => b.id === bookerAlloc.booker.id)!.remaining_outstanding_amount,
    8000,
    'Duplicate submissions must not alter booker ledger'
  );
  console.log(
    '[PASS] TEST 25: Verified duplicate submissions across all 5 ledgers are idempotent and cannot corrupt any balance.'
  );

  // Reset database back to Clean Production Mode and verify zero test records remain
  writeErpDatabase(createCleanProductionDatabase());
  const cleanDb = readErpDatabase();
  assert.strictEqual(cleanDb.environment_mode, 'PRODUCTION_CLEAN');
  assert.strictEqual(cleanDb.raw_materials.length, 27);
  assert(cleanDb.raw_materials.every((m) => m.current_stock === 0));
  assert.strictEqual(cleanDb.products.length, 2);
  assert(cleanDb.finished_goods.every((f) => f.available_cartons === 0 && f.available_bottles === 0));
  assert.strictEqual(cleanDb.manager_cash_transactions.length, 0);
  assert(cleanDb.manager_cash_accounts.every((a) => a.available_balance === 0));
  assert.strictEqual(cleanDb.production_batches.length, 0);
  assert.strictEqual(cleanDb.bookers.length, 0);
  assert.strictEqual(cleanDb.booker_transactions.length, 0);

  console.log(
    '\n[CLEAN MODE READY] Verified 0 test records remain. Persistent database is in Clean Production Mode.'
  );
  console.log('=== ALL 25 PHASE 5 END-TO-END ERP INTEGRATION TESTS PASSED ===');
}

runPhase5EndToEndVerification().catch((err) => {
  console.error('PHASE 5 VERIFICATION FAILED:', err);
  process.exit(1);
});
