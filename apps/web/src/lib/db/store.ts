import fs from 'fs';
import path from 'path';
import type {
  Role,
  UserProfile,
  Flavour,
  BottleSize,
  PackagingType,
  Product,
  RawMaterial,
  Supplier,
  Purchase,
  Recipe,
  ProductionBatch,
  FinishedGoodsInventory,
  InventoryMovement,
  DealerArea,
  Dealer,
  DealerLedgerEntry,
  Order,
  PaymentRecord,
  Expense,
  Machine,
  MaintenanceRecord,
  LocationPoint,
  ShopVisit,
  AppNotification,
  AuditLog,
  RoleName,
  StockLedgerEntry,
  MaterialPurchaseReceipt,
  SupplierLedgerEntry,
  CashBankAccount,
  FinancialTransaction,
  SalesReturn,
  FactorySettings,
  ManagerCashAccount,
  ManagerCashTransaction,
  BookerAccount,
  BookerTransaction,
} from '@juice-erp/shared-types';
import crypto from 'crypto';
import { getServerEnv, loadMonorepoEnvLocal } from '@/lib/env/server-env';

loadMonorepoEnvLocal();

const INITIAL_SALT = 'f4c70ry5a1t2026ff';

export function hashInitialPassword(plain: string): string {
  const clean = String(plain || '').trim();
  if (!clean) return '';
  const derived = crypto.scryptSync(clean, INITIAL_SALT, 64).toString('hex');
  return `scrypt$${INITIAL_SALT}$${derived}`;
}

export function getInitialCoreUserPasswordFromEnv(emailOrId: string): string {
  loadMonorepoEnvLocal();
  const key = (emailOrId || '').trim().toLowerCase();
  if (key === 'sikandar@fruityfun.pk' || key === 'user-owner-1') {
    return getServerEnv('INITIAL_OWNER_PASSWORD');
  }
  if (key === 'kamran@fruityfun.pk' || key === 'user-mgr-kamran') {
    return getServerEnv('INITIAL_KAMRAN_PASSWORD');
  }
  if (key === 'imran@fruityfun.pk' || key === 'user-mgr-imran') {
    return getServerEnv('INITIAL_IMRAN_PASSWORD');
  }
  return '';
}

export interface ErpDatabaseState {
  is_demo_seeded: boolean;
  environment_mode: 'PRODUCTION_CLEAN' | 'TEST_SEED_MODE';
  roles: Role[];
  users: UserProfile[];
  manager_cash_accounts: ManagerCashAccount[];
  manager_cash_transactions: ManagerCashTransaction[];
  bookers: BookerAccount[];
  booker_transactions: BookerTransaction[];
  flavours: Flavour[];
  bottle_sizes: BottleSize[];
  packaging_types: PackagingType[];
  products: Product[];
  suppliers: Supplier[];
  supplier_ledger: SupplierLedgerEntry[];
  raw_materials: RawMaterial[];
  purchases: Purchase[];
  material_purchase_receipts: MaterialPurchaseReceipt[];
  stock_ledger: StockLedgerEntry[];
  recipes: Recipe[];
  machines: Machine[];
  maintenance_records: MaintenanceRecord[];
  production_batches: ProductionBatch[];
  finished_goods: FinishedGoodsInventory[];
  inventory_movements: InventoryMovement[];
  dealer_areas: DealerArea[];
  dealers: Dealer[];
  dealer_ledger: DealerLedgerEntry[];
  orders: Order[];
  sales_returns: SalesReturn[];
  payments: PaymentRecord[];
  expenses: Expense[];
  cash_bank_accounts: CashBankAccount[];
  financial_transactions: FinancialTransaction[];
  factory_settings: FactorySettings;
  location_points: LocationPoint[];
  shop_visits: ShopVisit[];
  notifications: AppNotification[];
  audit_logs: AuditLog[];
}

function resolveDataDir(): string {
  const cwd = process.cwd();
  // If running inside apps/web, check parent root .data first so root and apps/web share one canonical DB file
  const parentData = path.resolve(cwd, '..', '..', '.data');
  if (cwd.replace(/\\/g, '/').endsWith('/apps/web')) {
    return path.join(cwd, '.data');
  }
  const webData = path.join(cwd, 'apps', 'web', '.data');
  if (fs.existsSync(path.join(cwd, 'apps', 'web'))) {
    return webData;
  }
  return path.join(cwd, '.data');
}

const DATA_DIR = resolveDataDir();
const DB_FILE_PATH = path.join(DATA_DIR, 'erp-database.json');

function todayStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

function isoTime(offsetMinutes = 0): string {
  const d = new Date(Date.now() + offsetMinutes * 60 * 1000);
  return d.toISOString();
}

export function createInitialSeedDatabase(): ErpDatabaseState {
  const today = todayStr(0);
  const yesterday = todayStr(-1);
  const threeDaysAgo = todayStr(-3);
  const sixDaysAgo = todayStr(-6);

  const roles: Role[] = [
    {
      id: 'role-owner',
      name: 'OWNER',
      description: 'Super Admin with complete access to factory, finances, AI, and live GPS',
      permissions: [
        'dashboard:view_owner',
        'dashboard:view_production',
        'users:manage',
        'production:manage',
        'production:verify',
        'raw_materials:manage',
        'finished_goods:manage',
        'dealers:manage',
        'orders:create',
        'orders:approve',
        'orders:dispatch',
        'payments:record',
        'payments:reverse',
        'expenses:create',
        'expenses:approve',
        'accounting:view_pnl',
        'machines:manage',
        'gps:track_self',
        'gps:view_all_bookers',
        'voice:execute_transactions',
        'ai:query_business',
        'reports:export',
      ],
      created_at: isoTime(-10000),
    },
    {
      id: 'role-prod',
      name: 'PRODUCTION_MANAGER',
      description: 'Manages production batches, raw materials, BOM requirements, and machine issues',
      permissions: [
        'dashboard:view_production',
        'production:manage',
        'production:verify',
        'raw_materials:manage',
        'finished_goods:manage',
        'machines:manage',
        'expenses:create',
      ],
      created_at: isoTime(-10000),
    },
    {
      id: 'role-booker',
      name: 'BOOKER',
      description: 'Field salesman managing assigned areas, shops, orders, collections, and GPS tracking',
      permissions: ['orders:create', 'payments:record', 'gps:track_self'],
      created_at: isoTime(-10000),
    },
  ];

  const dealer_areas: DealerArea[] = [
    {
      id: 'area-gulberg',
      name: 'Gulberg & Liberty Zone',
      city: 'Lahore',
      assigned_booker_id: 'user-booker-1',
      assigned_booker_name: 'Usman Tariq',
      shop_count: 2,
      created_at: isoTime(-9000),
    },
    {
      id: 'area-johar',
      name: 'Johar Town & Model Town',
      city: 'Lahore',
      assigned_booker_id: 'user-booker-2',
      assigned_booker_name: 'Kamran Raza',
      shop_count: 2,
      created_at: isoTime(-9000),
    },
    {
      id: 'area-dha',
      name: 'DHA & Cantt Commercial',
      city: 'Lahore',
      assigned_booker_id: 'user-booker-1',
      assigned_booker_name: 'Usman Tariq',
      shop_count: 1,
      created_at: isoTime(-9000),
    },
  ];

  const users: UserProfile[] = [
    {
      id: 'user-owner-1',
      auth_user_id: null,
      email: 'sikandar@fruityfun.pk',
      full_name: 'Sikandar Raja',
      phone: '+92-300-8401122',
      role: 'OWNER',
      is_active: true,
      password_hash: hashInitialPassword(getInitialCoreUserPasswordFromEnv('sikandar@fruityfun.pk')),
      department: 'Executive Management',
      can_record_purchases: true,
      working_hours_start: '08:00',
      working_hours_end: '22:00',
      duty_status: 'ON_DUTY',
      last_login_at: isoTime(-15),
      created_at: isoTime(-10000),
      updated_at: isoTime(-15),
    },
    {
      id: 'user-mgr-kamran',
      auth_user_id: null,
      email: 'kamran@fruityfun.pk',
      full_name: 'Kamran Bhai',
      phone: '+92-321-4509988',
      role: 'PRODUCTION_MANAGER',
      is_active: true,
      password_hash: hashInitialPassword(getInitialCoreUserPasswordFromEnv('kamran@fruityfun.pk')),
      department: 'Factory Operations & Production',
      can_record_purchases: true,
      working_hours_start: '07:00',
      working_hours_end: '19:00',
      duty_status: 'ON_DUTY',
      last_login_at: isoTime(-45),
      created_at: isoTime(-10000),
      updated_at: isoTime(-45),
    },
    {
      id: 'user-mgr-imran',
      auth_user_id: null,
      email: 'imran@fruityfun.pk',
      full_name: 'Imran Bhai',
      phone: '+92-322-4509977',
      role: 'PRODUCTION_MANAGER',
      is_active: true,
      password_hash: hashInitialPassword(getInitialCoreUserPasswordFromEnv('imran@fruityfun.pk')),
      department: 'Factory Operations & Production',
      can_record_purchases: true,
      working_hours_start: '07:00',
      working_hours_end: '19:00',
      duty_status: 'ON_DUTY',
      last_login_at: isoTime(-30),
      created_at: isoTime(-10000),
      updated_at: isoTime(-30),
    },
  ];

  const manager_cash_accounts: ManagerCashAccount[] = [
    {
      manager_id: 'user-mgr-kamran',
      manager_name: 'Kamran Bhai',
      total_cash_received: 0,
      total_spent_purchases: 0,
      total_spent_expenses: 0,
      available_balance: 0,
      updated_at: isoTime(-15),
    },
    {
      manager_id: 'user-mgr-imran',
      manager_name: 'Imran Bhai',
      total_cash_received: 0,
      total_spent_purchases: 0,
      total_spent_expenses: 0,
      available_balance: 0,
      updated_at: isoTime(-15),
    },
  ];

  const flavours: Flavour[] = [
    { id: 'flv-mango', name: 'Mango', code: 'MNG', color_hex: '#F59E0B', is_active: true, created_at: isoTime(-9000) },
    { id: 'flv-orange', name: 'Orange', code: 'ORG', color_hex: '#F97316', is_active: true, created_at: isoTime(-9000) },
    { id: 'flv-apple', name: 'Apple', code: 'APL', color_hex: '#EF4444', is_active: true, created_at: isoTime(-9000) },
    { id: 'flv-guava', name: 'Guava', code: 'GVA', color_hex: '#10B981', is_active: true, created_at: isoTime(-9000) },
    { id: 'flv-mixed', name: 'Mixed Fruit', code: 'MXF', color_hex: '#8B5CF6', is_active: true, created_at: isoTime(-9000) },
  ];

  const bottle_sizes: BottleSize[] = [
    { id: 'size-200', label: '200 ML', volume_ml: 200, is_custom: false, is_active: true, created_at: isoTime(-9000) },
    { id: 'size-250', label: '250 ML', volume_ml: 250, is_custom: false, is_active: true, created_at: isoTime(-9000) },
    { id: 'size-500', label: '500 ML', volume_ml: 500, is_custom: false, is_active: true, created_at: isoTime(-9000) },
    { id: 'size-1000', label: '1000 ML (1L)', volume_ml: 1000, is_custom: false, is_active: true, created_at: isoTime(-9000) },
  ];

  const packaging_types: PackagingType[] = [
    { id: 'pkg-pet24', name: 'PET Bottle Carton (24x)', units_per_carton: 24, created_at: isoTime(-9000) },
    { id: 'pkg-pet12', name: 'PET Bottle Carton (12x)', units_per_carton: 12, created_at: isoTime(-9000) },
    { id: 'pkg-fam6', name: 'Family Pack Carton (6x)', units_per_carton: 6, created_at: isoTime(-9000) },
  ];

  const products: Product[] = [
    {
      id: 'prod-mango-200',
      sku: 'FF-MNG-200',
      name: 'Mango Juice 200 ML',
      flavour_id: 'flv-mango',
      flavour_name: 'Mango',
      bottle_size_id: 'size-200',
      bottle_size_label: '200 ML',
      packaging_type_id: 'pkg-pet24',
      packaging_type_name: 'PET Bottle Carton (24x)',
      units_per_carton: 24,
      wholesale_price_per_carton: 1200,
      retail_price_per_unit: 60,
      standard_cost_per_carton: 820,
      min_stock_cartons: 100,
      is_active: true,
      created_at: isoTime(-9000),
    },
    {
      id: 'prod-mango-250',
      sku: 'FF-MNG-250',
      name: 'Fruity Fun Mango Nectar 250ml',
      flavour_id: 'flv-mango',
      flavour_name: 'Mango',
      bottle_size_id: 'size-250',
      bottle_size_label: '250ml',
      packaging_type_id: 'pkg-pet24',
      packaging_type_name: 'PET Bottle Carton (24x)',
      units_per_carton: 24,
      wholesale_price_per_carton: 1320,
      retail_price_per_unit: 65,
      standard_cost_per_carton: 910,
      min_stock_cartons: 100,
      is_active: true,
      created_at: isoTime(-9000),
    },
    {
      id: 'prod-mango-500',
      sku: 'FF-MNG-500',
      name: 'Mango Juice 500 ML',
      flavour_id: 'flv-mango',
      flavour_name: 'Mango',
      bottle_size_id: 'size-500',
      bottle_size_label: '500 ML',
      packaging_type_id: 'pkg-pet12',
      packaging_type_name: 'PET Bottle Carton (12x)',
      units_per_carton: 12,
      wholesale_price_per_carton: 1200,
      retail_price_per_unit: 120,
      standard_cost_per_carton: 840,
      min_stock_cartons: 80,
      is_active: true,
      created_at: isoTime(-9000),
    },
    {
      id: 'prod-orange-500',
      sku: 'FF-ORG-500',
      name: 'Fruity Fun Orange Citrus 500ml',
      flavour_id: 'flv-orange',
      flavour_name: 'Orange',
      bottle_size_id: 'size-500',
      bottle_size_label: '500ml',
      packaging_type_id: 'pkg-pet12',
      packaging_type_name: 'PET Bottle Carton (12x)',
      units_per_carton: 12,
      wholesale_price_per_carton: 1200,
      retail_price_per_unit: 120,
      standard_cost_per_carton: 830,
      min_stock_cartons: 80,
      is_active: true,
      created_at: isoTime(-9000),
    },
    {
      id: 'prod-apple-1000',
      sku: 'FF-APL-1000',
      name: 'Fruity Fun Clear Apple 1L',
      flavour_id: 'flv-apple',
      flavour_name: 'Apple',
      bottle_size_id: 'size-1000',
      bottle_size_label: '1L',
      packaging_type_id: 'pkg-fam6',
      packaging_type_name: 'Family Pack Carton (6x)',
      units_per_carton: 6,
      wholesale_price_per_carton: 1140,
      retail_price_per_unit: 220,
      standard_cost_per_carton: 790,
      min_stock_cartons: 60,
      is_active: true,
      created_at: isoTime(-9000),
    },
    {
      id: 'prod-guava-250',
      sku: 'FF-GVA-250',
      name: 'Fruity Fun Pink Guava 250ml',
      flavour_id: 'flv-guava',
      flavour_name: 'Guava',
      bottle_size_id: 'size-250',
      bottle_size_label: '250ml',
      packaging_type_id: 'pkg-pet24',
      packaging_type_name: 'PET Bottle Carton (24x)',
      units_per_carton: 24,
      wholesale_price_per_carton: 1280,
      retail_price_per_unit: 65,
      standard_cost_per_carton: 880,
      min_stock_cartons: 75,
      is_active: true,
      created_at: isoTime(-9000),
    },
    {
      id: 'prod-mixed-500',
      sku: 'FF-MXF-500',
      name: 'Fruity Fun Mixed Fruit Punch 500ml',
      flavour_id: 'flv-mixed',
      flavour_name: 'Mixed Fruit',
      bottle_size_id: 'size-500',
      bottle_size_label: '500ml',
      packaging_type_id: 'pkg-pet12',
      packaging_type_name: 'PET Bottle Carton (12x)',
      units_per_carton: 12,
      wholesale_price_per_carton: 1260,
      retail_price_per_unit: 125,
      standard_cost_per_carton: 870,
      min_stock_cartons: 70,
      is_active: true,
      created_at: isoTime(-9000),
    },
  ];

  const suppliers: Supplier[] = [
    {
      id: 'sup-1',
      name: 'Punjab Agro Pulp & Concentrates Ltd',
      contact_person: 'Haji Munir Ahmed',
      phone: '+92-300-4229911',
      email: 'sales@punjabagropulp.pk',
      address: 'Multan Road Industrial Estate, Lahore',
      payable_balance: 145000,
      created_at: isoTime(-9000),
    },
    {
      id: 'sup-2',
      name: 'Crystal PET Preforms & Packaging Co.',
      contact_person: 'Zainab Waqar',
      phone: '+92-322-8877661',
      email: 'orders@crystalpet.pk',
      address: 'Sundar Industrial Estate Gate 2, Lahore',
      payable_balance: 85000,
      created_at: isoTime(-9000),
    },
    {
      id: 'sup-3',
      name: 'Ittefaq Refined Sugar & Food Chemicals',
      contact_person: 'Mian Farooq',
      phone: '+92-331-9001122',
      email: 'info@ittefaqsugar.pk',
      address: 'Ferozepur Road, Kasur',
      payable_balance: 0,
      created_at: isoTime(-9000),
    },
  ];

  const raw_materials: RawMaterial[] = [
    {
      id: 'rm-sugar',
      code: 'RM-SUG-01',
      name: 'Refined Food Grade Sugar',
      category: 'Sweetener',
      unit: 'KG',
      opening_stock: 2850,
      stock_received: 0,
      stock_consumed: 0,
      stock_adjusted: 0,
      current_stock: 2850,
      minimum_stock_level: 1000,
      average_cost_per_unit: 142,
      last_purchase_price: 145,
      damaged_quantity: 12,
      supplier_id: 'sup-3',
      updated_at: isoTime(-120),
    },
    {
      id: 'rm-water',
      code: 'RM-WTR-01',
      name: 'RO Treated Mineral Water',
      category: 'Water',
      unit: 'LITRE',
      opening_stock: 42000,
      stock_received: 0,
      stock_consumed: 0,
      stock_adjusted: 0,
      current_stock: 42000,
      minimum_stock_level: 10000,
      average_cost_per_unit: 2.5,
      last_purchase_price: 2.5,
      damaged_quantity: 0,
      supplier_id: null,
      updated_at: isoTime(-120),
    },
    {
      id: 'rm-mango-pulp',
      code: 'RM-CON-MNG',
      name: 'Chaunsa Mango Pulp Concentrate',
      category: 'Concentrate',
      unit: 'KG',
      opening_stock: 920,
      stock_received: 0,
      stock_consumed: 0,
      stock_adjusted: 0,
      current_stock: 920,
      minimum_stock_level: 500,
      average_cost_per_unit: 380,
      last_purchase_price: 390,
      damaged_quantity: 5,
      supplier_id: 'sup-1',
      updated_at: isoTime(-120),
    },
    {
      id: 'rm-orange-conc',
      code: 'RM-CON-ORG',
      name: 'Kinnow Orange Concentrate',
      category: 'Concentrate',
      unit: 'KG',
      opening_stock: 185,
      stock_received: 0,
      stock_consumed: 0,
      stock_adjusted: 0,
      current_stock: 185, // Intentionally below minimum (350) to trigger genuine low-stock alert
      minimum_stock_level: 350,
      average_cost_per_unit: 440,
      last_purchase_price: 450,
      damaged_quantity: 0,
      supplier_id: 'sup-1',
      updated_at: isoTime(-120),
    },
    {
      id: 'rm-apple-conc',
      code: 'RM-CON-APL',
      name: 'Clear Apple Juice Concentrate',
      category: 'Concentrate',
      unit: 'KG',
      opening_stock: 540,
      stock_received: 0,
      stock_consumed: 0,
      stock_adjusted: 0,
      current_stock: 540,
      minimum_stock_level: 300,
      average_cost_per_unit: 460,
      last_purchase_price: 460,
      damaged_quantity: 0,
      supplier_id: 'sup-1',
      updated_at: isoTime(-120),
    },
    {
      id: 'rm-citric',
      code: 'RM-PRV-01',
      name: 'Citric Acid & Sodium Benzoate Blend',
      category: 'Preservative',
      unit: 'KG',
      opening_stock: 68,
      stock_received: 0,
      stock_consumed: 0,
      stock_adjusted: 0,
      current_stock: 68, // Below minimum (100) -> Low stock alert
      minimum_stock_level: 100,
      average_cost_per_unit: 620,
      last_purchase_price: 620,
      damaged_quantity: 0,
      supplier_id: 'sup-3',
      updated_at: isoTime(-120),
    },
    {
      id: 'rm-bottle-250',
      code: 'RM-BTL-250',
      name: '250ml PET Bottle Preform Blown',
      category: 'Bottle',
      unit: 'PIECES',
      opening_stock: 34000,
      stock_received: 0,
      stock_consumed: 0,
      stock_adjusted: 0,
      current_stock: 34000,
      minimum_stock_level: 12000,
      average_cost_per_unit: 11.5,
      last_purchase_price: 12,
      damaged_quantity: 140,
      supplier_id: 'sup-2',
      updated_at: isoTime(-120),
    },
    {
      id: 'rm-bottle-500',
      code: 'RM-BTL-500',
      name: '500ml PET Bottle Preform Blown',
      category: 'Bottle',
      unit: 'PIECES',
      opening_stock: 19500,
      stock_received: 0,
      stock_consumed: 0,
      stock_adjusted: 0,
      current_stock: 19500,
      minimum_stock_level: 8000,
      average_cost_per_unit: 17.5,
      last_purchase_price: 18,
      damaged_quantity: 60,
      supplier_id: 'sup-2',
      updated_at: isoTime(-120),
    },
    {
      id: 'rm-bottle-1000',
      code: 'RM-BTL-1000',
      name: '1L Family PET Bottle',
      category: 'Bottle',
      unit: 'PIECES',
      opening_stock: 9200,
      stock_received: 0,
      stock_consumed: 0,
      stock_adjusted: 0,
      current_stock: 9200,
      minimum_stock_level: 4000,
      average_cost_per_unit: 26,
      last_purchase_price: 26,
      damaged_quantity: 25,
      supplier_id: 'sup-2',
      updated_at: isoTime(-120),
    },
    {
      id: 'rm-caps',
      code: 'RM-CAP-28',
      name: '28mm Tamper-Evident Screw Caps',
      category: 'Cap',
      unit: 'PIECES',
      opening_stock: 68000,
      stock_received: 0,
      stock_consumed: 0,
      stock_adjusted: 0,
      current_stock: 68000,
      minimum_stock_level: 20000,
      average_cost_per_unit: 2.2,
      last_purchase_price: 2.2,
      damaged_quantity: 80,
      supplier_id: 'sup-2',
      updated_at: isoTime(-120),
    },
    {
      id: 'rm-labels',
      code: 'RM-LBL-ALL',
      name: 'BOPP Shrink Sleeve Labels',
      category: 'Label',
      unit: 'PIECES',
      opening_stock: 54000,
      stock_received: 0,
      stock_consumed: 0,
      stock_adjusted: 0,
      current_stock: 54000,
      minimum_stock_level: 15000,
      average_cost_per_unit: 3.1,
      last_purchase_price: 3.1,
      damaged_quantity: 200,
      supplier_id: 'sup-2',
      updated_at: isoTime(-120),
    },
    {
      id: 'rm-carton-box',
      code: 'RM-CTN-5PLY',
      name: '5-Ply Corrugated Master Carton & Shrink Film',
      category: 'Carton',
      unit: 'CARTONS',
      opening_stock: 3200,
      stock_received: 0,
      stock_consumed: 0,
      stock_adjusted: 0,
      current_stock: 3200,
      minimum_stock_level: 1000,
      average_cost_per_unit: 58,
      last_purchase_price: 60,
      damaged_quantity: 15,
      supplier_id: 'sup-2',
      updated_at: isoTime(-120),
    },
  ];

  // Product-specific BOM Recipes (not assuming identical recipe per product!)
  const recipes: Recipe[] = [
    {
      id: 'rcp-mango-250',
      product_id: 'prod-mango-250',
      product_name: 'Fruity Fun Mango Nectar 250ml',
      version: 'v2.1 (24x250ml = 6 Liters)',
      yield_cartons: 1,
      notes: 'Rich Chaunsa pulp formulation (22% pulp solids)',
      updated_at: isoTime(-5000),
      items: [
        { raw_material_id: 'rm-mango-pulp', raw_material_name: 'Chaunsa Mango Pulp Concentrate', unit: 'kg', quantity_per_carton: 0.85, wastage_allowance_pct: 1.5 },
        { raw_material_id: 'rm-sugar', raw_material_name: 'Refined Food Grade Sugar', unit: 'kg', quantity_per_carton: 0.72, wastage_allowance_pct: 1.0 },
        { raw_material_id: 'rm-water', raw_material_name: 'RO Treated Mineral Water', unit: 'liter', quantity_per_carton: 4.6, wastage_allowance_pct: 2.0 },
        { raw_material_id: 'rm-citric', raw_material_name: 'Citric Acid & Sodium Benzoate Blend', unit: 'kg', quantity_per_carton: 0.025, wastage_allowance_pct: 1.0 },
        { raw_material_id: 'rm-bottle-250', raw_material_name: '250ml PET Bottle Preform Blown', unit: 'piece', quantity_per_carton: 24, wastage_allowance_pct: 1.0 },
        { raw_material_id: 'rm-caps', raw_material_name: '28mm Tamper-Evident Screw Caps', unit: 'piece', quantity_per_carton: 24, wastage_allowance_pct: 1.0 },
        { raw_material_id: 'rm-labels', raw_material_name: 'BOPP Shrink Sleeve Labels', unit: 'piece', quantity_per_carton: 24, wastage_allowance_pct: 1.5 },
        { raw_material_id: 'rm-carton-box', raw_material_name: '5-Ply Corrugated Master Carton & Shrink Film', unit: 'carton', quantity_per_carton: 1, wastage_allowance_pct: 0.5 },
      ],
    },
    {
      id: 'rcp-orange-500',
      product_id: 'prod-orange-500',
      product_name: 'Fruity Fun Orange Citrus 500ml',
      version: 'v1.8 (12x500ml = 6 Liters)',
      yield_cartons: 1,
      notes: 'Kinnow citrus tangy blend with higher acidity balance',
      updated_at: isoTime(-5000),
      items: [
        { raw_material_id: 'rm-orange-conc', raw_material_name: 'Kinnow Orange Concentrate', unit: 'kg', quantity_per_carton: 0.65, wastage_allowance_pct: 1.5 },
        { raw_material_id: 'rm-sugar', raw_material_name: 'Refined Food Grade Sugar', unit: 'kg', quantity_per_carton: 0.78, wastage_allowance_pct: 1.0 },
        { raw_material_id: 'rm-water', raw_material_name: 'RO Treated Mineral Water', unit: 'liter', quantity_per_carton: 4.8, wastage_allowance_pct: 2.0 },
        { raw_material_id: 'rm-citric', raw_material_name: 'Citric Acid & Sodium Benzoate Blend', unit: 'kg', quantity_per_carton: 0.035, wastage_allowance_pct: 1.0 },
        { raw_material_id: 'rm-bottle-500', raw_material_name: '500ml PET Bottle Preform Blown', unit: 'piece', quantity_per_carton: 12, wastage_allowance_pct: 1.0 },
        { raw_material_id: 'rm-caps', raw_material_name: '28mm Tamper-Evident Screw Caps', unit: 'piece', quantity_per_carton: 12, wastage_allowance_pct: 1.0 },
        { raw_material_id: 'rm-labels', raw_material_name: 'BOPP Shrink Sleeve Labels', unit: 'piece', quantity_per_carton: 12, wastage_allowance_pct: 1.5 },
        { raw_material_id: 'rm-carton-box', raw_material_name: '5-Ply Corrugated Master Carton & Shrink Film', unit: 'carton', quantity_per_carton: 1, wastage_allowance_pct: 0.5 },
      ],
    },
    {
      id: 'rcp-apple-1000',
      product_id: 'prod-apple-1000',
      product_name: 'Fruity Fun Clear Apple 1L',
      version: 'v1.4 (6x1L = 6 Liters)',
      yield_cartons: 1,
      notes: 'Clarified apple nectar family pack',
      updated_at: isoTime(-5000),
      items: [
        { raw_material_id: 'rm-apple-conc', raw_material_name: 'Clear Apple Juice Concentrate', unit: 'kg', quantity_per_carton: 0.7, wastage_allowance_pct: 1.2 },
        { raw_material_id: 'rm-sugar', raw_material_name: 'Refined Food Grade Sugar', unit: 'kg', quantity_per_carton: 0.65, wastage_allowance_pct: 1.0 },
        { raw_material_id: 'rm-water', raw_material_name: 'RO Treated Mineral Water', unit: 'liter', quantity_per_carton: 4.9, wastage_allowance_pct: 2.0 },
        { raw_material_id: 'rm-citric', raw_material_name: 'Citric Acid & Sodium Benzoate Blend', unit: 'kg', quantity_per_carton: 0.02, wastage_allowance_pct: 1.0 },
        { raw_material_id: 'rm-bottle-1000', raw_material_name: '1L Family PET Bottle', unit: 'piece', quantity_per_carton: 6, wastage_allowance_pct: 1.0 },
        { raw_material_id: 'rm-caps', raw_material_name: '28mm Tamper-Evident Screw Caps', unit: 'piece', quantity_per_carton: 6, wastage_allowance_pct: 1.0 },
        { raw_material_id: 'rm-labels', raw_material_name: 'BOPP Shrink Sleeve Labels', unit: 'piece', quantity_per_carton: 6, wastage_allowance_pct: 1.5 },
        { raw_material_id: 'rm-carton-box', raw_material_name: '5-Ply Corrugated Master Carton & Shrink Film', unit: 'carton', quantity_per_carton: 1, wastage_allowance_pct: 0.5 },
      ],
    },
  ];

  const purchases: Purchase[] = [
    {
      id: 'pur-101',
      purchase_number: 'PO-2026-0101',
      supplier_id: 'sup-1',
      supplier_name: 'Punjab Agro Pulp & Concentrates Ltd',
      purchase_date: threeDaysAgo,
      total_amount: 390000,
      amount_paid: 245000,
      payment_status: 'PARTIAL',
      notes: '[DEMO SEED] Chaunsa Mango Pulp 1,000 kg delivery',
      created_by: 'user-owner-1',
      created_at: isoTime(-4320),
      items: [
        {
          id: 'pi-1',
          purchase_id: 'pur-101',
          raw_material_id: 'rm-mango-pulp',
          raw_material_name: 'Chaunsa Mango Pulp Concentrate',
          quantity: 1000,
          unit: 'kg',
          unit_price: 390,
          total_cost: 390000,
        },
      ],
    },
    {
      id: 'pur-102',
      purchase_number: 'PO-2026-0102',
      supplier_id: 'sup-2',
      supplier_name: 'Crystal PET Preforms & Packaging Co.',
      purchase_date: yesterday,
      total_amount: 240000,
      amount_paid: 155000,
      payment_status: 'PARTIAL',
      notes: '[DEMO SEED] 20,000 x 250ml PET bottles batch',
      created_by: 'user-prod-1',
      created_at: isoTime(-1440),
      items: [
        {
          id: 'pi-2',
          purchase_id: 'pur-102',
          raw_material_id: 'rm-bottle-250',
          raw_material_name: '250ml PET Bottle Preform Blown',
          quantity: 20000,
          unit: 'piece',
          unit_price: 12,
          total_cost: 240000,
        },
      ],
    },
  ];

  const machines: Machine[] = [
    {
      id: 'mach-1',
      machine_number: 'LINE-A-FILL-01',
      name: 'Rotary Hot-Fill Monoblock Filler (24-Head)',
      line_section: 'Filling & Capping Line A',
      status: 'Operational',
      last_serviced_date: sixDaysAgo,
      created_at: isoTime(-9000),
    },
    {
      id: 'mach-2',
      machine_number: 'LINE-B-PAST-02',
      name: 'Tubular UHT Pasteurizer & Homogenizer',
      line_section: 'Blending & Thermal Processing',
      status: 'Operational',
      last_serviced_date: threeDaysAgo,
      created_at: isoTime(-9000),
    },
    {
      id: 'mach-3',
      machine_number: 'LINE-C-SHRK-03',
      name: 'Steam Tunnel Sleeve Labeler & Shrink Wrapper',
      line_section: 'Packaging & Carton Line',
      status: 'Under Maintenance',
      last_serviced_date: yesterday,
      created_at: isoTime(-9000),
    },
  ];

  const maintenance_records: MaintenanceRecord[] = [
    {
      id: 'maint-1',
      ticket_number: 'MNT-2026-001',
      machine_id: 'mach-3',
      machine_name: 'Steam Tunnel Sleeve Labeler & Shrink Wrapper',
      machine_number: 'LINE-C-SHRK-03',
      problem_description: 'Steam nozzle pressure fluctuation causing uneven sleeve shrink on 500ml bottles',
      issue_date: today,
      priority: 'High',
      status: 'In Progress',
      repair_notes: 'Solenoid valve seal replacement underway by technician',
      maintenance_cost: 18500,
      reported_by_id: 'user-prod-1',
      reported_by_name: 'Engr. Salman Nadeem (Production Manager)',
      created_at: isoTime(-180),
    },
  ];

  const production_batches: ProductionBatch[] = [
    {
      id: 'batch-1001',
      batch_number: 'BATCH-MNG-261101',
      production_date: threeDaysAgo,
      product_id: 'prod-mango-250',
      product_name: 'Fruity Fun Mango Nectar 250ml',
      flavour_name: 'Mango',
      bottle_size_label: '250ml',
      packaging_type_name: 'PET Bottle Carton (24x)',
      units_per_carton: 24,
      target_cartons: 450,
      actual_cartons: 440,
      wastage_cartons: 6,
      damaged_units: 18,
      machine_id: 'mach-1',
      machine_name: 'Rotary Hot-Fill Monoblock Filler (24-Head)',
      status: 'Completed',
      inventory_posted: true,
      verified_by: 'user-prod-1',
      verified_at: isoTime(-4000),
      total_production_cost: 400400,
      cost_per_carton: 910,
      remarks: '[DEMO SEED] Verified high-brix Chaunsa batch',
      created_by: 'user-prod-1',
      created_at: isoTime(-4200),
      updated_at: isoTime(-4000),
      material_usage: [
        { raw_material_id: 'rm-mango-pulp', raw_material_name: 'Chaunsa Mango Pulp Concentrate', unit: 'kg', estimated_quantity: 382.5, actual_quantity: 379, unit_cost_snapshot: 380, total_cost: 144020 },
        { raw_material_id: 'rm-sugar', raw_material_name: 'Refined Food Grade Sugar', unit: 'kg', estimated_quantity: 324, actual_quantity: 320, unit_cost_snapshot: 142, total_cost: 45440 },
      ],
    },
    {
      id: 'batch-1002',
      batch_number: 'BATCH-ORG-261102',
      production_date: yesterday,
      product_id: 'prod-orange-500',
      product_name: 'Fruity Fun Orange Citrus 500ml',
      flavour_name: 'Orange',
      bottle_size_label: '500ml',
      packaging_type_name: 'PET Bottle Carton (12x)',
      units_per_carton: 12,
      target_cartons: 300,
      actual_cartons: 295,
      wastage_cartons: 4,
      damaged_units: 12,
      machine_id: 'mach-2',
      machine_name: 'Tubular UHT Pasteurizer & Homogenizer',
      status: 'Completed',
      inventory_posted: true,
      verified_by: 'user-prod-1',
      verified_at: isoTime(-1200),
      total_production_cost: 244850,
      cost_per_carton: 830,
      remarks: '[DEMO SEED] Yesterday verified batch',
      created_by: 'user-prod-1',
      created_at: isoTime(-1400),
      updated_at: isoTime(-1200),
      material_usage: [],
    },
    {
      id: 'batch-1003',
      batch_number: 'BATCH-MNG-261103',
      production_date: today,
      product_id: 'prod-mango-250',
      product_name: 'Fruity Fun Mango Nectar 250ml',
      flavour_name: 'Mango',
      bottle_size_label: '250ml',
      packaging_type_name: 'PET Bottle Carton (24x)',
      units_per_carton: 24,
      target_cartons: 350,
      actual_cartons: 345,
      wastage_cartons: 3,
      damaged_units: 9,
      machine_id: 'mach-1',
      machine_name: 'Rotary Hot-Fill Monoblock Filler (24-Head)',
      status: 'Completed',
      inventory_posted: true,
      verified_by: 'user-prod-1',
      verified_at: isoTime(-90),
      total_production_cost: 313950,
      cost_per_carton: 910,
      remarks: '[DEMO SEED] Morning shift completed & verified',
      created_by: 'user-prod-1',
      created_at: isoTime(-240),
      updated_at: isoTime(-90),
      material_usage: [],
    },
    {
      id: 'batch-1004',
      batch_number: 'BATCH-APL-261103B',
      production_date: today,
      product_id: 'prod-apple-1000',
      product_name: 'Fruity Fun Clear Apple 1L',
      flavour_name: 'Apple',
      bottle_size_label: '1L',
      packaging_type_name: 'Family Pack Carton (6x)',
      units_per_carton: 6,
      target_cartons: 250,
      actual_cartons: 140,
      wastage_cartons: 2,
      damaged_units: 4,
      machine_id: 'mach-2',
      machine_name: 'Tubular UHT Pasteurizer & Homogenizer',
      status: 'In Progress',
      inventory_posted: false,
      total_production_cost: 110600,
      cost_per_carton: 790,
      remarks: 'Afternoon shift actively running on Line B',
      created_by: 'user-prod-1',
      created_at: isoTime(-60),
      updated_at: isoTime(-15),
      material_usage: [],
    },
  ];

  // Formula strictly enforced:
  // Opening Stock + Verified Production + Approved Returns - Dispatches - Damage = Closing Stock
  const finished_goods: FinishedGoodsInventory[] = [
    {
      id: 'fg-mango-250',
      product_id: 'prod-mango-250',
      product_name: 'Fruity Fun Mango Nectar 250ml',
      sku: 'FF-MNG-250',
      flavour_name: 'Mango',
      bottle_size_label: '250ml',
      packaging_type_name: 'PET Bottle Carton (24x)',
      units_per_carton: 24,
      opening_stock_cartons: 300,
      verified_production_cartons: 785, // 440 + 345
      approved_returns_cartons: 10,
      dispatched_cartons: 420,
      damaged_cartons: 5,
      closing_stock_cartons: 670, // 300 + 785 + 10 - 420 - 5 = 670
      reserved_cartons: 80,
      available_cartons: 590,     // 670 - 80 = 590
      latest_batch_number: 'BATCH-MNG-261103',
      latest_production_date: today,
      valuation_per_carton: 910,
      updated_at: isoTime(-90),
    },
    {
      id: 'fg-orange-500',
      product_id: 'prod-orange-500',
      product_name: 'Fruity Fun Orange Citrus 500ml',
      sku: 'FF-ORG-500',
      flavour_name: 'Orange',
      bottle_size_label: '500ml',
      packaging_type_name: 'PET Bottle Carton (12x)',
      units_per_carton: 12,
      opening_stock_cartons: 200,
      verified_production_cartons: 295,
      approved_returns_cartons: 0,
      dispatched_cartons: 210,
      damaged_cartons: 5,
      closing_stock_cartons: 280, // 200 + 295 + 0 - 210 - 5 = 280
      reserved_cartons: 40,
      available_cartons: 240,
      latest_batch_number: 'BATCH-ORG-261102',
      latest_production_date: yesterday,
      valuation_per_carton: 830,
      updated_at: isoTime(-120),
    },
    {
      id: 'fg-apple-1000',
      product_id: 'prod-apple-1000',
      product_name: 'Fruity Fun Clear Apple 1L',
      sku: 'FF-APL-1000',
      flavour_name: 'Apple',
      bottle_size_label: '1L',
      packaging_type_name: 'Family Pack Carton (6x)',
      units_per_carton: 6,
      opening_stock_cartons: 180,
      verified_production_cartons: 120,
      approved_returns_cartons: 5,
      dispatched_cartons: 140,
      damaged_cartons: 2,
      closing_stock_cartons: 163, // 180 + 120 + 5 - 140 - 2 = 163
      reserved_cartons: 20,
      available_cartons: 143,
      latest_batch_number: 'BATCH-APL-261029',
      latest_production_date: sixDaysAgo,
      valuation_per_carton: 790,
      updated_at: isoTime(-300),
    },
    {
      id: 'fg-guava-250',
      product_id: 'prod-guava-250',
      product_name: 'Fruity Fun Pink Guava 250ml',
      sku: 'FF-GVA-250',
      flavour_name: 'Guava',
      bottle_size_label: '250ml',
      packaging_type_name: 'PET Bottle Carton (24x)',
      units_per_carton: 24,
      opening_stock_cartons: 150,
      verified_production_cartons: 110,
      approved_returns_cartons: 0,
      dispatched_cartons: 195,
      damaged_cartons: 3,
      closing_stock_cartons: 62, // Below min_stock_cartons (75) -> triggers low FG stock warning!
      reserved_cartons: 10,
      available_cartons: 52,
      latest_batch_number: 'BATCH-GVA-261028',
      latest_production_date: sixDaysAgo,
      valuation_per_carton: 880,
      updated_at: isoTime(-500),
    },
    {
      id: 'fg-mixed-500',
      product_id: 'prod-mixed-500',
      product_name: 'Fruity Fun Mixed Fruit Punch 500ml',
      sku: 'FF-MXF-500',
      flavour_name: 'Mixed Fruit',
      bottle_size_label: '500ml',
      packaging_type_name: 'PET Bottle Carton (12x)',
      units_per_carton: 12,
      opening_stock_cartons: 160,
      verified_production_cartons: 140,
      approved_returns_cartons: 0,
      dispatched_cartons: 110,
      damaged_cartons: 0,
      closing_stock_cartons: 190,
      reserved_cartons: 0,
      available_cartons: 190,
      latest_batch_number: 'BATCH-MXF-261030',
      latest_production_date: threeDaysAgo,
      valuation_per_carton: 870,
      updated_at: isoTime(-400),
    },
  ];

  // Dealers named Ahmed, Bilal, Ali, etc. so voice commands ("Ahmed ko 50 hazar rupay diye",
  // "Bilal se 80 hazar lene hain", "Ali ko mango juice ke 100 cartons diye") resolve against real entities!
  const dealers: Dealer[] = [
    {
      id: 'dlr-ahmed',
      code: 'DLR-001',
      dealer_name: 'Ahmed Hassan',
      shop_name: 'Ahmed Cash & Carry Wholesale',
      contact_number: '+92-300-4112299',
      address: 'Main Boulevard Gulberg III, Near Liberty Roundabout, Lahore',
      area_id: 'area-gulberg',
      area_name: 'Gulberg & Liberty Zone',
      assigned_booker_id: 'user-booker-1',
      assigned_booker_name: 'Usman Tariq (Booker)',
      opening_balance: 120000,
      credit_limit: 500000,
      outstanding_balance: 184000,
      latitude: 31.5102,
      longitude: 74.3441,
      geofence_radius_meters: 120,
      is_active: true,
      created_at: isoTime(-9000),
    },
    {
      id: 'dlr-bilal',
      code: 'DLR-002',
      dealer_name: 'Bilal Sheikh',
      shop_name: 'Bilal Beverages & Traders',
      contact_number: '+92-321-9887766',
      address: 'Hali Road Commercial Market, Gulberg II, Lahore',
      area_id: 'area-gulberg',
      area_name: 'Gulberg & Liberty Zone',
      assigned_booker_id: 'user-booker-1',
      assigned_booker_name: 'Usman Tariq (Booker)',
      opening_balance: 95000,
      credit_limit: 400000,
      outstanding_balance: 267000,
      latitude: 31.5228,
      longitude: 74.3495,
      geofence_radius_meters: 100,
      is_active: true,
      created_at: isoTime(-9000),
    },
    {
      id: 'dlr-ali',
      code: 'DLR-003',
      dealer_name: 'Ali Raza',
      shop_name: 'Ali Super Store & Juice Agency',
      contact_number: '+92-333-4556677',
      address: 'Block G-1 Market, Johar Town, Lahore',
      area_id: 'area-johar',
      area_name: 'Johar Town & Model Town',
      assigned_booker_id: 'user-booker-2',
      assigned_booker_name: 'Kamran Raza (Booker)',
      opening_balance: 60000,
      credit_limit: 350000,
      outstanding_balance: 138000,
      latitude: 31.4697,
      longitude: 74.2728,
      geofence_radius_meters: 110,
      is_active: true,
      created_at: isoTime(-9000),
    },
    {
      id: 'dlr-madina',
      code: 'DLR-004',
      dealer_name: 'Chaudhry Naveed',
      shop_name: 'Al-Madina Mart & Distributors',
      contact_number: '+92-302-4433221',
      address: 'Bank Square Market, Model Town C-Block, Lahore',
      area_id: 'area-johar',
      area_name: 'Johar Town & Model Town',
      assigned_booker_id: 'user-booker-2',
      assigned_booker_name: 'Kamran Raza (Booker)',
      opening_balance: 50000,
      credit_limit: 300000,
      outstanding_balance: 74000,
      latitude: 31.4839,
      longitude: 74.3261,
      geofence_radius_meters: 100,
      is_active: true,
      created_at: isoTime(-9000),
    },
    {
      id: 'dlr-defence',
      code: 'DLR-005',
      dealer_name: 'Salman Ghani',
      shop_name: 'Defence Gourmet & Beverage Hub',
      contact_number: '+92-300-8899001',
      address: 'Y-Block Commercial, Phase 3 DHA, Lahore',
      area_id: 'area-dha',
      area_name: 'DHA & Cantt Commercial',
      assigned_booker_id: 'user-booker-1',
      assigned_booker_name: 'Usman Tariq (Booker)',
      opening_balance: 0,
      credit_limit: 600000,
      outstanding_balance: 114000,
      latitude: 31.4722,
      longitude: 74.3765,
      geofence_radius_meters: 120,
      is_active: true,
      created_at: isoTime(-9000),
    },
  ];

  const orders: Order[] = [
    {
      id: 'ord-501',
      order_number: 'ORD-2026-0501',
      idempotency_key: 'seed-ord-501',
      dealer_id: 'dlr-ahmed',
      dealer_name: 'Ahmed Hassan',
      shop_name: 'Ahmed Cash & Carry Wholesale',
      area_id: 'area-gulberg',
      area_name: 'Gulberg & Liberty Zone',
      booker_id: 'user-booker-1',
      booker_name: 'Usman Tariq (Booker)',
      order_date: threeDaysAgo,
      status: 'Delivered',
      payment_status: 'Partially Paid',
      subtotal_amount: 198000,
      discount_total: 4000,
      total_amount: 194000,
      amount_paid_on_order: 130000,
      total_cogs: 136500,
      delivery_notes: '[DEMO SEED] Delivered via Mazda Loader LHR-9921',
      approved_by: 'user-owner-1',
      dispatched_at: isoTime(-4100),
      delivered_at: isoTime(-3900),
      created_at: isoTime(-4200),
      updated_at: isoTime(-3900),
      items: [
        {
          id: 'oi-1',
          product_id: 'prod-mango-250',
          product_name: 'Fruity Fun Mango Nectar 250ml',
          flavour_name: 'Mango',
          bottle_size_label: '250ml',
          quantity_cartons: 150,
          rate_per_carton: 1320,
          discount_amount: 4000,
          cogs_per_carton_snapshot: 910,
          line_total: 194000,
        },
      ],
    },
    {
      id: 'ord-502',
      order_number: 'ORD-2026-0502',
      idempotency_key: 'seed-ord-502',
      dealer_id: 'dlr-bilal',
      dealer_name: 'Bilal Sheikh',
      shop_name: 'Bilal Beverages & Traders',
      area_id: 'area-gulberg',
      area_name: 'Gulberg & Liberty Zone',
      booker_id: 'user-booker-1',
      booker_name: 'Usman Tariq (Booker)',
      order_date: yesterday,
      status: 'Dispatched',
      payment_status: 'Unpaid (Credit)',
      subtotal_amount: 252000,
      discount_total: 0,
      total_amount: 252000,
      amount_paid_on_order: 80000,
      total_cogs: 174500,
      delivery_notes: '[DEMO SEED] Credit order approved by Owner',
      approved_by: 'user-owner-1',
      dispatched_at: isoTime(-1100),
      created_at: isoTime(-1300),
      updated_at: isoTime(-1100),
      items: [
        {
          id: 'oi-2',
          product_id: 'prod-mango-250',
          product_name: 'Fruity Fun Mango Nectar 250ml',
          flavour_name: 'Mango',
          bottle_size_label: '250ml',
          quantity_cartons: 100,
          rate_per_carton: 1320,
          discount_amount: 0,
          cogs_per_carton_snapshot: 910,
          line_total: 132000,
        },
        {
          id: 'oi-3',
          product_id: 'prod-orange-500',
          product_name: 'Fruity Fun Orange Citrus 500ml',
          flavour_name: 'Orange',
          bottle_size_label: '500ml',
          quantity_cartons: 100,
          rate_per_carton: 1200,
          discount_amount: 0,
          cogs_per_carton_snapshot: 835,
          line_total: 120000,
        },
      ],
    },
    {
      id: 'ord-503',
      order_number: 'ORD-2026-0503',
      idempotency_key: 'seed-ord-503',
      dealer_id: 'dlr-ali',
      dealer_name: 'Ali Raza',
      shop_name: 'Ali Super Store & Juice Agency',
      area_id: 'area-johar',
      area_name: 'Johar Town & Model Town',
      booker_id: 'user-booker-2',
      booker_name: 'Kamran Raza (Booker)',
      order_date: today,
      status: 'Delivered',
      payment_status: 'Partially Paid',
      subtotal_amount: 180000,
      discount_total: 2000,
      total_amount: 178000,
      amount_paid_on_order: 100000,
      total_cogs: 123600,
      delivery_notes: '[DEMO SEED] Morning Johar Town route delivery',
      approved_by: 'user-owner-1',
      dispatched_at: isoTime(-180),
      delivered_at: isoTime(-110),
      created_at: isoTime(-210),
      updated_at: isoTime(-110),
      items: [
        {
          id: 'oi-4',
          product_id: 'prod-orange-500',
          product_name: 'Fruity Fun Orange Citrus 500ml',
          flavour_name: 'Orange',
          bottle_size_label: '500ml',
          quantity_cartons: 80,
          rate_per_carton: 1200,
          discount_amount: 1000,
          cogs_per_carton_snapshot: 830,
          line_total: 95000,
        },
        {
          id: 'oi-5',
          product_id: 'prod-apple-1000',
          product_name: 'Fruity Fun Clear Apple 1L',
          flavour_name: 'Apple',
          bottle_size_label: '1L',
          quantity_cartons: 73,
          rate_per_carton: 1150.68,
          discount_amount: 1000,
          cogs_per_carton_snapshot: 790,
          line_total: 83000,
        },
      ],
    },
    {
      id: 'ord-504',
      order_number: 'ORD-2026-0504',
      idempotency_key: 'seed-ord-504',
      dealer_id: 'dlr-defence',
      dealer_name: 'Salman Ghani',
      shop_name: 'Defence Gourmet & Beverage Hub',
      area_id: 'area-dha',
      area_name: 'DHA & Cantt Commercial',
      booker_id: 'user-booker-1',
      booker_name: 'Usman Tariq (Booker)',
      order_date: today,
      status: 'Approved',
      payment_status: 'Unpaid (Credit)',
      subtotal_amount: 153600,
      discount_total: 0,
      total_amount: 153600,
      amount_paid_on_order: 0,
      total_cogs: 106000,
      delivery_notes: 'Approved & stock reserved, awaiting loading bay dispatch',
      approved_by: 'user-owner-1',
      created_at: isoTime(-80),
      updated_at: isoTime(-60),
      items: [
        {
          id: 'oi-6',
          product_id: 'prod-mango-250',
          product_name: 'Fruity Fun Mango Nectar 250ml',
          flavour_name: 'Mango',
          bottle_size_label: '250ml',
          quantity_cartons: 80,
          rate_per_carton: 1320,
          discount_amount: 0,
          cogs_per_carton_snapshot: 910,
          line_total: 105600,
        },
        {
          id: 'oi-7',
          product_id: 'prod-orange-500',
          product_name: 'Fruity Fun Orange Citrus 500ml',
          flavour_name: 'Orange',
          bottle_size_label: '500ml',
          quantity_cartons: 40,
          rate_per_carton: 1200,
          discount_amount: 0,
          cogs_per_carton_snapshot: 830,
          line_total: 48000,
        },
      ],
    },
    {
      id: 'ord-505',
      order_number: 'ORD-2026-0505',
      idempotency_key: 'seed-ord-505',
      dealer_id: 'dlr-madina',
      dealer_name: 'Chaudhry Naveed',
      shop_name: 'Al-Madina Mart & Distributors',
      area_id: 'area-johar',
      area_name: 'Johar Town & Model Town',
      booker_id: 'user-booker-2',
      booker_name: 'Kamran Raza (Booker)',
      order_date: today,
      status: 'Pending',
      payment_status: 'Unpaid (Credit)',
      subtotal_amount: 89600,
      discount_total: 0,
      total_amount: 89600,
      amount_paid_on_order: 0,
      total_cogs: 61600,
      delivery_notes: 'Submitted from Booker Android App - awaiting Owner approval',
      created_at: isoTime(-25),
      updated_at: isoTime(-25),
      items: [
        {
          id: 'oi-8',
          product_id: 'prod-guava-250',
          product_name: 'Fruity Fun Pink Guava 250ml',
          flavour_name: 'Guava',
          bottle_size_label: '250ml',
          quantity_cartons: 70,
          rate_per_carton: 1280,
          discount_amount: 0,
          cogs_per_carton_snapshot: 880,
          line_total: 89600,
        },
      ],
    },
  ];

  const dealer_ledger: DealerLedgerEntry[] = [
    {
      id: 'ldg-1',
      dealer_id: 'dlr-ahmed',
      dealer_name: 'Ahmed Hassan',
      shop_name: 'Ahmed Cash & Carry Wholesale',
      date: sixDaysAgo,
      description: 'Opening Balance Brought Forward',
      entry_type: 'OPENING_BALANCE',
      debit: 120000,
      credit: 0,
      balance: 120000,
      reference_number: 'OB-DLR-001',
      payment_method: 'Credit',
      created_by: 'user-owner-1',
      created_at: isoTime(-8600),
    },
    {
      id: 'ldg-2',
      dealer_id: 'dlr-ahmed',
      dealer_name: 'Ahmed Hassan',
      shop_name: 'Ahmed Cash & Carry Wholesale',
      date: threeDaysAgo,
      description: 'Sales Invoice ORD-2026-0501 (150 Cartons Mango 250ml)',
      entry_type: 'SALES_INVOICE',
      debit: 194000,
      credit: 0,
      balance: 314000,
      reference_number: 'ORD-2026-0501',
      payment_method: 'Credit',
      created_by: 'user-owner-1',
      created_at: isoTime(-4100),
    },
    {
      id: 'ldg-3',
      dealer_id: 'dlr-ahmed',
      dealer_name: 'Ahmed Hassan',
      shop_name: 'Ahmed Cash & Carry Wholesale',
      date: threeDaysAgo,
      description: 'Payment Received via Bank Transfer (HBL)',
      entry_type: 'PAYMENT_RECEIVED',
      debit: 0,
      credit: 130000,
      balance: 184000,
      reference_number: 'RCPT-2026-001',
      payment_method: 'Bank Transfer',
      created_by: 'user-booker-1',
      created_at: isoTime(-3950),
    },
    {
      id: 'ldg-4',
      dealer_id: 'dlr-bilal',
      dealer_name: 'Bilal Sheikh',
      shop_name: 'Bilal Beverages & Traders',
      date: sixDaysAgo,
      description: 'Opening Balance Brought Forward',
      entry_type: 'OPENING_BALANCE',
      debit: 95000,
      credit: 0,
      balance: 95000,
      reference_number: 'OB-DLR-002',
      payment_method: 'Credit',
      created_by: 'user-owner-1',
      created_at: isoTime(-8600),
    },
    {
      id: 'ldg-5',
      dealer_id: 'dlr-bilal',
      dealer_name: 'Bilal Sheikh',
      shop_name: 'Bilal Beverages & Traders',
      date: yesterday,
      description: 'Sales Invoice ORD-2026-0502 (200 Cartons Assorted)',
      entry_type: 'SALES_INVOICE',
      debit: 252000,
      credit: 0,
      balance: 347000,
      reference_number: 'ORD-2026-0502',
      payment_method: 'Credit',
      created_by: 'user-owner-1',
      created_at: isoTime(-1100),
    },
    {
      id: 'ldg-6',
      dealer_id: 'dlr-bilal',
      dealer_name: 'Bilal Sheikh',
      shop_name: 'Bilal Beverages & Traders',
      date: yesterday,
      description: 'Cash Collection by Booker Usman Tariq',
      entry_type: 'PAYMENT_RECEIVED',
      debit: 0,
      credit: 80000,
      balance: 267000,
      reference_number: 'RCPT-2026-002',
      payment_method: 'Cash',
      created_by: 'user-booker-1',
      created_at: isoTime(-1050),
    },
    {
      id: 'ldg-7',
      dealer_id: 'dlr-ali',
      dealer_name: 'Ali Raza',
      shop_name: 'Ali Super Store & Juice Agency',
      date: sixDaysAgo,
      description: 'Opening Balance Brought Forward',
      entry_type: 'OPENING_BALANCE',
      debit: 60000,
      credit: 0,
      balance: 60000,
      reference_number: 'OB-DLR-003',
      payment_method: 'Credit',
      created_by: 'user-owner-1',
      created_at: isoTime(-8600),
    },
    {
      id: 'ldg-8',
      dealer_id: 'dlr-ali',
      dealer_name: 'Ali Raza',
      shop_name: 'Ali Super Store & Juice Agency',
      date: today,
      description: 'Sales Invoice ORD-2026-0503 (153 Cartons Orange & Apple)',
      entry_type: 'SALES_INVOICE',
      debit: 178000,
      credit: 0,
      balance: 238000,
      reference_number: 'ORD-2026-0503',
      payment_method: 'Credit',
      created_by: 'user-owner-1',
      created_at: isoTime(-180),
    },
    {
      id: 'ldg-9',
      dealer_id: 'dlr-ali',
      dealer_name: 'Ali Raza',
      shop_name: 'Ali Super Store & Juice Agency',
      date: today,
      description: 'Cash Collection by Booker Kamran Raza',
      entry_type: 'PAYMENT_RECEIVED',
      debit: 0,
      credit: 100000,
      balance: 138000,
      reference_number: 'RCPT-2026-003',
      payment_method: 'Cash',
      created_by: 'user-booker-2',
      created_at: isoTime(-100),
    },
  ];

  const payments: PaymentRecord[] = [
    {
      id: 'pay-1',
      receipt_number: 'RCPT-2026-001',
      dealer_id: 'dlr-ahmed',
      dealer_name: 'Ahmed Hassan',
      shop_name: 'Ahmed Cash & Carry Wholesale',
      collected_by_id: 'user-booker-1',
      collected_by_name: 'Usman Tariq (Booker)',
      payment_date: threeDaysAgo,
      amount: 130000,
      direction: 'INCOMING_FROM_DEALER',
      payment_method: 'Bank Transfer',
      reference_number: 'HBL-TXN-882910',
      order_id: 'ord-501',
      ledger_entry_id: 'ldg-3',
      is_reversed: false,
      notes: 'Verified in factory HBL account',
      created_at: isoTime(-3950),
    },
    {
      id: 'pay-2',
      receipt_number: 'RCPT-2026-002',
      dealer_id: 'dlr-bilal',
      dealer_name: 'Bilal Sheikh',
      shop_name: 'Bilal Beverages & Traders',
      collected_by_id: 'user-booker-1',
      collected_by_name: 'Usman Tariq (Booker)',
      payment_date: yesterday,
      amount: 80000,
      direction: 'INCOMING_FROM_DEALER',
      payment_method: 'Cash',
      reference_number: 'CSH-SLIP-441',
      order_id: 'ord-502',
      ledger_entry_id: 'ldg-6',
      is_reversed: false,
      notes: 'Handed over to factory cashier',
      created_at: isoTime(-1050),
    },
    {
      id: 'pay-3',
      receipt_number: 'RCPT-2026-003',
      dealer_id: 'dlr-ali',
      dealer_name: 'Ali Raza',
      shop_name: 'Ali Super Store & Juice Agency',
      collected_by_id: 'user-booker-2',
      collected_by_name: 'Kamran Raza (Booker)',
      payment_date: today,
      amount: 100000,
      direction: 'INCOMING_FROM_DEALER',
      payment_method: 'Cash',
      reference_number: 'CSH-SLIP-489',
      order_id: 'ord-503',
      ledger_entry_id: 'ldg-9',
      is_reversed: false,
      notes: 'Collected on delivery in Johar Town',
      created_at: isoTime(-100),
    },
  ];

  const expenses: Expense[] = [
    {
      id: 'exp-1',
      expense_number: 'EXP-2026-001',
      category: 'Electricity',
      amount: 62000,
      date: threeDaysAgo,
      description: 'LESCO Industrial 3-Phase Transformer Feeder Bill',
      payment_method: 'Bank Transfer',
      receipt_attachment_url: '/receipts/lesco-industrial-bill.pdf',
      created_by_id: 'user-owner-1',
      created_by_name: 'Sikandar Raja',
      approval_status: 'Approved',
      approved_by: 'user-owner-1',
      approved_at: isoTime(-4100),
      created_at: isoTime(-4150),
    },
    {
      id: 'exp-2',
      expense_number: 'EXP-2026-002',
      category: 'Fuel',
      amount: 24500,
      date: yesterday,
      description: 'Diesel for Delivery Loader LHR-9921 & Standby Generator',
      payment_method: 'Cash',
      receipt_attachment_url: '/receipts/pso-diesel-slip.jpg',
      created_by_id: 'user-prod-1',
      created_by_name: 'Engr. Salman Nadeem (Production Manager)',
      approval_status: 'Approved',
      approved_by: 'user-owner-1',
      approved_at: isoTime(-1100),
      created_at: isoTime(-1300),
    },
    {
      id: 'exp-3',
      expense_number: 'EXP-2026-003',
      category: 'Machine maintenance',
      amount: 18500,
      date: today,
      description: 'Steam Tunnel Sleeve Labeler Solenoid Valve & High-Temp Seals',
      payment_method: 'Cash',
      receipt_attachment_url: '/receipts/solenoid-valve-invoice.pdf',
      created_by_id: 'user-prod-1',
      created_by_name: 'Engr. Salman Nadeem (Production Manager)',
      approval_status: 'Pending',
      created_at: isoTime(-175),
    },
  ];

  const location_points: LocationPoint[] = [
    {
      id: 'loc-1',
      booker_id: 'user-booker-1',
      booker_name: 'Usman Tariq (Booker)',
      latitude: 31.5050,
      longitude: 74.3400,
      accuracy_meters: 8.5,
      speed_kmh: 24.0,
      battery_pct: 91,
      is_moving: true,
      is_mock_location: false,
      recorded_at: isoTime(-180),
      synced_from_offline_queue: false,
    },
    {
      id: 'loc-2',
      booker_id: 'user-booker-1',
      booker_name: 'Usman Tariq (Booker)',
      latitude: 31.5101,
      longitude: 74.3440,
      accuracy_meters: 6.2,
      speed_kmh: 0.0,
      battery_pct: 87,
      is_moving: false,
      is_mock_location: false,
      recorded_at: isoTime(-120),
      synced_from_offline_queue: false,
    },
    {
      id: 'loc-3',
      booker_id: 'user-booker-1',
      booker_name: 'Usman Tariq (Booker)',
      latitude: 31.5227,
      longitude: 74.3494,
      accuracy_meters: 7.0,
      speed_kmh: 12.4,
      battery_pct: 82,
      is_moving: true,
      is_mock_location: false,
      recorded_at: isoTime(-10),
      synced_from_offline_queue: false,
    },
    {
      id: 'loc-4',
      booker_id: 'user-booker-2',
      booker_name: 'Kamran Raza (Booker)',
      latitude: 31.4698,
      longitude: 74.2729,
      accuracy_meters: 9.1,
      speed_kmh: 0.0,
      battery_pct: 79,
      is_moving: false,
      is_mock_location: false,
      recorded_at: isoTime(-140),
      synced_from_offline_queue: false,
    },
    {
      id: 'loc-5',
      booker_id: 'user-booker-2',
      booker_name: 'Kamran Raza (Booker)',
      latitude: 31.4838,
      longitude: 74.3260,
      accuracy_meters: 5.8,
      speed_kmh: 18.5,
      battery_pct: 74,
      is_moving: true,
      is_mock_location: false,
      recorded_at: isoTime(-6),
      synced_from_offline_queue: false,
    },
  ];

  const shop_visits: ShopVisit[] = [
    {
      id: 'vis-1',
      booker_id: 'user-booker-1',
      booker_name: 'Usman Tariq (Booker)',
      dealer_id: 'dlr-ahmed',
      shop_name: 'Ahmed Cash & Carry Wholesale',
      area_name: 'Gulberg & Liberty Zone',
      visit_date: today,
      arrival_time: isoTime(-135),
      departure_time: isoTime(-108),
      duration_minutes: 27,
      gps_accuracy_meters: 6.2,
      verification_type: 'BOTH_VERIFIED',
      order_placed: false,
      collection_made: false,
      collection_amount: 0,
      latitude: 31.5101,
      longitude: 74.3440,
      notes: 'Checked shelf stock & cooler placement; next order tomorrow',
    },
    {
      id: 'vis-2',
      booker_id: 'user-booker-1',
      booker_name: 'Usman Tariq (Booker)',
      dealer_id: 'dlr-bilal',
      shop_name: 'Bilal Beverages & Traders',
      area_name: 'Gulberg & Liberty Zone',
      visit_date: today,
      arrival_time: isoTime(-45),
      departure_time: isoTime(-12),
      duration_minutes: 33,
      gps_accuracy_meters: 7.0,
      verification_type: 'GPS_GEOFENCE_DETECTED',
      order_placed: false,
      collection_made: false,
      collection_amount: 0,
      latitude: 31.5227,
      longitude: 74.3494,
      notes: 'Auto-detected via 100m shop geofence radius',
    },
    {
      id: 'vis-3',
      booker_id: 'user-booker-2',
      booker_name: 'Kamran Raza (Booker)',
      dealer_id: 'dlr-ali',
      shop_name: 'Ali Super Store & Juice Agency',
      area_name: 'Johar Town & Model Town',
      visit_date: today,
      arrival_time: isoTime(-160),
      departure_time: isoTime(-115),
      duration_minutes: 45,
      gps_accuracy_meters: 9.1,
      verification_type: 'BOTH_VERIFIED',
      order_placed: true,
      order_id: 'ord-503',
      collection_made: true,
      collection_amount: 100000,
      latitude: 31.4698,
      longitude: 74.2729,
      notes: 'Booked 153 cartons and collected PKR 100,000 cash',
    },
  ];

  const inventory_movements: InventoryMovement[] = [
    {
      id: 'mov-1',
      item_type: 'FINISHED_GOOD',
      item_id: 'prod-mango-250',
      item_name: 'Fruity Fun Mango Nectar 250ml',
      batch_number: 'BATCH-MNG-261101',
      movement_type: 'PRODUCTION_VERIFIED',
      quantity_change: 440,
      balance_after: 740,
      reference_type: 'BATCH',
      reference_id: 'BATCH-MNG-261101',
      notes: 'Verified production batch added to finished goods',
      performed_by: 'Engr. Salman Nadeem',
      created_at: isoTime(-4000),
    },
    {
      id: 'mov-2',
      item_type: 'FINISHED_GOOD',
      item_id: 'prod-mango-250',
      item_name: 'Fruity Fun Mango Nectar 250ml',
      batch_number: 'BATCH-MNG-261103',
      movement_type: 'PRODUCTION_VERIFIED',
      quantity_change: 345,
      balance_after: 670,
      reference_type: 'BATCH',
      reference_id: 'BATCH-MNG-261103',
      notes: 'Morning shift verified batch added to finished goods',
      performed_by: 'Engr. Salman Nadeem',
      created_at: isoTime(-90),
    },
    {
      id: 'mov-3',
      item_type: 'FINISHED_GOOD',
      item_id: 'prod-orange-500',
      item_name: 'Fruity Fun Orange Citrus 500ml',
      batch_number: 'BATCH-ORG-261102',
      movement_type: 'ORDER_DISPATCHED',
      quantity_change: -80,
      balance_after: 280,
      reference_type: 'ORDER',
      reference_id: 'ORD-2026-0503',
      notes: 'Dispatched to Ali Super Store & Juice Agency',
      performed_by: 'Sikandar Raja',
      created_at: isoTime(-180),
    },
  ];

  const notifications: AppNotification[] = [
    {
      id: 'notif-1',
      type: 'LOW_RAW_MATERIAL',
      title: 'Low Raw Material Stock: Kinnow Orange Concentrate',
      message: 'Current stock (185 kg) has fallen below minimum safety level (350 kg). Reorder from Punjab Agro Pulp.',
      severity: 'critical',
      target_roles: ['OWNER', 'PRODUCTION_MANAGER'],
      is_read: false,
      link_href: '/raw-materials',
      created_at: isoTime(-140),
    },
    {
      id: 'notif-2',
      type: 'LOW_RAW_MATERIAL',
      title: 'Low Raw Material Stock: Citric Acid & Preservative Blend',
      message: 'Current stock (68 kg) is below minimum threshold (100 kg).',
      severity: 'warning',
      target_roles: ['OWNER', 'PRODUCTION_MANAGER'],
      is_read: false,
      link_href: '/raw-materials',
      created_at: isoTime(-130),
    },
    {
      id: 'notif-3',
      type: 'LOW_FINISHED_GOODS',
      title: 'Low Finished Goods: Fruity Fun Pink Guava 250ml',
      message: 'Available stock is 52 cartons (Minimum required: 75 cartons). Schedule a production batch.',
      severity: 'warning',
      target_roles: ['OWNER', 'PRODUCTION_MANAGER'],
      is_read: false,
      link_href: '/finished-goods',
      created_at: isoTime(-110),
    },
    {
      id: 'notif-4',
      type: 'MACHINE_ISSUE',
      title: 'High Priority Machine Issue: LINE-C-SHRK-03',
      message: 'Steam Tunnel Sleeve Labeler reported pressure fluctuation. Maintenance ticket MNT-2026-001 in progress.',
      severity: 'critical',
      target_roles: ['OWNER', 'PRODUCTION_MANAGER'],
      is_read: false,
      link_href: '/machines',
      created_at: isoTime(-95),
    },
    {
      id: 'notif-5',
      type: 'NEW_ORDER',
      title: 'Pending Order Approval: ORD-2026-0505 (PKR 89,600)',
      message: 'Booker Kamran Raza submitted an order for Al-Madina Mart (70 cartons Guava 250ml).',
      severity: 'info',
      target_roles: ['OWNER'],
      is_read: false,
      link_href: '/orders',
      created_at: isoTime(-25),
    },
    {
      id: 'notif-6',
      type: 'EXPENSE_APPROVAL_REQUEST',
      title: 'Expense Approval Requested: PKR 18,500',
      message: 'Production Manager submitted maintenance expense EXP-2026-003 for Steam Tunnel solenoid valve.',
      severity: 'info',
      target_roles: ['OWNER'],
      is_read: false,
      link_href: '/expenses',
      created_at: isoTime(-20),
    },
  ];

  const audit_logs: AuditLog[] = [
    {
      id: 'aud-1',
      actor_id: 'user-prod-1',
      actor_name: 'Engr. Salman Nadeem (Production Manager)',
      actor_role: 'PRODUCTION_MANAGER',
      action: 'PRODUCTION_BATCH_VERIFIED',
      entity_type: 'production_batches',
      entity_id: 'batch-1003',
      summary: 'Verified BATCH-MNG-261103 (345 cartons Mango 250ml) and updated finished goods + deducted BOM raw materials.',
      created_at: isoTime(-90),
    },
    {
      id: 'aud-2',
      actor_id: 'user-booker-2',
      actor_name: 'Kamran Raza (Booker)',
      actor_role: 'BOOKER',
      action: 'PAYMENT_COLLECTED',
      entity_type: 'payments',
      entity_id: 'pay-3',
      summary: 'Recorded cash collection RCPT-2026-003 of PKR 100,000 from Ali Super Store & Juice Agency.',
      created_at: isoTime(-100),
    },
  ];

  const defaultFactorySettings: FactorySettings = {
    company_name: 'Fruity Fun Juice Factory',
    owner_name: 'Sikandar Raja',
    owner_role_title: 'Owner / Super Admin',
    factory_address: 'Plot 42-B, Industrial Estate, Multan Road, Lahore',
    factory_phone: '+92-300-8401122',
    ntn_strn: 'NTN-8841209-7',
    currency: 'PKR',
    default_credit_limit: 300000,
    updated_at: isoTime(-15),
  };

  const defaultCashBankAccounts: CashBankAccount[] = [
    {
      id: 'acc-cash',
      account_code: 'CASH-01',
      account_name: 'Factory Cash in Hand',
      account_type: 'CASH',
      opening_balance: 0,
      total_receipts: 0,
      total_payments: 0,
      current_balance: 0,
      updated_at: isoTime(-15),
    },
    {
      id: 'acc-bank',
      account_code: 'BANK-01',
      account_name: 'Meezan Bank Corporate Account',
      account_type: 'BANK',
      bank_name: 'Meezan Bank Limited',
      account_number: 'PK36-MEZN-0002-1190-4488-1002',
      opening_balance: 0,
      total_receipts: 0,
      total_payments: 0,
      current_balance: 0,
      updated_at: isoTime(-15),
    },
  ];

  return {
    is_demo_seeded: true,
    environment_mode: 'TEST_SEED_MODE',
    roles,
    users,
    manager_cash_accounts,
    manager_cash_transactions: [],
    bookers: [],
    booker_transactions: [],
    flavours,
    bottle_sizes,
    packaging_types,
    products,
    suppliers,
    supplier_ledger: [],
    raw_materials,
    purchases,
    material_purchase_receipts: [],
    stock_ledger: [],
    recipes,
    machines,
    maintenance_records,
    production_batches,
    finished_goods,
    inventory_movements,
    dealer_areas,
    dealers,
    dealer_ledger,
    orders,
    sales_returns: [],
    payments,
    expenses,
    cash_bank_accounts: defaultCashBankAccounts,
    financial_transactions: [],
    factory_settings: defaultFactorySettings,
    location_points,
    shop_visits,
    notifications,
    audit_logs,
  };
}

/**
 * PHASE 2: Canonical 27 Raw Materials Master List for Fruity Fun Juice Factory.
 * Preserves the exact supplied names and units, with 0 opening stock and 0 minimum threshold (no fake/invented quantities).
 */
export function createFactory27RawMaterialsMaster(): RawMaterial[] {
  const now = new Date().toISOString();
  const defs: Array<{
    id: string;
    code: string;
    name: string;
    category: RawMaterial['category'];
    unit: RawMaterial['unit'];
    allowed_units: RawMaterial['unit'][];
  }> = [
    { id: 'rm-01', code: 'RM-01', name: 'Compound', category: 'Chemical', unit: 'KG', allowed_units: ['KG', 'GRAM'] },
    { id: 'rm-02', code: 'RM-02', name: 'CMC', category: 'Chemical', unit: 'KG', allowed_units: ['KG', 'GRAM'] },
    { id: 'rm-03', code: 'RM-03', name: 'Sugar', category: 'Sweetener', unit: 'KG', allowed_units: ['KG', 'GRAM'] },
    { id: 'rm-04', code: 'RM-04', name: 'Xenthum gun', category: 'Chemical', unit: 'KG', allowed_units: ['KG', 'GRAM'] },
    { id: 'rm-05', code: 'RM-05', name: 'Scotbic vtmc', category: 'Chemical', unit: 'KG', allowed_units: ['KG', 'GRAM'] },
    { id: 'rm-06', code: 'RM-06', name: 'sitric acid', category: 'Chemical', unit: 'KG', allowed_units: ['KG', 'GRAM'] },
    { id: 'rm-07', code: 'RM-07', name: 'sudiam sitret', category: 'Chemical', unit: 'KG', allowed_units: ['KG', 'GRAM'] },
    { id: 'rm-08', code: 'RM-08', name: 'sudiam benziod', category: 'Preservative', unit: 'KG', allowed_units: ['KG', 'GRAM'] },
    { id: 'rm-09', code: 'RM-09', name: 'palp', category: 'Concentrate', unit: 'KG', allowed_units: ['KG', 'GRAM'] },
    { id: 'rm-10', code: 'RM-10', name: 'sheeling rapper', category: 'Packaging', unit: 'KG', allowed_units: ['KG', 'GRAM'] },
    { id: 'rm-11', code: 'RM-11', name: 'sweetner', category: 'Sweetener', unit: 'KG', allowed_units: ['KG', 'GRAM'] },
    { id: 'rm-12', code: 'RM-12', name: 'flavour', category: 'Flavouring', unit: 'LITRE', allowed_units: ['ML', 'LITRE'] },
    { id: 'rm-13', code: 'RM-13', name: 'PH paper', category: 'Chemical', unit: 'BOX', allowed_units: ['BOX'] },
    { id: 'rm-14', code: 'RM-14', name: 'Water', category: 'Water', unit: 'LITRE', allowed_units: ['LITRE'] },
    { id: 'rm-15', code: 'RM-15', name: 'mask', category: 'Safety & Hygiene', unit: 'BOX', allowed_units: ['BOX', 'PIECE'] },
    { id: 'rm-16', code: 'RM-16', name: 'cap', category: 'Cap', unit: 'BOX', allowed_units: ['BOX', 'PIECE'] },
    { id: 'rm-17', code: 'RM-17', name: 'gluffs', category: 'Safety & Hygiene', unit: 'BOX', allowed_units: ['BOX', 'PIECE'] },
    { id: 'rm-18', code: 'RM-18', name: 'rubber band', category: 'Packaging', unit: 'PACKET', allowed_units: ['PACKET'] },
    { id: 'rm-19', code: 'RM-19', name: 'Glue stick', category: 'Adhesive', unit: 'PACKET', allowed_units: ['PACKET'] },
    { id: 'rm-20', code: 'RM-20', name: 'liquid glue', category: 'Adhesive', unit: 'KG', allowed_units: ['KG'] },
    { id: 'rm-21', code: 'RM-21', name: 'tray', category: 'Packaging', unit: 'PIECE', allowed_units: ['PIECE'] },
    { id: 'rm-22', code: 'RM-22', name: 'shopper', category: 'Packaging', unit: 'KG', allowed_units: ['KG', 'GRAM'] },
    { id: 'rm-23', code: 'RM-23', name: 'juice box', category: 'Packaging', unit: 'PIECE', allowed_units: ['PIECE'] },
    { id: 'rm-24', code: 'RM-24', name: 'straw', category: 'Packaging', unit: 'PIECE', allowed_units: ['PIECE'] },
    { id: 'rm-25', code: 'RM-25', name: 'tea bags', category: 'Ingredients', unit: 'PACKET', allowed_units: ['PACKET'] },
    { id: 'rm-26', code: 'RM-26', name: 'milk', category: 'Ingredients', unit: 'KG', allowed_units: ['KG'] },
    { id: 'rm-27', code: 'RM-27', name: 'green tea', category: 'Ingredients', unit: 'PACKET', allowed_units: ['PACKET'] },
  ];

  return defs.map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    category: d.category,
    unit: d.unit,
    allowed_units: d.allowed_units,
    opening_stock: 0,
    opening_stock_set: false,
    opening_stock_date: null,
    box_to_piece_factor: null,
    stock_received: 0,
    stock_consumed: 0,
    stock_adjusted: 0,
    current_stock: 0,
    minimum_stock_level: 0,
    average_cost_per_unit: 0,
    last_purchase_price: 0,
    damaged_quantity: 0,
    supplier_id: null,
    supplier_name: null,
    updated_at: now,
  }));
}

/**
 * PHASE 3: Canonical Factory Products & Finished Goods Inventory Master.
 * The factory manufactures ONLY two juice products: Apple Juice and Mango Juice.
 * There is only ONE carton type, and each carton contains exactly 24 pieces (1 carton = 24 pieces).
 * Initialized with 0 opening stock and 0 produced stock (no invented quantities).
 */
export function createFactoryProductsMaster(): Product[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'prod-apple-juice',
      sku: 'FF-APL-24',
      name: 'Apple Juice',
      flavour_id: 'flv-apple',
      flavour_name: 'Apple',
      bottle_size_id: 'size-std',
      bottle_size_label: '24 Pieces / Carton',
      packaging_type_id: 'pkg-ctn24',
      packaging_type_name: 'Standard 24-Piece Carton',
      units_per_carton: 24,
      wholesale_price_per_carton: 1200,
      retail_price_per_unit: 60,
      standard_cost_per_carton: 850,
      min_stock_cartons: 0,
      is_active: true,
      created_at: now,
    },
    {
      id: 'prod-mango-juice',
      sku: 'FF-MNG-24',
      name: 'Mango Juice',
      flavour_id: 'flv-mango',
      flavour_name: 'Mango',
      bottle_size_id: 'size-std',
      bottle_size_label: '24 Pieces / Carton',
      packaging_type_id: 'pkg-ctn24',
      packaging_type_name: 'Standard 24-Piece Carton',
      units_per_carton: 24,
      wholesale_price_per_carton: 1200,
      retail_price_per_unit: 60,
      standard_cost_per_carton: 850,
      min_stock_cartons: 0,
      is_active: true,
      created_at: now,
    },
  ];
}

export function createFactoryFinishedGoodsMaster(): FinishedGoodsInventory[] {
  const now = new Date().toISOString();
  return createFactoryProductsMaster().map((p) => ({
    id: `fg-${p.id}`,
    product_id: p.id,
    product_name: p.name,
    sku: p.sku,
    flavour_name: p.flavour_name,
    bottle_size_label: '24 Pieces / Carton',
    packaging_type_name: 'Standard 24-Piece Carton',
    units_per_carton: 24,
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
    latest_batch_number: 'NONE',
    latest_production_date: '—',
    valuation_per_carton: 0,
    updated_at: now,
  }));
}

/**
 * Clean Production Database (No fake revenue, no fake production batches, no fake stock entries, no fake dealer balances)
 */
export function createCleanProductionDatabase(): ErpDatabaseState {
  const seed = createInitialSeedDatabase();
  const now = new Date().toISOString();
  return {
    is_demo_seeded: false,
    environment_mode: 'PRODUCTION_CLEAN',
    roles: seed.roles,
    users: seed.users,
    manager_cash_accounts: seed.manager_cash_accounts,
    manager_cash_transactions: [],
    bookers: [],
    booker_transactions: [],
    flavours: [
      { id: 'flv-apple', name: 'Apple', code: 'APL', color_hex: '#EF4444', is_active: true, created_at: now },
      { id: 'flv-mango', name: 'Mango', code: 'MNG', color_hex: '#F59E0B', is_active: true, created_at: now },
    ],
    bottle_sizes: [
      { id: 'size-std', label: '24 Pieces / Carton', volume_ml: 250, is_custom: false, is_active: true, created_at: now },
    ],
    packaging_types: [
      { id: 'pkg-ctn24', name: 'Standard 24-Piece Carton', units_per_carton: 24, created_at: now },
    ],
    products: createFactoryProductsMaster(),
    suppliers: [],
    supplier_ledger: [],
    raw_materials: createFactory27RawMaterialsMaster(),
    purchases: [],
    material_purchase_receipts: [],
    stock_ledger: [],
    recipes: [],
    machines: seed.machines.map((m) => ({
      ...m,
      status: 'Operational',
    })),
    maintenance_records: [],
    production_batches: [],
    finished_goods: createFactoryFinishedGoodsMaster(),
    inventory_movements: [],
    dealer_areas: seed.dealer_areas.map((a) => ({ ...a, shop_count: 0 })),
    dealers: [],
    dealer_ledger: [],
    orders: [],
    sales_returns: [],
    payments: [],
    expenses: [],
    cash_bank_accounts: seed.cash_bank_accounts,
    financial_transactions: [],
    factory_settings: seed.factory_settings,
    location_points: [],
    shop_visits: [],
    notifications: [],
    audit_logs: [],
  };
}

export function readErpDatabase(): ErpDatabaseState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE_PATH)) {
    const initial = createCleanProductionDatabase();
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as ErpDatabaseState;
  const defaults = createCleanProductionDatabase();
  if (!parsed.material_purchase_receipts) parsed.material_purchase_receipts = [];
  if (!parsed.stock_ledger) parsed.stock_ledger = [];
  if (!parsed.supplier_ledger) parsed.supplier_ledger = [];
  if (!parsed.sales_returns) parsed.sales_returns = [];
  if (!parsed.manager_cash_accounts || parsed.manager_cash_accounts.length === 0) {
    parsed.manager_cash_accounts = defaults.manager_cash_accounts;
  }
  if (!parsed.manager_cash_transactions) parsed.manager_cash_transactions = [];
  if (!parsed.bookers) parsed.bookers = [];
  if (!parsed.booker_transactions) parsed.booker_transactions = [];
  if (!parsed.cash_bank_accounts || parsed.cash_bank_accounts.length === 0) {
    parsed.cash_bank_accounts = defaults.cash_bank_accounts;
  }
  if (!parsed.financial_transactions) parsed.financial_transactions = [];
  if (!parsed.factory_settings) parsed.factory_settings = defaults.factory_settings;
  if (!parsed.environment_mode) {
    parsed.environment_mode = parsed.is_demo_seeded ? 'TEST_SEED_MODE' : 'PRODUCTION_CLEAN';
  }

  // Ensure the 3 core factory users (Sikandar Raja, Kamran Bhai, Imran Bhai),
  // 27 Raw Materials Master, and 2 Canonical Products (Apple Juice & Mango Juice, 24 pcs/carton) exist
  let migratedState = false;
  for (const defUser of defaults.users) {
    const existing = parsed.users.find(
      (u) => u.id === defUser.id || u.email.toLowerCase() === defUser.email.toLowerCase()
    );
    if (!existing) {
      parsed.users.push(defUser);
      migratedState = true;
    }
  }
  for (const u of parsed.users) {
    const envPlain = getInitialCoreUserPasswordFromEnv(u.email || u.id);
    if (envPlain) {
      const expectedEnvHash = hashInitialPassword(envPlain);
      if (
        !u.password_hash ||
        !u.password_hash.startsWith('scrypt$') ||
        (u.password_hash.startsWith(`scrypt$${INITIAL_SALT}$`) &&
          u.password_hash !== expectedEnvHash)
      ) {
        u.password_hash = expectedEnvHash;
        migratedState = true;
      }
    } else if (u.password_hash && !u.password_hash.startsWith('scrypt$')) {
      u.password_hash = hashInitialPassword(u.password_hash);
      migratedState = true;
    }
  }
  if (!parsed.raw_materials) {
    parsed.raw_materials = [];
  }
  if (parsed.environment_mode === 'PRODUCTION_CLEAN') {
    for (const defMat of defaults.raw_materials) {
      const existingMat = parsed.raw_materials.find(
        (m) => m.name.toLowerCase() === defMat.name.toLowerCase()
      );
      if (!existingMat) {
        parsed.raw_materials.push(defMat);
        migratedState = true;
      } else if (!existingMat.allowed_units || existingMat.allowed_units.length === 0) {
        existingMat.allowed_units = defMat.allowed_units;
        migratedState = true;
      }
    }
    const canonicalProds = createFactoryProductsMaster();
    if (
      !parsed.products ||
      parsed.products.length !== 2 ||
      !parsed.products.some((p) => p.name === 'Apple Juice') ||
      !parsed.products.some((p) => p.name === 'Mango Juice')
    ) {
      parsed.products = canonicalProds;
      migratedState = true;
    }
    if (!parsed.finished_goods) {
      parsed.finished_goods = [];
    }
    for (const defFg of createFactoryFinishedGoodsMaster()) {
      const existingFg = parsed.finished_goods.find(
        (f) => f.product_id === defFg.product_id || f.product_name.toLowerCase() === defFg.product_name.toLowerCase()
      );
      if (!existingFg) {
        parsed.finished_goods.push(defFg);
        migratedState = true;
      } else if (existingFg.units_per_carton !== 24) {
        existingFg.units_per_carton = 24;
        migratedState = true;
      }
    }
  }
  if (migratedState) {
    writeErpDatabase(parsed);
  }
  return parsed;
}

export function writeErpDatabase(state: ErpDatabaseState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const uniqueSuffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tempPath = `${DB_FILE_PATH}.${uniqueSuffix}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tempPath, DB_FILE_PATH);
}

/**
 * Atomic transactional mutation helper
 */
export function withErpTransaction<T>(mutator: (db: ErpDatabaseState) => T): T {
  const db = readErpDatabase();
  const result = mutator(db);
  writeErpDatabase(db);
  return result;
}

/**
 * Append an immutable audit log entry
 */
export function appendAuditLog(
  db: ErpDatabaseState,
  params: {
    actor_id: string;
    actor_name: string;
    actor_role: RoleName;
    action: string;
    entity_type: string;
    entity_id: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }
) {
  db.audit_logs.unshift({
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    actor_id: params.actor_id,
    actor_name: params.actor_name,
    actor_role: params.actor_role,
    action: params.action,
    entity_type: params.entity_type,
    entity_id: params.entity_id,
    summary: params.summary,
    metadata: params.metadata,
    created_at: new Date().toISOString(),
  });
}
