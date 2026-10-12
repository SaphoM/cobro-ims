-- ============================================================================
-- Cobro IMS — Product Packaging & Individual-Unit Cost
--
-- STATUS: schema-as-code only. Not yet applied to any live Supabase project.
-- Per project policy, this migration must be reviewed and approved before
-- running against any real database. See CHANGELOG.md and AGENTS.md.
--
-- Adds three nullable columns to `products` to support dynamic Units of
-- Measure, packaging configurations, and explicit individual-unit costing.
--
-- All columns default to NULL for full backwards compatibility: every
-- existing product row is unaffected (non-packaged behaviour unchanged).
--
-- Column semantics (mirrors src/lib/domain/inventory.ts Product interface):
--
--   packaging_uom     — the packaging unit (e.g. 'box', 'bag', 'roll').
--                       NULL = product is received/issued in stock UOM only.
--
--   qty_per_package   — how many stock-UOM units are in one packaging unit
--                       (e.g. 100 bolts per box). Must be positive when set.
--                       NULL when packaging_uom is NULL.
--
--   default_unit_cost — the explicitly entered cost per individual stock unit
--                       captured at product creation. This is the initial
--                       costing reference, NOT the selling price (unit_price),
--                       and NOT the WAC (which is derived from receipts).
--                       NULL until set by a manage_catalogue user.
-- ============================================================================

alter table products
  add column if not exists packaging_uom     text,
  add column if not exists qty_per_package   numeric(14,6) check (qty_per_package > 0),
  add column if not exists default_unit_cost numeric(14,6) check (default_unit_cost >= 0);

-- Enforce consistency: qty_per_package is only meaningful when packaging_uom
-- is set, and vice versa. Both columns must be present or both absent.
alter table products
  add constraint products_packaging_pair check (
    (packaging_uom is null) = (qty_per_package is null)
  );

comment on column products.packaging_uom is
  'The packaging unit in which this product is purchased (e.g. box, bag, roll). '
  'NULL = no packaging — product transacted directly in unit_of_measure.';

comment on column products.qty_per_package is
  'Number of stock-UOM units per packaging unit (e.g. 100 bolts per box). '
  'Must be positive. NULL when packaging_uom is NULL.';

comment on column products.default_unit_cost is
  'Explicitly entered cost per individual stock unit (unit_of_measure), '
  'captured at product creation as the initial costing reference. '
  'Distinct from unit_price (selling price) and from WAC (from receipts).';
