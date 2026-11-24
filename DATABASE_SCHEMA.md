# Fruity Fun Juice Factory — Database Schema Reference (`DATABASE_SCHEMA.md`)

The complete SQL DDL is located in [`supabase/migrations/0001_initial_erp_schema.sql`](supabase/migrations/0001_initial_erp_schema.sql).

## Core Normalized Entities (35+ Tables)
1. **Identity & RBAC**: `roles`, `permissions`, `role_permissions`, `users`, `user_profiles`
2. **Product Catalog**: `flavours`, `bottle_sizes`, `packaging_types`, `products`
3. **Raw Materials & BOM**: `suppliers`, `raw_materials`, `purchases`, `purchase_items`, `recipes`, `recipe_items`
4. **Production & Maintenance**: `machines`, `maintenance_records`, `production_batches`, `production_items`, `production_material_usage`
5. **Finished Goods & Ledger**: `inventory`, `inventory_movements`
6. **Distribution, Sales & Finance**: `dealer_areas`, `dealers`, `shops`, `booker_assignments`, `orders`, `order_items`, `deliveries`, `dealer_ledger`, `payments`, `expense_categories`, `expenses`
7. **Field GPS & System**: `location_points`, `shop_visits`, `notifications`, `audit_logs`

## Row Level Security (RLS)
- All tables have `ENABLE ROW LEVEL SECURITY`.
- `BOOKER` accounts can only `SELECT` rows in `dealers`, `orders`, `payments`, and `dealer_ledger` where `assigned_booker_id = auth.uid()` or `booker_id = auth.uid()`.
- `expenses` and P&L views are strictly restricted to `OWNER` and `PRODUCTION_MANAGER`.
