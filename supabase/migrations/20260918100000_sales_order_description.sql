-- Adds a manually-entered description/reason to requisitions (sales_orders).
--
-- Mandatory (enforced in the createSalesOrderAction server action, not by a
-- DB constraint — mirrors the pattern used for other conditional business
-- rules in this app such as price/stock checks) when the requisitioned
-- product is in the "Repair items" category (see
-- 20260916120000_repair_category_seed.sql); optional and typically null for
-- normal product requisitions.
--
-- Note: sales_orders is the table actually read/written by
-- sbSalesOrderRepository (src/lib/data/supabase/repositories.ts) — the
-- description column is added here to match that live code path, not to
-- sales_order_lines.

alter table sales_orders
  add column if not exists description text;
