-- ============================================================================
-- Cobro IMS — RFQ Phase 4 (partial): Invoicing & Billing
--
-- STATUS: schema-as-code only — same as every prior migration, not yet
-- applied to any live Supabase project.
--
-- Scope: one VAT-compliant invoice per dispatched sales order, with payment
-- recording (partial payments supported) for ageing/AR reporting later.
-- Accounting system integration (Sage/QuickBooks/Xero) is NOT in this
-- migration — that's still an open BUSINESS DECISION REQUIRED item
-- (which platform) before any integration work starts.
-- ============================================================================

create type invoice_status as enum ('unpaid', 'partially_paid', 'paid', 'cancelled');

create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  sales_order_id uuid not null unique references sales_orders(id), -- one invoice per order
  customer_id uuid not null references customers(id),
  subtotal numeric(14,2) not null check (subtotal >= 0),   -- ex-VAT
  vat_amount numeric(14,2) not null check (vat_amount >= 0),
  total numeric(14,2) not null check (total >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  status invoice_status not null default 'unpaid',
  issued_at timestamptz not null default now(),
  due_at timestamptz not null,                              -- issued_at + payment terms
  created_by uuid not null references users(id)
);

create table invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  recorded_by uuid not null references users(id)
);

create index idx_invoices_status_due on invoices (status, due_at);
