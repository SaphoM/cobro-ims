-- ============================================================================
-- Cobro IMS — RFQ Phase 4 gap closed: credit notes
--
-- STATUS: schema-as-code only, same as every prior migration — not yet
-- applied to any live Supabase project.
--
-- RFQ names "credit notes" explicitly alongside VAT-compliant invoices and
-- payments under Invoicing & Billing. A credit note reduces what's owed on
-- an invoice without being a payment (returns, pricing corrections,
-- goodwill) — outstanding is always total - amount_paid - credited_amount.
-- ============================================================================

alter table invoices add column credited_amount numeric(14,2) not null default 0 check (credited_amount >= 0);

create table credit_notes (
  id uuid primary key default gen_random_uuid(),
  credit_note_number text not null unique,
  invoice_id uuid not null references invoices(id),
  amount numeric(14,2) not null check (amount > 0),
  reason text not null,
  issued_at timestamptz not null default now(),
  issued_by uuid not null references users(id)
);

create index idx_credit_notes_invoice on credit_notes (invoice_id);
