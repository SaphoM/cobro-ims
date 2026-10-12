-- ============================================================================
-- Cobro IMS — Purchase Order Supplier Becomes Optional
--
-- STATUS: schema-as-code only. Not yet applied to any live Supabase project.
-- Per project policy, this migration must be reviewed and approved before
-- running against any real database. See CHANGELOG.md and AGENTS.md.
--
-- Goods Receiving (the ad-hoc "scan it in, no delivery label" path —
-- receiveStockAction / ReceivingRepository.quickReceive) no longer requires
-- a supplier to post a receipt: a plain manufacturer barcode carries no
-- supplier at all, and the application already treats that as a genuine
-- "not yet known" state rather than guessing one. `quickReceive` still
-- creates a purchase_orders row under the hood (every receipt is backed by
-- one, for consistency with the formal PO flow), so that row's supplier_id
-- must be able to be NULL.
--
-- This column was originally `not null` (see
-- 20260815120000_foundation_and_core_inventory.sql:131). The application
-- layer already matches this change end-to-end:
--   - PurchaseOrder.supplierId is `UUID | null` (src/lib/domain/inventory.ts)
--   - QuickReceiveInput.supplierId is `string | null`
--     (src/lib/data/repositories.ts)
--   - The Purchase Orders table already renders a dash for a missing
--     supplier (src/app/dashboard/purchase-orders/page.tsx)
--   - The Supplier Summary report already groups no-supplier POs under a
--     stable "Unknown" bucket rather than dropping them
--     (src/lib/services/reports.ts)
--
-- Formal Purchase Order creation (createPurchaseOrderAction /
-- PurchaseOrderRepository.create) is UNAFFECTED by this migration: it still
-- requires a supplier to be chosen up front
-- (CreatePurchaseOrderInput.supplierId stays a required string), so an
-- Admin/Stores Manager ordering from an external supplier still must name
-- one. Only a receipt posted with no delivery label can end up with a null
-- supplier on its purchase_orders row.
--
-- This change is purely additive and backwards-compatible: every existing
-- purchase_orders row already has a non-null supplier_id, so dropping the
-- constraint does not alter any existing data, and re-adding it later
-- (should policy ever change back) remains a one-line migration as long as
-- no null rows have been written in the meantime.
-- ============================================================================

alter table purchase_orders
  alter column supplier_id drop not null;

comment on column purchase_orders.supplier_id is
  'The supplier this order was raised against. NULL for an ad-hoc Goods '
  'Receiving receipt posted with no delivery label to identify one — never '
  'guessed. Always set for a formally created purchase order '
  '(createPurchaseOrderAction still requires a supplier up front).';
