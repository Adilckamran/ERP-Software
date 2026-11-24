import { z } from 'zod';

export const RoleSchema = z.enum(['OWNER', 'PRODUCTION_MANAGER', 'BOOKER']);

export const CreateFlavourSchema = z.object({
  name: z.string().min(2, 'Flavour name is required'),
  code: z.string().min(2).max(6).toUpperCase(),
  color_hex: z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, 'Valid hex color required'),
});

export const CreateBottleSizeSchema = z.object({
  label: z.string().min(2, 'Bottle size label is required (e.g., 250ml, 500ml, 1L)'),
  volume_ml: z.number().int().positive('Volume in ml must be positive'),
  is_custom: z.boolean().default(false),
});

export const CreateProductionBatchSchema = z.object({
  production_date: z.string().min(10, 'Valid date required'),
  product_id: z.string().min(1, 'Product is required'),
  batch_number: z.string().min(3, 'Batch number is required'),
  target_cartons: z.number().int().positive('Production target must be > 0'),
  actual_cartons: z.number().int().min(0, 'Actual production cannot be negative'),
  wastage_cartons: z.number().min(0, 'Wastage cannot be negative').default(0),
  machine_id: z.string().min(1, 'Machine is required'),
  status: z.enum(['Planned', 'In Progress', 'Completed', 'On Hold', 'Rejected']),
  remarks: z.string().optional(),
});

export const CreateRawMaterialSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  category: z.enum([
    'Sweetener',
    'Water',
    'Concentrate',
    'Flavouring',
    'Preservative',
    'Bottle',
    'Cap',
    'Label',
    'Carton',
    'Packaging',
  ]),
  unit: z.enum(['kg', 'liter', 'piece', 'carton', 'roll', 'gram']),
  current_stock: z.number().min(0),
  minimum_stock_level: z.number().min(0),
  average_cost_per_unit: z.number().min(0),
  supplier_id: z.string().optional().nullable(),
});

export const CreatePurchaseSchema = z.object({
  supplier_id: z.string().min(1, 'Supplier is required'),
  purchase_date: z.string().min(10),
  amount_paid: z.number().min(0),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        raw_material_id: z.string().min(1),
        quantity: z.number().positive('Quantity must be > 0'),
        unit_price: z.number().positive('Unit price must be > 0'),
      })
    )
    .min(1, 'At least one purchase item is required'),
});

export const CreateDealerSchema = z.object({
  dealer_name: z.string().min(2, 'Dealer name is required'),
  shop_name: z.string().min(2, 'Shop name is required'),
  contact_number: z.string().min(7, 'Valid phone number required'),
  address: z.string().min(4, 'Address is required'),
  area_id: z.string().min(1, 'Area is required'),
  assigned_booker_id: z.string().min(1, 'Assigned booker is required'),
  opening_balance: z.number().default(0),
  credit_limit: z.number().min(0, 'Credit limit cannot be negative'),
  latitude: z.number().min(-90).max(90).default(31.5204),
  longitude: z.number().min(-180).max(180).default(74.3587),
  geofence_radius_meters: z.number().int().min(20).max(1000).default(100),
});

export const CreateOrderSchema = z.object({
  idempotency_key: z.string().min(6, 'Idempotency key required to prevent duplicate orders'),
  dealer_id: z.string().min(1, 'Dealer/Shop is required'),
  booker_id: z.string().min(1, 'Booker is required'),
  payment_status: z.enum(['Unpaid (Credit)', 'Partially Paid', 'Paid']),
  amount_paid_on_order: z.number().min(0).default(0),
  delivery_notes: z.string().optional(),
  items: z
    .array(
      z.object({
        product_id: z.string().min(1),
        quantity_cartons: z.number().int().positive('Carton quantity must be at least 1'),
        rate_per_carton: z.number().positive('Rate must be positive'),
        discount_amount: z.number().min(0).default(0),
      })
    )
    .min(1, 'Order must contain at least one product line'),
});

export const RecordPaymentSchema = z.object({
  dealer_id: z.string().min(1, 'Dealer is required'),
  amount: z.number().positive('Payment amount must be greater than zero'),
  direction: z.enum(['INCOMING_FROM_DEALER', 'OUTGOING_TO_PERSON']).default('INCOMING_FROM_DEALER'),
  payment_method: z.enum(['Cash', 'Bank Transfer', 'Cheque', 'Online Wallet']),
  reference_number: z.string().min(2, 'Reference number is required'),
  payment_date: z.string().min(10),
  notes: z.string().optional(),
});

export const CreateExpenseSchema = z.object({
  category: z.enum([
    'Electricity',
    'Fuel',
    'Salaries',
    'Factory rent',
    'Machine maintenance',
    'Transportation',
    'Raw materials',
    'Packaging',
    'Marketing',
    'Other expenses',
  ]),
  amount: z.number().positive('Expense amount must be > 0'),
  date: z.string().min(10),
  description: z.string().min(3, 'Description is required'),
  payment_method: z.enum(['Cash', 'Bank Transfer', 'Cheque', 'Company Card']),
  receipt_attachment_url: z.string().optional().nullable(),
});

export const CreateMaintenanceIssueSchema = z.object({
  machine_id: z.string().min(1, 'Machine is required'),
  problem_description: z.string().min(5, 'Problem description is required'),
  issue_date: z.string().min(10),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']),
  repair_notes: z.string().default(''),
  maintenance_cost: z.number().min(0).default(0),
});

export const RecordGpsLocationSchema = z.object({
  booker_id: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy_meters: z.number().min(0),
  speed_kmh: z.number().min(0).default(0),
  battery_pct: z.number().min(0).max(100).default(100),
  is_moving: z.boolean().default(true),
  is_mock_location: z.boolean().default(false),
  recorded_at: z.string().optional(),
  synced_from_offline_queue: z.boolean().default(false),
});
