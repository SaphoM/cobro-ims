-- ============================================================================
-- Cobro IMS — Foundation + Phase 2 (Core Inventory Operations) schema
--
-- STATUS: schema-as-code only. Not yet applied to any live Supabase project.
-- Per the Foundation-phase decision, development is proceeding against a
-- mock/stub data layer (see src/lib/data/mock) while this migration defines
-- the target schema those stubs are modelled on. When a real Supabase
-- project is provisioned, this file (and subsequent ones) runs as-is via
-- `supabase db push` / `supabase migration up`.
--
-- Scope: RFQ Phase 2 (Core Inventory Operations) — Product Catalogue & BOM,
-- Multi-Warehouse Stock Ledger (WAC costing), GRN & Goods Receiving,
-- Inter-Warehouse Transfers, Write-Offs & Adjustments — plus the foundation
-- tables everything else depends on (warehouses, roles, users, audit log).
-- Sales Orders/Dispatch, full Purchase Order lifecycle, Invoicing and
-- Accounting Integration (RFQ Phases 3-4) are deliberately out of scope for
-- this migration; `purchase_orders`/`suppliers` are stubbed minimally here
-- only because GRN (Phase 2) must reference something.
--
-- BUSINESS DECISION REQUIRED items are called out inline as SQL comments
-- where the RFQ / SoW does not define a rule. Do not resolve these by
-- assumption — confirm with Cobro before Security Hardening / Production.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- RBAC: roles & users
-- Single-tenant deployment assumed (Cobro only) — RFQ describes one company,
-- <20 users, up to 5 locations. No multi-tenant "organizations" table.
-- This is a reasonable engineering assumption (category 4), not an RFQ rule.
-- ----------------------------------------------------------------------------

create table roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                 -- e.g. 'admin', 'warehouse_clerk', 'procurement', 'viewer'
  description text,
  permissions jsonb not null default '{}',    -- BUSINESS DECISION REQUIRED: exact permission matrix per role
  created_at timestamptz not null default now()
);

-- Mirrors auth.users(id) once real Supabase auth is wired up (Foundation
-- phase, not yet done). id is NOT a foreign key to auth.users yet for that
-- reason — add `references auth.users(id)` when auth lands.
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text not null,
  role_id uuid not null references roles(id),
  is_active boolean not null default true,
  mfa_enrolled boolean not null default false, -- RFQ requires 2FA for privileged users (Phase 6)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Warehouses (up to 5 per RFQ, architected for up to 10 without re-work
-- per the non-functional "Scalability" requirement)
-- ----------------------------------------------------------------------------

create table warehouses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- short code, e.g. 'DBN-FAC'
  name text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Product catalogue & BOM
-- ----------------------------------------------------------------------------

create table product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references product_categories(id)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  description text,
  category_id uuid references product_categories(id),
  unit_of_measure text not null,       -- e.g. 'ea', 'bag', 'm3', 'ton'
  barcode text unique,
  reorder_point numeric(14,3),         -- null = no auto low-stock alert configured
  reorder_quantity numeric(14,3),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bill of Materials: a product composed of other products (e.g. a palletised
-- unit of blocks composed of loose block SKUs). Self-referencing, one level
-- modelled here — BUSINESS DECISION REQUIRED: does Cobro need multi-level/
-- nested BOM, or is flat (parent -> components) sufficient?
create table product_bom (
  id uuid primary key default gen_random_uuid(),
  parent_product_id uuid not null references products(id),
  component_product_id uuid not null references products(id),
  quantity numeric(14,3) not null check (quantity > 0),
  unique (parent_product_id, component_product_id)
);

-- ----------------------------------------------------------------------------
-- Suppliers (minimal — full Supplier Management is RFQ Phase 3)
-- ----------------------------------------------------------------------------

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_email text,
  contact_phone text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Purchase orders (minimal — full PO lifecycle/auto-reorder is RFQ Phase 3;
-- stubbed here only so GRN below has something to receive against)
-- ----------------------------------------------------------------------------

create type po_status as enum ('draft', 'issued', 'partially_received', 'received', 'cancelled');

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  supplier_id uuid not null references suppliers(id),
  warehouse_id uuid not null references warehouses(id),
  status po_status not null default 'draft',
  ordered_at timestamptz,
  expected_at date,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity_ordered numeric(14,3) not null check (quantity_ordered > 0),
  quantity_received numeric(14,3) not null default 0,
  unit_cost numeric(14,4) not null check (unit_cost >= 0)
);

-- ----------------------------------------------------------------------------
-- Goods Receiving (GRN) — PO-linked, partial receipts, 3-way match target
-- ----------------------------------------------------------------------------

create type grn_status as enum ('draft', 'posted');

create table goods_receipts (
  id uuid primary key default gen_random_uuid(),
  grn_number text not null unique,
  purchase_order_id uuid not null references purchase_orders(id),
  warehouse_id uuid not null references warehouses(id),
  status grn_status not null default 'draft',
  received_by uuid references users(id),
  received_at timestamptz,
  created_at timestamptz not null default now()
);

create table goods_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid not null references goods_receipts(id) on delete cascade,
  purchase_order_line_id uuid not null references purchase_order_lines(id),
  product_id uuid not null references products(id),
  quantity_received numeric(14,3) not null check (quantity_received > 0),
  unit_cost numeric(14,4) not null check (unit_cost >= 0)
);

-- ----------------------------------------------------------------------------
-- Inter-warehouse transfers (in-transit logic)
-- ----------------------------------------------------------------------------

create type transfer_status as enum ('in_transit', 'completed', 'cancelled');

create table inter_warehouse_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_number text not null unique,
  from_warehouse_id uuid not null references warehouses(id),
  to_warehouse_id uuid not null references warehouses(id) check (to_warehouse_id <> from_warehouse_id),
  status transfer_status not null default 'in_transit',
  initiated_by uuid not null references users(id),
  initiated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table inter_warehouse_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references inter_warehouse_transfers(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity numeric(14,3) not null check (quantity > 0)
);

-- ----------------------------------------------------------------------------
-- Write-offs & adjustments — reason codes, approval workflow, stock take
-- ----------------------------------------------------------------------------

create type adjustment_status as enum ('pending_approval', 'approved', 'rejected');

-- BUSINESS DECISION REQUIRED: definitive reason-code list and which roles
-- may approve. Seeded with plausible defaults for a concrete manufacturer;
-- confirm with Cobro before Security Hardening / Production.
create table adjustment_reason_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null,
  requires_approval boolean not null default true
);

create table stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  adjustment_number text not null unique,
  warehouse_id uuid not null references warehouses(id),
  reason_code_id uuid not null references adjustment_reason_codes(id),
  status adjustment_status not null default 'pending_approval',
  requested_by uuid not null references users(id),
  requested_at timestamptz not null default now(),
  approved_by uuid references users(id),
  approved_at timestamptz
);

create table stock_adjustment_lines (
  id uuid primary key default gen_random_uuid(),
  stock_adjustment_id uuid not null references stock_adjustments(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity_delta numeric(14,3) not null,   -- signed: +found / -missing
  unit_cost numeric(14,4) not null check (unit_cost >= 0)
);

-- ----------------------------------------------------------------------------
-- Stock ledger — current on-hand snapshot per product+warehouse (WAC costing
-- per the RFQ's stated valuation method), and the append-only movement log
-- that snapshot is derived from.
-- ----------------------------------------------------------------------------

create table stock_ledger (
  product_id uuid not null references products(id),
  warehouse_id uuid not null references warehouses(id),
  quantity_on_hand numeric(14,3) not null default 0,
  quantity_reserved numeric(14,3) not null default 0,
  weighted_average_cost numeric(14,4) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (product_id, warehouse_id)
);

create type stock_movement_type as enum (
  'receipt', 'dispatch', 'transfer_out', 'transfer_in', 'adjustment', 'write_off'
);

-- Append-only. No update/delete policy is enforced at the application layer
-- today; DB-level enforcement (revoke UPDATE/DELETE, or a BEFORE trigger
-- that raises) is Security Hardening phase work — the RFQ requires audit
-- trail immutability to be enforced at the database level, not just in app
-- code, so this table is not "done" until that trigger exists.
create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  warehouse_id uuid not null references warehouses(id),
  movement_type stock_movement_type not null,
  quantity numeric(14,3) not null,          -- signed: positive = in, negative = out
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  reference_type text,                      -- 'goods_receipt' | 'stock_adjustment' | 'inter_warehouse_transfer' | ...
  reference_id uuid,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create index idx_stock_movements_product_warehouse on stock_movements (product_id, warehouse_id, created_at);

-- ----------------------------------------------------------------------------
-- Immutable audit log (Phase 6). Generic table capturing every mutating
-- action across the system, not just stock movements (stock_movements above
-- is itself one source that should also be mirrored here in Phase 6).
-- ----------------------------------------------------------------------------

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  action text not null,              -- 'insert' | 'update' | 'delete'
  changed_by uuid references users(id),
  changed_at timestamptz not null default now(),
  before jsonb,
  after jsonb
);
