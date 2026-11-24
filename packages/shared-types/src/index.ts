// ============================================================================
// JUICE FACTORY MANAGEMENT ERP SYSTEM - CANONICAL SHARED TYPES
// ============================================================================

export type RoleName = 'OWNER' | 'PRODUCTION_MANAGER' | 'BOOKER';

export type PermissionCode =
  | 'dashboard:view_owner'
  | 'dashboard:view_production'
  | 'users:manage'
  | 'production:manage'
  | 'production:verify'
  | 'raw_materials:manage'
  | 'raw_materials:purchase'
  | 'finished_goods:manage'
  | 'dealers:manage'
  | 'orders:create'
  | 'orders:approve'
  | 'orders:dispatch'
  | 'payments:record'
  | 'payments:reverse'
  | 'expenses:create'
  | 'expenses:approve'
  | 'accounting:view_pnl'
  | 'machines:manage'
  | 'gps:track_self'
  | 'gps:view_all_bookers'
  | 'voice:execute_transactions'
  | 'ai:query_business'
  | 'reports:export';

export interface Role {
  id: string;
  name: RoleName;
  description: string;
  permissions: PermissionCode[];
  created_at: string;
}

export interface UserProfile {
  id: string;
  auth_user_id?: string | null;
  email: string;
  full_name: string;
  phone: string;
  role: RoleName;
  is_active: boolean;
  password_hash?: string;
  department?: string;
  can_record_purchases?: boolean;
  permissions?: PermissionCode[];
  assigned_area_id?: string | null;
  working_hours_start: string; // e.g., "08:00"
  working_hours_end: string;   // e.g., "19:00"
  duty_status: 'ON_DUTY' | 'OFF_DUTY';
  last_login_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Flavour {
  id: string;
  name: string;        // e.g., Mango, Orange, Apple, Guava, Mixed Fruit
  code: string;        // e.g., MNG, ORG, APL, GVA, MXF
  color_hex: string;
  is_active: boolean;
  created_at: string;
}

export interface BottleSize {
  id: string;
  label: string;       // e.g., 250ml, 500ml, 1L, Custom
  volume_ml: number;
  is_custom: boolean;
  is_active: boolean;
  created_at: string;
}

export interface PackagingType {
  id: string;
  name: string;        // e.g., PET Bottle Carton, Tetra Pak Tray, Glass Crate
  units_per_carton: number;
  created_at: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  flavour_id: string;
  flavour_name: string;
  bottle_size_id: string;
  bottle_size_label: string;
  packaging_type_id: string;
  packaging_type_name: string;
  units_per_carton: number;
  wholesale_price_per_carton: number;
  retail_price_per_unit: number;
  standard_cost_per_carton: number;
  min_stock_cartons: number;
  is_active: boolean;
  created_at: string;
}

export type RawMaterialUnit =
  | 'KG'
  | 'GRAM'
  | 'LITRE'
  | 'ML'
  | 'BOX'
  | 'PIECE'
  | 'PIECES'
  | 'PACKET'
  | 'PACKETS'
  | 'CARTONS'
  | 'kg'
  | 'liter'
  | 'piece'
  | 'carton'
  | 'roll'
  | 'gram'
  | 'box'
  | 'packet';

export type MaterialUnit = RawMaterialUnit;

export type RawMaterialCategory =
  | 'Chemical'
  | 'Sweetener'
  | 'Water'
  | 'Concentrate'
  | 'Flavouring'
  | 'Preservative'
  | 'Bottle'
  | 'Cap'
  | 'Label'
  | 'Carton'
  | 'Packaging'
  | 'Safety & Hygiene'
  | 'Adhesive'
  | 'Ingredients';

export interface RawMaterial {
  id: string;
  code: string;
  name: string;
  category: RawMaterialCategory;
  unit: RawMaterialUnit;
  allowed_units?: RawMaterialUnit[];
  opening_stock: number;
  opening_stock_set?: boolean;
  opening_stock_date?: string | null;
  box_to_piece_factor?: number | null;
  stock_received: number;
  stock_consumed: number;
  stock_adjusted: number;
  current_stock: number; // Opening + Received - Consumed + Adjusted
  minimum_stock_level: number;
  average_cost_per_unit: number;
  last_purchase_price: number;
  damaged_quantity: number;
  supplier_id?: string | null;
  supplier_name?: string | null;
  updated_at: string;
}

export type StockMovementType =
  | 'OPENING_STOCK'
  | 'OPENING_BALANCE'
  | 'PURCHASE'
  | 'PURCHASE_RECEIPT'
  | 'PRODUCTION_CONSUMPTION'
  | 'STOCK_ADJUSTMENT'
  | 'STOCK_CORRECTION';

export interface StockLedgerEntry {
  id: string;
  raw_material_id?: string;
  material_id?: string;
  material_name: string;
  unit: string;
  opening_quantity: number;
  stock_received: number;
  quantity_consumed: number;
  adjustment_quantity: number;
  closing_quantity: number;
  previous_stock?: number;
  quantity_added?: number;
  quantity_deducted?: number;
  updated_stock?: number;
  transaction_type: StockMovementType;
  reference_number: string;
  related_purchase_id?: string | null;
  related_production_id?: string | null;
  supplier_name?: string;
  purchase_price?: number;
  entered_by?: string;
  entered_by_id?: string;
  entered_by_name?: string;
  approved_by?: string | null;
  approved_by_id?: string | null;
  approved_by_name?: string | null;
  date: string;
  created_at: string;
  notes?: string;
}

export interface MaterialPurchaseReceipt {
  id: string;
  invoice_number: string;
  raw_material_id?: string;
  material_id?: string;
  material_name: string;
  quantity_entered: number;
  unit_entered: string;
  normalized_quantity: number;
  canonical_unit: string;
  supplier_id?: string | null;
  supplier_name: string;
  purchase_price_total: number;
  unit_cost_canonical?: number;
  unit_cost?: number;
  notes?: string;
  purchase_date: string;
  entered_by_id: string;
  entered_by_name: string;
  created_at: string;
}

export interface Supplier {
  id: string;
  code?: string;
  name: string;
  contact_person: string;
  phone: string;
  email?: string;
  address: string;
  opening_balance?: number;
  payable_balance: number;
  created_at: string;
}

export type SupplierLedgerEntryType =
  | 'OPENING_BALANCE'
  | 'PURCHASE_INVOICE'
  | 'PAYMENT_MADE'
  | 'PURCHASE_RETURN'
  | 'REVERSAL_ENTRY'
  | 'ADJUSTMENT';

export interface SupplierLedgerEntry {
  id: string;
  supplier_id: string;
  supplier_name: string;
  date: string;
  description: string;
  entry_type: SupplierLedgerEntryType;
  debit: number;    // Decreases supplier payable (Payment made to supplier, Purchase return)
  credit: number;   // Increases supplier payable (Opening balance, Credit purchase invoice)
  balance: number;  // Running payable balance owed to supplier
  reference_number: string;
  payment_method?: 'Cash' | 'Bank Transfer' | 'Cheque' | 'Credit' | 'Reversal';
  reverses_entry_id?: string | null;
  is_reversed?: boolean;
  entered_by_id: string;
  entered_by_name: string;
  remarks?: string;
  created_at: string;
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  raw_material_id: string;
  raw_material_name: string;
  quantity: number;
  unit: RawMaterialUnit;
  unit_price: number;
  total_cost: number;
}

export interface Purchase {
  id: string;
  purchase_number: string;
  supplier_id: string;
  supplier_name: string;
  purchase_date: string;
  items: PurchaseItem[];
  total_amount: number;
  amount_paid: number;
  payment_status: 'PAID' | 'PARTIAL' | 'UNPAID';
  notes?: string;
  created_by: string;
  created_at: string;
}

export interface RecipeItem {
  raw_material_id: string;
  raw_material_name: string;
  unit: RawMaterialUnit;
  quantity_per_carton: number; // Quantity of this raw material required to produce 1 carton
  wastage_allowance_pct: number;
}

export interface Recipe {
  id: string;
  product_id: string;
  product_name: string;
  version: string;
  yield_cartons: number; // Base reference (1 carton)
  items: RecipeItem[];
  notes?: string;
  updated_at: string;
}

export type JuiceType = 'Apple Juice' | 'Mango Juice';

export type ProductionStatus =
  | 'CONFIRMED'
  | 'REVERSED'
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'Planned'
  | 'In Progress'
  | 'Completed'
  | 'On Hold'
  | 'Rejected';

export interface ProductionMaterialUsage {
  raw_material_id: string;
  raw_material_name: string;
  unit: RawMaterialUnit;
  quantity_entered?: number;
  unit_entered?: string;
  entered_quantity?: number;
  entered_unit?: string;
  wastage_quantity?: number;
  opening_stock_snapshot?: number;
  remaining_stock_snapshot?: number;
  estimated_quantity: number;
  actual_quantity: number; // Normalized to canonical raw material unit
  unit_cost_snapshot: number;
  total_cost: number;
}

export type BatchMaterialUsage = ProductionMaterialUsage;

export interface ProductionBatch {
  id: string;
  batch_number: string;
  production_date: string;
  product_id: string;
  product_name: string;
  juice_type?: JuiceType;
  flavour_name: string;
  bottle_size_label: string;
  packaging_type_name: string;
  units_per_carton: number;
  pieces_per_carton?: number; // Always 24
  total_pieces?: number;      // actual_cartons * 24
  target_bottles?: number;
  produced_bottles?: number;
  actual_bottles?: number;
  wastage_bottles?: number;
  target_cartons: number;
  actual_cartons: number;
  wastage_cartons: number;
  damaged_units: number;
  machine_id: string;
  machine_name: string;
  status: ProductionStatus;
  inventory_posted: boolean; // Critical idempotency flag: prevents double deduction/addition
  idempotency_key?: string;
  is_reversed?: boolean;
  reversed_at?: string | null;
  reversed_by_id?: string | null;
  reversed_by_name?: string | null;
  reversal_reason?: string | null;
  corrects_batch_id?: string | null;
  corrected_by_batch_id?: string | null;
  submitted_by?: string | null;
  submitted_by_id?: string | null;
  submitted_by_name?: string | null;
  submitted_at?: string | null;
  verified_by?: string | null;
  verified_by_name?: string | null;
  verified_at?: string | null;
  rejection_reason?: string | null;
  material_usage: ProductionMaterialUsage[];
  total_production_cost: number;
  cost_per_carton: number;
  remarks?: string;
  created_by: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface FinishedGoodsInventory {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  flavour_name: string;
  bottle_size_label: string;
  packaging_type_name: string;
  units_per_carton: number;
  opening_stock_set?: boolean;
  opening_stock_date?: string | null;
  opening_bottles?: number;
  opening_stock_bottles?: number;
  produced_bottles?: number;
  verified_production_bottles?: number;
  dispatched_bottles?: number;
  damaged_bottles?: number;
  closing_stock_bottles?: number;
  available_bottles?: number;
  opening_stock_cartons: number;
  verified_production_cartons: number;
  approved_returns_cartons: number;
  dispatched_cartons: number;
  damaged_cartons: number;
  reserved_cartons: number;
  available_cartons: number; // Closing Stock - Reserved
  closing_stock_cartons: number; // Opening + Production + Returns - Dispatches - Damage
  latest_batch_number: string;
  latest_production_date: string;
  valuation_per_carton: number;
  updated_at: string;
}

export type InventoryMovementType =
  | 'OPENING_STOCK'
  | 'PRODUCTION_VERIFIED'
  | 'PRODUCTION_REVERSED'
  | 'BOOKER_CARTONS_GIVEN'
  | 'BOOKER_ALLOCATION_REVERSED'
  | 'ORDER_RESERVED'
  | 'ORDER_RESERVATION_RELEASED'
  | 'ORDER_DISPATCHED'
  | 'CUSTOMER_RETURN_APPROVED'
  | 'DAMAGE_WRITE_OFF'
  | 'AUTHORIZED_ADJUSTMENT'
  | 'PURCHASE_RECEIVED'
  | 'RAW_MATERIAL_PURCHASE'
  | 'RAW_MATERIAL_CONSUMED'
  | 'RAW_MATERIAL_DAMAGED'
  | 'RAW_MATERIAL_ADJUSTMENT';

export interface InventoryMovement {
  id: string;
  item_type: 'FINISHED_GOOD' | 'RAW_MATERIAL';
  item_id: string;
  item_name: string;
  batch_number?: string;
  movement_type: InventoryMovementType;
  quantity_change: number; // Positive or negative
  balance_after: number;
  reference_type: 'BATCH' | 'ORDER' | 'PURCHASE' | 'RETURN' | 'ADJUSTMENT' | 'VOICE' | 'BOOKER';
  reference_id: string;
  notes?: string;
  performed_by: string;
  created_at: string;
}

export interface DealerArea {
  id: string;
  name: string;
  city: string;
  assigned_booker_id?: string | null;
  assigned_booker_name?: string | null;
  shop_count: number;
  created_at: string;
}

export interface Dealer {
  id: string;
  code: string;
  dealer_name: string;
  shop_name: string;
  contact_number: string;
  address: string;
  area_id: string;
  area_name: string;
  assigned_booker_id: string;
  assigned_booker_name: string;
  opening_balance: number;
  credit_limit: number;
  outstanding_balance: number; // Positive = Dealer owes factory (Receivable)
  latitude: number;
  longitude: number;
  geofence_radius_meters: number;
  is_active: boolean;
  created_at: string;
}

export type LedgerEntryType =
  | 'OPENING_BALANCE'
  | 'SALES_INVOICE'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_GIVEN'
  | 'SALES_RETURN_CREDIT'
  | 'REVERSAL_ENTRY'
  | 'CORRECTION_ADJUSTMENT';

export interface DealerLedgerEntry {
  id: string;
  dealer_id: string;
  dealer_name: string;
  shop_name: string;
  date: string;
  description: string;
  entry_type: LedgerEntryType;
  debit: number;    // Increases what dealer owes factory (e.g., credit sale, advance given)
  credit: number;   // Decreases what dealer owes factory (e.g., cash/bank payment received, return)
  balance: number;  // Running balance after this entry
  reference_number: string;
  payment_method?: 'Cash' | 'Bank Transfer' | 'Cheque' | 'Online Wallet' | 'Credit' | 'Reversal';
  reverses_entry_id?: string | null;
  is_reversed?: boolean;
  created_by: string;
  created_at: string;
}

export type OrderStatus =
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'Processing'
  | 'Ready for Dispatch'
  | 'Dispatched'
  | 'Delivered'
  | 'Cancelled';

export type OrderPaymentStatus = 'Unpaid (Credit)' | 'Partially Paid' | 'Paid';

export interface OrderItem {
  id: string;
  product_id: string;
  product_name: string;
  flavour_name: string;
  bottle_size_label: string;
  quantity_cartons: number;
  rate_per_carton: number;
  discount_amount: number;
  cogs_per_carton_snapshot: number;
  line_total: number;
}

export interface Order {
  id: string;
  order_number: string;
  idempotency_key: string;
  dealer_id: string;
  dealer_name: string;
  shop_name: string;
  area_id: string;
  area_name: string;
  booker_id: string;
  booker_name: string;
  order_date: string;
  status: OrderStatus;
  payment_status: OrderPaymentStatus;
  items: OrderItem[];
  subtotal_amount: number;
  discount_total: number;
  total_amount: number;
  amount_paid_on_order: number;
  total_cogs: number;
  delivery_notes?: string;
  approved_by?: string | null;
  dispatched_at?: string | null;
  delivered_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentRecord {
  id: string;
  receipt_number: string;
  dealer_id: string;
  dealer_name: string;
  shop_name: string;
  collected_by_id: string;
  collected_by_name: string;
  payment_date: string;
  amount: number;
  direction: 'INCOMING_FROM_DEALER' | 'OUTGOING_TO_PERSON';
  payment_method: 'Cash' | 'Bank Transfer' | 'Cheque' | 'Online Wallet';
  reference_number: string;
  order_id?: string | null;
  ledger_entry_id: string;
  is_reversed: boolean;
  notes?: string;
  created_at: string;
}

export type ExpenseCategory =
  | 'Electricity'
  | 'Fuel'
  | 'Salaries'
  | 'Factory rent'
  | 'Machine maintenance'
  | 'Transportation'
  | 'Raw materials'
  | 'Packaging'
  | 'Marketing'
  | 'Other expenses';

export type ExpenseApprovalStatus = 'Pending' | 'Approved' | 'Rejected';

export interface Expense {
  id: string;
  expense_number: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  description: string;
  payment_method: 'Cash' | 'Bank Transfer' | 'Cheque' | 'Company Card';
  receipt_attachment_url?: string | null;
  created_by_id: string;
  created_by_name: string;
  approval_status: ExpenseApprovalStatus;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
}

export type MachinePriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type MachineStatus = 'Operational' | 'Under Maintenance' | 'Breakdown' | 'Standby';
export type MaintenanceIssueStatus = 'Reported' | 'In Progress' | 'Parts Awaiting' | 'Resolved';

export interface Machine {
  id: string;
  machine_number: string;
  name: string;
  line_section: string;
  status: MachineStatus;
  last_serviced_date: string;
  created_at: string;
}

export interface MaintenanceRecord {
  id: string;
  ticket_number: string;
  machine_id: string;
  machine_name: string;
  machine_number: string;
  problem_description: string;
  issue_date: string;
  priority: MachinePriority;
  status: MaintenanceIssueStatus;
  repair_notes: string;
  maintenance_cost: number;
  reported_by_id: string;
  reported_by_name: string;
  resolved_at?: string | null;
  created_at: string;
}

export interface LocationPoint {
  id: string;
  booker_id: string;
  booker_name: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  speed_kmh: number;
  battery_pct: number;
  is_moving: boolean;
  is_mock_location: boolean;
  recorded_at: string;
  synced_from_offline_queue: boolean;
}

export interface ShopVisit {
  id: string;
  booker_id: string;
  booker_name: string;
  dealer_id: string;
  shop_name: string;
  area_name: string;
  visit_date: string;
  arrival_time: string;
  departure_time?: string | null;
  duration_minutes: number;
  gps_accuracy_meters: number;
  verification_type: 'GPS_GEOFENCE_DETECTED' | 'MANUAL_CHECK_IN' | 'BOTH_VERIFIED';
  order_placed: boolean;
  order_id?: string | null;
  collection_made: boolean;
  collection_amount: number;
  latitude: number;
  longitude: number;
  notes?: string;
}

export type NotificationType =
  | 'LOW_RAW_MATERIAL'
  | 'LOW_FINISHED_GOODS'
  | 'NEW_ORDER'
  | 'PENDING_APPROVAL'
  | 'DEALER_OVERDUE'
  | 'MACHINE_ISSUE'
  | 'PRODUCTION_DELAY'
  | 'PRODUCTION_SHORTAGE'
  | 'PRODUCTION_COMPLETED'
  | 'EXPENSE_APPROVAL_REQUEST'
  | 'BOOKER_TRACKING_STOPPED'
  | 'BOOKER_LOCATION_UNAVAILABLE';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  target_roles: RoleName[];
  is_read: boolean;
  link_href?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string;
  actor_name: string;
  actor_role: RoleName;
  action: string;
  entity_type: string;
  entity_id: string;
  summary: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// ============================================================================
// COMPLETE ACCOUNTS, CASH & BANK, SALES RETURNS & FACTORY SETTINGS
// ============================================================================

export interface CashBankAccount {
  id: string;
  account_code: string;
  account_name: string;
  account_type: 'CASH' | 'BANK';
  bank_name?: string;
  account_number?: string;
  opening_balance: number;
  total_receipts: number;
  total_payments: number;
  current_balance: number;
  updated_at: string;
}

export type FinancialTransactionType =
  | 'OPENING_BALANCE'
  | 'DEALER_PAYMENT_RECEIPT'
  | 'CASH_SALE_RECEIPT'
  | 'SUPPLIER_PAYMENT'
  | 'RAW_MATERIAL_CASH_PURCHASE'
  | 'EXPENSE_PAYMENT'
  | 'CASH_DEPOSIT_TO_BANK'
  | 'BANK_WITHDRAWAL_TO_CASH'
  | 'CAPITAL_INJECTION'
  | 'REVERSAL_ENTRY';

export interface FinancialTransaction {
  id: string;
  transaction_date: string;
  reference_number: string;
  transaction_type: FinancialTransactionType;
  account_id: string;
  account_name: string;
  direction: 'INFLOW' | 'OUTFLOW';
  amount: number;
  balance_after: number;
  payment_method: 'Cash' | 'Bank Transfer' | 'Cheque' | 'Online Transfer' | 'Reversal';
  related_party_type?: 'DEALER' | 'SUPPLIER' | 'EXPENSE' | 'INTERNAL_TRANSFER' | 'OWNER';
  related_party_id?: string;
  related_party_name: string;
  entered_by_id: string;
  entered_by_name: string;
  remarks: string;
  is_reversed?: boolean;
  reverses_transaction_id?: string;
  created_at: string;
}

export interface SalesReturn {
  id: string;
  return_number: string;
  return_date: string;
  order_id?: string;
  dealer_id: string;
  dealer_name: string;
  shop_name: string;
  product_id: string;
  product_name: string;
  bottle_size_label: string;
  quantity_cartons: number;
  rate_per_carton: number;
  credit_amount: number;
  reason: string;
  restock_good_condition: boolean;
  entered_by_id: string;
  entered_by_name: string;
  created_at: string;
}

export interface FactorySettings {
  company_name: string;
  owner_name: string;
  owner_role_title: string;
  factory_address: string;
  factory_phone: string;
  ntn_strn: string;
  currency: string;
  default_credit_limit: number;
  updated_at: string;
}

export interface ManagerCashAccount {
  manager_id: string;
  manager_name: string;
  total_cash_received: number;
  total_spent_purchases: number;
  total_spent_expenses: number;
  available_balance: number;
  updated_at: string;
}

export type ManagerCashTransactionType =
  | 'CASH_ISSUED_BY_OWNER'
  | 'MATERIAL_PURCHASE'
  | 'FACTORY_EXPENSE'
  | 'REVERSAL_ADJUSTMENT';

export interface ManagerCashTransaction {
  id: string;
  manager_id: string;
  manager_name: string;
  transaction_type: ManagerCashTransactionType;
  amount: number;
  previous_balance: number;
  updated_balance: number;
  reference_number: string;
  description: string;
  created_by_id: string;
  created_by_name: string;
  transaction_date: string;
  created_at: string;
  idempotency_key?: string;
  related_purchase_id?: string | null;
  related_expense_id?: string | null;
  material_name?: string | null;
  material_quantity?: number | null;
  material_unit?: string | null;
  expense_category?: string | null;
  is_reversed?: boolean;
  reverses_transaction_id?: string | null;
}

// ============================================================================
// PHASE 4: BOOKER MANAGEMENT, CARTON ALLOCATIONS & PARTIAL PAYMENTS LEDGER
// ============================================================================

export interface BookerAccount {
  id: string;
  booker_name: string;
  contact_number?: string | null;
  created_date: string;
  is_active: boolean;
  total_cartons_received: number;
  apple_cartons_received: number;
  mango_cartons_received: number;
  total_pieces_received: number;
  total_amount_payable: number;
  total_payments_received: number;
  remaining_outstanding_amount: number;
  created_by_id: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export type BookerTransactionType =
  | 'CARTONS_GIVEN'
  | 'PAYMENT_RECEIVED'
  | 'REVERSAL_ENTRY';

export interface BookerTransaction {
  id: string;
  booker_id: string;
  booker_name: string;
  transaction_type: BookerTransactionType;
  reference_number: string;
  transaction_date: string;
  juice_type?: JuiceType | null;
  cartons_given: number;
  pieces_given: number;
  amount_payable: number;
  payment_received: number;
  previous_outstanding_balance: number;
  updated_outstanding_balance: number;
  notes?: string;
  idempotency_key?: string;
  entered_by_id: string;
  entered_by_name: string;
  is_reversed?: boolean;
  reversed_at?: string | null;
  reversed_by_id?: string | null;
  reversed_by_name?: string | null;
  reversal_reason?: string | null;
  reverses_transaction_id?: string | null;
  corrects_transaction_id?: string | null;
  corrected_by_transaction_id?: string | null;
  created_at: string;
}

// ============================================================================
// VOICE TRANSACTION ASSISTANT STRUCTURED OUTPUT TYPES
// ============================================================================

export type VoiceTransactionIntent =
  | 'PAYMENT_GIVEN_TO_PARTY'      // "Ahmed ko 50 hazar rupay diye"
  | 'PAYMENT_RECEIVABLE_RECORD'   // "Bilal se 80 hazar lene hain" or payment received
  | 'PAYMENT_RECEIVED_FROM_DEALER'// "Bilal se 80 hazar wasool kiye"
  | 'SALES_ORDER_OR_DISPATCH'     // "Ali ko mango juice ke 100 cartons diye"
  | 'EXPENSE_PAYMENT'             // "Electricity ka bill 45 thousand pay kiya"
  | 'RAW_MATERIAL_PURCHASE'       // "ABC supplier se 10 kilo sugar purchase ki"
  | 'RAW_MATERIAL_STOCK_RECEIPT'  // "Factory mein 2 kilo chemical receive hua hai"
  | 'PRODUCTION_BATCH_REPORT'     // "Aaj 500 bottles mango juice produce hui hain. Is production mein 500 gram chemical aur 10 kilo sugar use hui."
  | 'MACHINE_ISSUE_REPORT'        // "Machine number 2 mein issue aa raha hai."
  | 'AMBIGUOUS_OR_INCOMPLETE';

export interface ParsedVoiceTransaction {
  transcript: string;
  language_detected: 'Roman Urdu / Urdu' | 'English' | 'Mixed';
  intent: VoiceTransactionIntent;
  confidence: number;
  is_complete: boolean;
  missing_fields: string[];
  clarification_question?: string | null;
  extracted: {
    party_name?: string | null;
    matched_dealer_id?: string | null;
    matched_dealer_name?: string | null;
    matched_supplier_id?: string | null;
    matched_supplier_name?: string | null;
    product_or_flavour?: string | null;
    matched_product_id?: string | null;
    matched_product_name?: string | null;
    bottle_size_label?: string | null;
    raw_material_query?: string | null;
    matched_raw_material_id?: string | null;
    matched_raw_material_name?: string | null;
    consumed_materials?: Array<{
      raw_material_id: string;
      raw_material_name: string;
      entered_quantity: number;
      entered_unit: string;
    }>;
    machine_id?: string | null;
    machine_name?: string | null;
    problem_description?: string | null;
    priority?: 'Low' | 'Medium' | 'High' | 'Critical';
    expense_category?: ExpenseCategory | null;
    quantity?: number | null;
    unit?: string | null;
    amount_pkr?: number | null;
    unit_price_pkr?: number | null;
    payment_method?: 'Cash' | 'Bank Transfer' | 'Credit';
    ledger_impact_preview: string;
    inventory_impact_preview: string;
  };
}
