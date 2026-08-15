-- ============================================================================
-- Cobro IMS — RFQ Phase 3 (partial): Sales Orders & Dispatch
--
-- STATUS: schema-as-code only, same as the Foundation migration — not yet
-- applied to any live Supabase project. See that migration's header for the
-- full explanation of why (mock/stub data layer during Foundation phase).
--
-- Scope: customers + sales orders + reservation/dispatch. Full Purchase
-- Order lifecycle & Supplier Management UI (the other half of RFQ Phase 3)
-- is not in this migration — `suppliers` and a minimal `purchase_orders`
-- already exist from the Foundation migration and are sufficient for the
-- "quick receive" GRN flow; a proper PO issue/approve/receive lifecycle is
-- still open work.
-- ============================================================================

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_email text,
  contact_phone text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create type sales_order_status as enum ('draft', 'confirmed', 'dispatched', 'cancelled');

-- Single line per order today (see src/lib/domain/inventory.ts SalesOrder
-- comment) — modelled as parent+lines anyway so multi-line is a UI change
-- later, not a schema migration.
create table sales_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references customers(id),
  warehouse_id uuid not null references warehouses(id),
  status sales_order_status not null default 'draft',
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  dispatched_at timestamptz
);

create table sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references sales_orders(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity_ordered numeric(14,3) not null check (quantity_ordered > 0),
  quantity_dispatched numeric(14,3) not null default 0,
  unit_price numeric(14,4) not null check (unit_price >= 0)
);

-- Confirming a sales order reserves stock (stock_ledger.quantity_reserved)
-- without moving quantity_on_hand or touching WAC — this is a ledger-state
-- change, not a stock_movements entry, mirroring how src/lib/data/mock's
-- `adjustReserved` is kept separate from `applyMovement` in the engine.
-- Dispatching posts a real 'dispatch' stock_movements row (see the
-- Foundation migration's stock_movement_type enum) and releases the
-- matching reservation in the same transaction.
