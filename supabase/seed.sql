-- ============================================================================
-- DEMO SEED DATA FOR DEVELOPMENT & TESTING ONLY
-- Clearly labeled [DEMO SEED] records for verifying ERP workflows
-- ============================================================================

INSERT INTO roles (name, description) VALUES
  ('OWNER', 'Super Admin with complete access to factory, finances, AI, and live GPS'),
  ('PRODUCTION_MANAGER', 'Manages production batches, raw materials, BOM, and machine issues'),
  ('BOOKER', 'Field salesman managing assigned areas, shops, orders, collections, and GPS tracking')
ON CONFLICT (name) DO NOTHING;

INSERT INTO flavours (name, code, color_hex) VALUES
  ('Mango', 'MNG', '#F59E0B'),
  ('Orange', 'ORG', '#F97316'),
  ('Apple', 'APL', '#EF4444'),
  ('Guava', 'GVA', '#10B981'),
  ('Mixed Fruit', 'MXF', '#8B5CF6')
ON CONFLICT (name) DO NOTHING;

INSERT INTO bottle_sizes (label, volume_ml, is_custom) VALUES
  ('250ml', 250, FALSE),
  ('500ml', 500, FALSE),
  ('1L', 1000, FALSE)
ON CONFLICT (label) DO NOTHING;

INSERT INTO packaging_types (name, units_per_carton) VALUES
  ('PET Carton (24 Units)', 24),
  ('PET Carton (12 Units)', 12),
  ('Family Pack Carton (6 Units)', 6)
ON CONFLICT (name) DO NOTHING;
