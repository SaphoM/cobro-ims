# Cobro IMS — Architecture & Decision Log

**Client:** Cobro Concrete (Pty) Ltd · **Technology partner:** X Spark
**Source of truth:** `../Scope of Work Request_IMS.docx`, `../PO9522- Cobro - Inventory System.pdf`,
`../Cobro IMS System Map.png` (all in the parent folder — read before changing scope here)

This document is the running record of what's been decided, what's still open, and why. Update it as
phases complete — don't let it drift from the code.

## 1. Current phase

**Phases 2, 3, and 5 done; Phase 4 half done (invoicing yes, accounting integration no); Phase 6 well
underway (RBAC enforcement, 2FA gate on the most sensitive action, append-only audit log — real DB-level
immutability trigger written but not applied).** Real AUTHENTICATION (Supabase Auth) and CORE DATA (a
live Supabase project) are explicitly deferred for now — by direction, not oversight — so the mock auth
and mock data layer described below are still current. Not yet started: accounting integration,
camera-based barcode scanning, UAT, PRODUCTION.

Built and browser-verified (not just written — each flow below was exercised end-to-end and the
resulting WAC math checked by hand):

- **Product catalogue** (`/dashboard/products`) — list + add product.
- **Goods receiving** (`/dashboard/receiving`) — a "quick receive" flow that creates the PO, PO line, GRN
  and GRN line, then posts the stock movement. Deliberately skips a separate PO-issuing step since full
  Purchase Order lifecycle management is RFQ Phase 3, not Phase 2 — the schema still models PO → GRN
  properly underneath.
- **Inter-warehouse transfers** (`/dashboard/transfers`) — initiate posts a `transfer_out` at the source
  immediately (in-transit); complete posts the matching `transfer_in` at the destination, carrying the
  source's WAC as the transferred cost. Verified: transferring stock correctly re-derives the
  destination's WAC using the source's cost, not the destination's placeholder cost.
- **Write-offs & adjustments** (`/dashboard/adjustments`) — request stays `pending_approval` and never
  touches the ledger; approving posts the movement (sign of `quantityDelta` decides `adjustment` vs.
  `write_off`), rejecting never does. Verified end-to-end including the approval gate.
- **Sales orders & dispatch** (`/dashboard/sales`, RFQ Phase 3) — draft → confirm (reserves stock via
  `quantity_reserved`, no ledger movement, no WAC change) → dispatch (posts a real `dispatch` movement at
  the ledger's current WAC and releases the reservation) or cancel from draft/confirmed (releases any
  reservation, posts nothing). Verified: confirming moved reserved +200 with on-hand/WAC untouched;
  cancelling a confirmed order released it back exactly; dispatching posted the movement and dropped
  on-hand by exactly the ordered quantity while releasing the reservation.
- **Suppliers** (`/dashboard/suppliers`) and **Customers** (`/dashboard/customers`) — list + add, feeding
  the pickers on receiving and sales orders respectively.
- **Purchase orders** (`/dashboard/purchase-orders`, closing the RFQ Phase 3 gap) — draft → issue →
  receive one or more times against it (partial receipts supported, each posts its own GRN + `receipt`
  movement at the PO's quoted cost) until fully received. `Goods receiving`'s quick-receive remains the
  path for genuine ad-hoc receipts with no PO. Verified: a 100-unit PO partially received at 60 then the
  remaining 40 — status moved draft → issued → partially received → received exactly on quantity, and
  the ledger's WAC recalculated correctly after each receipt.
- **Invoicing & billing** (`/dashboard/invoices`, RFQ Phase 4) — one VAT-compliant invoice per dispatched
  sales order (`VAT_RATE` = 15%, the current SARS rate), 30-day payment terms matching Cobro's own terms
  as vendor to Productivity SA. Payments (partial or full) move status unpaid → partially paid → paid;
  ageing is computed from `dueAt` against wall-clock time. Verified: a 20-bag order at R200/bag produced
  exactly subtotal R4,000.00 / VAT R600.00 / total R4,600.00 due 30 days out; a R2,000 partial payment
  then the R2,600 remainder moved the invoice through partially-paid to paid exactly, and the sales page
  correctly blocks double-invoicing a dispatched order.
- **Dashboards & reports** (`/dashboard/reports`, RFQ Phase 5) — **fifteen reports, the RFQ's "15+"
  target reached:** stock valuation (by warehouse, subtotals + grand total), low stock/reorder
  suggestions, warehouse summary (SKU count/below-reorder count/value per location), dormant stock
  (on-hand with no movement recorded this server session — caveated: mock data has no persistent
  movement history before that, so this isn't true long-term dormancy), sales order summary, customer
  summary, pick list (confirmed/dispatched orders — the RFQ's own "pick lists" phrase), purchase order
  summary, supplier summary, open purchase orders (issued/partially-received exceptions only, with days
  open), invoice ageing (current/1-30/31-60/61-90/90+), stock movement history, receiving history,
  movement type totals, and adjustment reason summary (counts by reason+status — quantity/value impact
  isn't tracked at this level since `StockAdjustmentLine` isn't exposed by the repository yet). Every
  table exports to CSV via a reusable client component (`src/components/export-csv-button.tsx`),
  satisfying the RFQ's "exportable to Excel/CSV at any time" non-functional requirement. Report-building
  logic lives in `src/lib/services/reports.ts` as pure functions (fetch via repositories, then build),
  mirroring the inventory engine's shape. Verified across a live scenario touching five of the new
  reports at once: a 100-unit PO received in two passes (60 then the remainder outstanding) showed
  exactly matching numbers on purchase order summary (100/60/40), supplier summary (R9,000 ordered /
  R5,400 received), and open purchase orders (40 outstanding, R3,600); dormant stock correctly dropped
  the touched SKU from 8 rows to 7 the moment it was received; a confirmed sales order appeared correctly
  on the pick list as "Ready to pick"; a requested (not yet approved) adjustment showed as 1 pending on
  the reason summary.
- **Barcode / QR scan** (`/dashboard/scan`, RFQ Phase 5) — a lookup page: scan or type a barcode, see
  that product's stock across every warehouse. USB scanners work today (they act as keyboard input,
  submitting a plain GET form on Enter — no client JS needed for the scan itself). Also wired into
  **Goods receiving**: a barcode field there matches against the loaded product list client-side and
  auto-selects the product dropdown. Verified: scanning `6001240912345` on the lookup page returned the
  correct product and per-warehouse ledger; scanning `6001240912346` on the receiving form correctly
  selected `BLK-STD-140` in the product dropdown; an unknown barcode showed a clear not-found message.
  **Not built:** camera-based scanning (`getUserMedia` + a barcode-decoding library) — RFQ allows
  "browser-based camera scanning and/or USB scanner support", so USB-only satisfies the requirement as
  written, but camera support would need real hardware to test properly.
- **Product labels** (`/dashboard/labels`, RFQ Phase 5) — pick a product and a copy count, get a
  print-ready sheet (`@media print` hides the sidebar/nav via a `.no-print` convention, `print:` variant
  keeps label cards from splitting across a page break). Each label shows SKU, product name, and the
  barcode number in large, clear monospace text. **Deliberately not** a rendered Code 128/QR barcode
  symbol graphic — implementing that correctly needs the full standard bar-width lookup table, which this
  pass had no way to verify against a real scanner, and a wrong symbol would look legitimate on screen
  while not actually decoding; the honest choice was a human/scanner-readable text code over a fabricated
  image. Linked from the product catalogue's "Print labels" action per row. Verified: generated a 6-copy
  sheet for `CEM-42.5-50KG`, correct SKU/name/barcode on every card, page renders cleanly with no console
  errors.
- **RBAC & audit log** (RFQ Phase 6, partial) — a real permission matrix (`src/lib/permissions.ts`,
  `Permission` type + `ROLE_PERMISSIONS`) enforced in every mutating Server Action, checked the same way
  every action already re-checks `getSession()` rather than trusting the page's login redirect. Four demo
  accounts (one per role: admin, warehouse clerk, procurement, viewer — pick one on the login page) make
  this actually testable. Every audited action also writes to an append-only `AuditLogRepository`, viewable
  at `/dashboard/audit-log`; the real Postgres immutability trigger (RFQ: "no record may be deleted or
  modified — enforced at the database level") is written and ready in
  `supabase/migrations/20260816100000_audit_log_immutability.sql`, waiting on a live project.
  **Caught and fixed during this pass:** the generic "record a movement" demo form on the dashboard
  overview could post any movement type — including write-offs — with no permission or approval check,
  which would have been a straight RBAC bypass around the dedicated `/dashboard/adjustments` approval
  flow; it's now gated behind the same `approve_adjustments` permission as approving adjustments.
  Verified: signed in as Viewer, attempted to post a movement via that form → blocked with a clear error,
  ledger unchanged; signed in as Admin, same action → succeeded, WAC recalculated correctly; requested and
  approved an adjustment as Admin → both actions appeared in the audit log with correct table/action/user.
  **The permission matrix itself is a placeholder** (see §5.2) — plausible role assignments, not a
  policy confirmed with Cobro.
- **2FA for privileged users** (`/dashboard/security`, RFQ Phase 6) — a mock enrollment flow (no real
  authenticator app; just the `users.mfa_enrolled` flag a real Supabase Auth MFA flow would set) that
  gates `approve_adjustments` — the one action in the app that posts a real WAC-affecting stock movement
  with no second approver, and so the single most sensitive capability in the matrix. `checkPermission`
  in `src/lib/permissions.ts` now checks role AND, for that one permission, MFA enrollment; every call
  site (including the generic dashboard "record a movement" form) goes through it. Verified: signed in
  as Admin with 2FA not yet enabled, attempted to approve a pending adjustment → blocked with "This
  action requires two-factor authentication. Enable 2FA under Security first."; enabled 2FA on
  `/dashboard/security` → the same approval then succeeded.

What exists as the underlying substrate is a **schema-and-engine-first vertical slice**, not a partial
ERP:

- A Postgres schema (`supabase/migrations/`) covering Foundation + RFQ Phase 2 (Core Inventory
  Operations), written for Supabase but not applied to any live project yet.
- The domain model in TypeScript (`src/lib/domain`) mirroring that schema by hand.
- The **inventory engine** (`src/lib/services/inventory-engine.ts`) — the Weighted-Average-Cost costing
  logic that every stock-affecting workflow must go through. This is the "critical inventory engine" to
  prove before building outward into procurement/sales/invoicing, and it's implemented as pure,
  unit-testable functions with no I/O.
- A **mock data layer** (`src/lib/data/mock`) implementing the exact repository interfaces
  (`src/lib/data/repositories.ts`) a real Supabase-backed layer will later implement, so swapping is a
  one-file change in `src/lib/data/index.ts`, not a rewrite.
- A working login screen and an authenticated dashboard that reads the mock stock ledger, computes KPIs,
  and can post a stock movement live — proving data flows end-to-end: mock data → repository → inventory
  engine → UI, per the Golden Rule (DATA → DOMAIN → API → BUSINESS LOGIC → SECURITY → UI → REPORTING).

## 2. Why mock data instead of a live Supabase project

Decided explicitly for the Foundation phase: build against schema-as-code and a swappable mock repository
layer rather than provisioning a live Supabase project immediately. Reasons:

- Production ownership is meant to end up with Cobro (per the brief's Ownership Principle), and no
  Cobro-controlled Supabase org exists yet — provisioning now would default to X Spark's own org, which
  is workable but not something to do silently.
- Doesn't block development on that account-setup conversation.

**When a real Supabase project exists:** run the migration in `supabase/migrations/`, implement
`src/lib/data/supabase/*.ts` against the same repository interfaces, and flip `DATA_SOURCE=supabase` in
`src/lib/data/index.ts`. No calling code (services, pages, actions) should need to change.

## 3. Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4.
- **Data (target):** Supabase — Postgres, Auth, Storage, Edge Functions. Not yet provisioned (see §2).
- **Data (current):** in-memory mock repositories, same interfaces the Supabase layer will implement.
- This matches the system map's intent (responsive SPA, RESTful data access, relational DB, OAuth/2FA)
  without a separate Node/.NET API tier — Supabase's generated REST/Postgres + Edge Functions cover that
  role, which matters given the budget/timeline (§5).

## 4. What's real vs. mocked right now

| Area | Status |
| --- | --- |
| UI (login, dashboard shell + nav, product/receiving/transfers/adjustments pages) | Real, matches the
  approved visual design |
| WAC costing math | Real business logic, pure functions, in `inventory-engine.ts`, exercised by every
  workflow above (not just the original demo form) |
| GRN receiving, transfers, adjustment approval workflows | Real logic and real UI, running against the
  mock data layer — see §1 |
| Database schema | Written (`supabase/migrations`), **not applied anywhere** |
| Auth | Mock — one hardcoded demo user/password in `src/lib/auth.ts`, cookie session. **Deferred by
  direction**, not the Authentication phase deliverable. No password hashing, no MFA (RFQ requires 2FA
  for privileged users), no real Supabase Auth yet. |
| RBAC | **Real enforcement** in every mutating Server Action (`src/lib/permissions.ts`), four demo
  accounts (one per role) to test with. The matrix itself is a placeholder pending Cobro sign-off — §5.2 |
| Audit log | **Real** — every audited action writes an append-only entry, viewable at `/dashboard/audit-log`.
  DB-level immutability trigger is written (`supabase/migrations/20260816100000_...sql`) but not applied
  anywhere yet — needs a live project |
| Sales orders & dispatch (reservation + dispatch) | Real logic and UI — see §1 |
| Purchase order lifecycle (draft/issue/partial-receive) | Real logic and UI — see §1 |
| Invoicing & billing (VAT, payments, ageing) | Real logic and UI — see §1 |
| Accounting Integration (Sage/QuickBooks/Xero) | Not started — blocked on §5.5 (which platform) |
| Dashboards & reports (15 of "15+", CSV export) | Real logic and UI — see §1 |
| Barcode/QR scanning (USB scanner, lookup + receiving) | Real logic and UI — see §1 |
| Product labels (`/dashboard/labels`, print-ready sheets) | Real logic and UI — see §1 |
| Camera-based scanning, rendered barcode symbol graphic (Code 128/QR) | Not built |
| 2FA for privileged users | **Real gate** on `approve_adjustments` — mock enrollment (`/dashboard/security`), no real authenticator app |

## 5. BUSINESS DECISION REQUIRED — do not resolve these by assumption

1. **MVP cut-line for the 8-week/R171,695 delivery window.** The full RFQ scope (procurement → warehouse
   → sales → invoicing → accounting integration → RBAC/2FA → immutable audit trail → 15+ reports →
   barcode scanning → POPIA/VAT compliance → 99.5% uptime SLA) is large for the budget and timeline on
   the Purchase Order. Needs an explicit conversation with Cobro/Productivity SA about what ships by
   30/09/2026 vs. what falls into the 6-month post-delivery support window.
2. **Permission matrix per role.** `src/lib/permissions.ts` now has a real, *enforced* matrix (who can
   approve write-offs, issue POs, generate invoices, etc.) — but it's still a placeholder built from
   plausible role responsibilities, not a matrix the RFQ defines or Cobro has confirmed. Notably strict
   today: only `admin` can approve/reject adjustments, manage the product catalogue, or manage customers.
   Confirm real assignments before Production.
3. **BOM structure.** Schema currently models one-level (parent → component) BOM. Confirm whether Cobro
   needs nested/multi-level BOM (e.g. a palletised product built from sub-assemblies).
4. **Adjustment reason codes.** Seeded with plausible defaults (`BREAKAGE`, `CYCLE_COUNT`, `THEFT_LOSS`,
   `FOUND_STOCK`) and "requires approval" defaulted to true for all — confirm the real list and which
   roles approve which reasons.
5. **Accounting integration target.** RFQ allows Sage, QuickBooks, or Xero "or equivalent" — not yet
   chosen. This affects the Phase 4 integration design materially.
6. **Reorder point scope.** Currently modelled as one `reorder_point` per product (implicitly applied per
   warehouse in the dashboard's low-stock flag). Confirm whether Cobro wants per-warehouse reorder
   thresholds instead of one global figure per SKU.
7. **VAT-exempt sales.** Every invoice generated today is standard-rated at 15%. Confirm whether any
   Cobro customers (e.g. export sales) need a 0%-rated invoice path — the current model doesn't have one.
8. **Payment terms.** Invoices default to 30-day terms, matching Cobro's own terms as vendor to
   Productivity SA. Confirm this is actually Cobro's customer-facing policy — it may differ by customer.

## 6. Next steps (in order)

1. Resolve §5.1 (MVP cut-line) with the client before committing further engineering time — this
   materially changes phase sequencing.
2. Resolve §5.2 (permission matrix) and §5.5 (accounting platform) with the client.
3. AUTHENTICATION phase: real Supabase project + Supabase Auth, replacing `src/lib/auth.ts` — including
   real password hashing; the 2FA *gate* exists (§1), but real Supabase Auth MFA (an actual authenticator
   app enrollment) still needs to replace the mock flag-flip in `/dashboard/security`.
4. CORE DATA phase: apply all migrations (including the audit-log immutability trigger) to that project,
   replace the mock repositories with real Supabase-backed ones behind the same interfaces.
5. Accounting integration once §5.5 is decided.
6. Remainder of Phase 5: camera-based barcode scanning, rendered barcode symbol graphics — reports are done.
7. Phase 8: system testing, UAT, training materials, production cutover.
