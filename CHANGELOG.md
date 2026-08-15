# Changelog

Version tracks development milestones, not production releases — nothing below has shipped to a real
Supabase project or a Cobro user yet (see `docs/ARCHITECTURE.md` for what's real vs. mocked). Semantic
versioning, pre-1.0 while auth, real data, and the remaining RFQ phases are outstanding.

## v0.7.0 — 2026-08-15

**Documentation: full-context README.**
- Rewrote `README.md` as the single "read this first" entry point — business context (client, funding,
  budget/timeline reality check), current status per RFQ phase, what's real vs. mocked, demo credentials,
  how the codebase is put together (golden rule, inventory engine, reservation-vs-movement), what every
  module actually does, the open business-decision log, full project layout, and next steps in order.
  `docs/ARCHITECTURE.md` remains the more detailed, living decision log this README points to.

## v0.6.0 — 2026-08-15

**RFQ Phase 4 (partial): Invoicing & Billing, plus the version number is now shown on the login footer.**
- Schema: `invoices`, `invoice_payments`
- One VAT-compliant invoice per dispatched sales order (`VAT_RATE` = 15%, current SARS rate), 30-day
  payment terms; "Generate invoice" appears on a dispatched order once, then reads "Invoiced"
- Payments (partial or full) move status unpaid → partially paid → paid; `/dashboard/invoices` shows
  outstanding total, overdue count, and per-invoice ageing against the due date
- Login page footer now reads live from `package.json` (`Built by X Spark · v{version}`) instead of a
  static string
- Verified: a 20-bag order at R200/bag produced exactly R4,000.00 subtotal / R600.00 VAT / R4,600.00
  total due 30 days out; a R2,000 partial payment then the R2,600 remainder moved the invoice through
  partially-paid to paid exactly

## v0.5.0 — 2026-08-15

**Closes the RFQ Phase 3 gap: full Purchase Order lifecycle.**
- `PurchaseOrderRepository`: draft → issue → receive (one or more times; partial receipts supported)
  until fully received
- New `/dashboard/purchase-orders` page — create, issue, and an inline receive control capped at the
  outstanding quantity
- Verified: a 100-unit PO received in two passes (60 then 40) — status and ledger WAC both correct at
  each step

## v0.4.0 — 2026-08-15

**RFQ Phase 3, sales half: Sales Orders & Dispatch, plus Suppliers and Customers.**
- Schema: `customers`, `sales_orders`, `sales_order_lines`
- Engine: `stock_ledger.adjustReserved` — a ledger-state change separate from `applyMovement` (reserving
  stock doesn't touch WAC or post a movement)
- Sales orders: draft → confirm (reserve) → dispatch (post movement at current WAC, release reservation)
  or cancel (release reservation, no movement)
- New `/dashboard/suppliers` and `/dashboard/customers` pages (list + add), feeding the receiving and
  sales order pickers
- Verified: confirming reserved exactly the ordered quantity with on-hand/WAC untouched; cancelling a
  confirmed order released the reservation exactly; dispatch posted the movement and dropped on-hand by
  exactly the ordered quantity

## v0.3.0 — 2026-08-15

**RFQ Phase 2: Core Inventory Operations.**
- New `/dashboard` sidebar shell (Overview, Product catalogue, Goods receiving, Transfers, Write-offs &
  adjustments)
- Product catalogue: list + add
- Goods receiving: "quick receive" (creates PO + PO line + GRN + GRN line, posts the movement, in one
  step) for ad-hoc receipts with no formal PO
- Inter-warehouse transfers: initiate (`transfer_out` at source, in-transit) → complete (`transfer_in` at
  destination, carrying the source's WAC as cost)
- Write-offs & adjustments: request (`pending_approval`, no ledger effect) → approve/reject (approval
  posts the movement; rejection never touches the ledger)
- Verified end-to-end: exact WAC math confirmed across a GRN receipt, an inter-warehouse transfer, and an
  approved write-off

## v0.2.0 — 2026-08-15

**Foundation phase.**
- Postgres schema-as-code (`supabase/migrations`) covering Foundation + RFQ Phase 2 — written for
  Supabase, not yet applied to any live project (see `docs/ARCHITECTURE.md` §2 for why)
- Domain types mirroring the schema
- The inventory engine (`src/lib/services/inventory-engine.ts`) — Weighted-Average-Cost costing as pure,
  unit-testable functions
- Mock repository layer implementing the real repository interfaces, swappable for Supabase later via a
  single switch in `src/lib/data/index.ts`
- Login screen (mock auth) and an authenticated dashboard shell showing live KPIs, the stock ledger, and
  a "record a movement" demo proving the engine end-to-end

## v0.1.0 — 2026-08-15

Project scaffold: Next.js 16 (App Router), React 19, TypeScript, Tailwind v4.
