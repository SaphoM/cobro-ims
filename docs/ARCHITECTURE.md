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

- **MRO scope alignment — Sales & Dispatch repurposed into Requisitions** (client discovery meeting).
  Confirmed: Cobro IMS is internal MRO stock control — Stores purchases → items scanned in → held →
  workshop requisitions parts → Stores processes the request → items scanned out. Not customer sales, a
  CRM, or e-commerce.

  The **"Sales orders & dispatch" and "Customers" bullets further down in this section describe what was
  originally built** — a real customer/VAT/sales module (`SalesOrder.customerId`, linked VAT invoices,
  payments, credit notes). None of that applies to an internal workshop request. Rather than build a
  second, parallel module, the existing one was **repurposed** — chosen explicitly over the alternative of
  leaving it untouched and building Requisitions fresh, because a genuinely new module is materially more
  engineering time than this budget/timeline (§5.1) can easily absorb, and this app never had real
  external-customer sales data to lose.

  **What changed (UI/copy only, route `/dashboard/sales` unchanged):**
  - Nav: "Sales & dispatch" → "Requisitions", "Customers" → "Departments"; "Invoicing & billing" removed
    from nav entirely.
  - Page copy, table headers, status labels: Confirm/Reserved → Approve/Approved, Dispatch/Dispatched →
    Issue/Issued. Order numbers now generate as `REQ-####` (`src/lib/data/mock/repositories.ts`,
    `salesOrderCounter` — the counter variable name is unchanged, only the display prefix).
  - The "Generate invoice" action was removed from the requisitions list — the only UI path that ever
    created an invoice. `/dashboard/invoices` and its Server Actions are **untouched and still work** if
    visited directly (verified live — the page renders, no errors); they're just unreachable from
    navigation and nothing populates them going forward. Not deleted, per the same "don't delete
    unnecessarily, allow dormant" principle already established for accounting integration (§5.5).
  - Reports page: "Sales order summary" → "Requisition summary", "Customer summary" → "Department
    summary", Pick list relabeled to match. "Invoice ageing" removed from the reports UI (the
    `buildInvoiceAgeing` function itself stays in `reports.ts`, unused) — dropping the live report count
    from 15 to 14 against the RFQ's "15+" target. One stray customer-facing link ("Sell this product" on
    the barcode scan page) corrected to "Requisition this product".
  - **Deliberately NOT renamed:** the `SalesOrder`/`Customer` TypeScript types, `salesOrderRepository`/
    `customerRepository`, the `manage_sales_orders`/`manage_customers` permission strings, DB/migration
    column names. This was a terminology and workflow-labeling fix per the meeting's own instruction
    ("ONLY make this terminology change where the term refers to the internal stock-request workflow") —
    renaming internal identifiers touches the data layer, every report, and the future Supabase migrations
    for zero user-visible benefit, and risks breaking something for no reason.

  **Verified live end-to-end:** created `REQ-1001` (20 bags cement, Thabo Construction department) →
  Approved → Issued. Ledger dropped exactly 1,840 → 1,820 on hand at DBN-FAC through the same WAC engine
  (no second inventory path), audit log recorded the `sales_orders`/`update` entry with user and
  timestamp, and no "Generate invoice"/"Invoiced" action appeared anywhere in the flow. `/dashboard/invoices`
  confirmed still renders standalone with zero errors. Regression-checked: the 36px form-control standard
  and the mobile nav drawer (§ below) both still pass on the renamed pages.

  **Business decisions this surfaced, not resolved here** — see §5.6–§5.9: a distinct "requesting user"
  role doesn't exist yet; there's no formal multi-step approval hierarchy (Approve today is a single gate,
  same permission as Issue); partial issues aren't supported; no low-stock push/email notification exists,
  only the dashboard tile and report.
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
- **Sales orders & dispatch — superseded, see the MRO scope alignment entry above.** This bullet describes
  what was originally built, kept for the historical record; the module now runs as "Requisitions" with
  the labels and flow described above, same underlying code. (`/dashboard/sales`, RFQ Phase 3) — draft → confirm (reserves stock via
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
- **Invoicing & billing — dormant, see the MRO scope alignment entry above.** No longer reachable from
  navigation or created by any requisition; still fully functional if visited directly.
  (`/dashboard/invoices`, RFQ Phase 4) — one VAT-compliant invoice per dispatched
  sales order (`VAT_RATE` = 15%, the current SARS rate), 30-day payment terms matching Cobro's own terms
  as vendor to Productivity SA. Payments (partial or full) move status unpaid → partially paid → paid;
  ageing is computed from `dueAt` against wall-clock time. Verified: a 20-bag order at R200/bag produced
  exactly subtotal R4,000.00 / VAT R600.00 / total R4,600.00 due 30 days out; a R2,000 partial payment
  then the R2,600 remainder moved the invoice through partially-paid to paid exactly, and the sales page
  correctly blocks double-invoicing a dispatched order.
- **Dashboards & reports** (`/dashboard/reports`, RFQ Phase 5) — **fourteen reports** against the RFQ's
  "15+" target (was fifteen; Invoice ageing retired with the MRO scope alignment above — see that entry):
  stock valuation (by warehouse, subtotals + grand total), low stock/reorder suggestions, warehouse
  summary (SKU count/below-reorder count/value per location), dormant stock (on-hand with no movement
  recorded this server session — caveated: mock data has no persistent movement history before that, so
  this isn't true long-term dormancy), requisition summary, department summary, pick list (approved/issued
  requisitions — the RFQ's own "pick lists" phrase), purchase order summary, supplier summary, open
  purchase orders (issued/partially-received exceptions only, with days open), stock movement history,
  receiving history, movement type totals, and adjustment reason summary (counts by reason+status —
  quantity/value impact isn't tracked at this level since `StockAdjustmentLine` isn't exposed by the
  repository yet). Every
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
  that product's stock across every warehouse. **USB/Bluetooth scanners** work (they act as keyboard
  input, submitting a plain GET form on Enter — no client JS needed for the scan itself), and so does
  the **browser camera** on phones and tablets. Verified: scanning `6001240912345` on the lookup page
  returned the correct product and per-warehouse ledger; scanning `6001240912346` on the receiving form
  correctly selected `BLK-STD-140`; an unknown barcode showed a clear not-found message.
- **Camera scanning at the operational touchpoints** (RFQ Phase 5) — `src/components/scanner/camera-scanner.tsx`
  is one reusable component: it opens an overlay, requests the camera, decodes frames with `jsqr`, and
  returns the decoded string to whatever called it. It handles permission-denied, no-camera, and generic
  failure with a manual-entry fallback in each case; always stops the MediaStream on success, cancel, and
  unmount (nothing keeps running in the background); guards against duplicate scan events via a ref latch;
  and `jsqr` is dynamically imported so it only enters the bundle when the overlay actually opens.
  Wired into five existing pages as an *additional input method feeding the existing form* — never a
  parallel workflow: scan lookup, **Goods receiving**, **Transfers**, **Sales & dispatch** (scan to select
  the product), and **Product catalogue** (scan to fill the Barcode field).
  **The security boundary matters here:** a scan only ever produces an identifier. It posts nothing,
  authorises nothing, and bypasses no permission, validation, reservation, or stock-availability check —
  every mutation still runs through the existing Server Actions, RBAC checks, and the WAC engine
  unchanged. There is deliberately no second inventory code path. Verified: USB/manual match still works
  unchanged on receiving and transfers; the permission-denied state renders correctly and the overlay
  cancels cleanly; a full transfer (`XFR-1001`, DBN-FAC → PMB-WH, 10 units) completed via
  scan-identify → existing form → existing action.
- **Product labels** (`/dashboard/labels`, RFQ Phase 5) — pick a product and a copy count, get a
  print-ready sheet (`@media print` hides the sidebar/nav via a `.no-print` convention, `print:` variant
  keeps label cards from splitting across a page break). Each label shows SKU, product name, the barcode
  number in large monospace text, and a **real, scannable QR symbol** generated server-side by
  `src/lib/services/qrcode.ts` (the `qrcode` package).
  **Why QR was safe to build but Code 128 still isn't:** QR went through a mature, deterministic encoder
  *and* was verified by round-trip — encode `6001240912345`, decode the resulting PNG back with `jsQR`,
  confirm the identical string comes out. That check is what distinguishes it from guessing. A rendered
  **Code 128** linear symbol remains **deliberately not built**: its checksum and subset-switching rules
  are easy to get subtly wrong, there was no physical scanner on hand to verify an implementation against,
  and a wrong symbol would look entirely legitimate on screen while silently failing to decode. Linked
  from the product catalogue's "Print labels" action per row. Verified: generated sheets for
  `CEM-42.5-50KG` with a correct QR and correct SKU/name/barcode on every card, no console errors.
- **Responsive / mobile** (RFQ: full browser functionality on iOS and Android, 375px minimum viewport) —
  the dashboard sidebar is a static push-style sidebar from **992px** up and a CSS-only off-canvas drawer
  below it (a hidden checkbox + `peer-checked` variants — no client JS, so `layout.tsx` stays a Server
  Component). The drawer has a dimmed backdrop, a sticky ☰ header, an in-drawer ✕, tap-backdrop-to-close,
  auto-close on navigation (the one line of client JS, in `nav-link.tsx`, since the layout doesn't remount
  between client-side route changes), and a background scroll lock.
  **992px is measured, not guessed:** it's the narrowest viewport where a 240px sidebar and the three
  dashboard stat tiles both fit without the currency value clipping (at 768px each tile collapses to 147px
  and clips; at 992px the tile is 222px and the value fits exactly). Below that the drawer is genuinely
  correct — there isn't room for both. Two latent bugs were found and fixed here, both needing an
  open-drawer-then-widen sequence to surface: a stale backdrop that dimmed the whole desktop layout (equal
  specificity between the min-width variant and the peer-checked variant, with Tailwind emitting the latter second
  — fixed by stacking the width bound *onto* the checked variant so above-breakpoint is unreachable rather
  than merely overridden), and a scroll lock that outlived the drawer and left the page unscrollable.
  Verified at 375 / 768 / 960 / 991 / 992 / 1280: no page-level horizontal overflow, no card clipping,
  desktop visually unchanged.
- **Form control height standard** — every single-line input and select across the dashboard is now
  exactly **36px** (Tailwind's `h-9`), driven from one shared module,
  `src/lib/ui/form-control-classes.ts` (`inputClass`/`selectClass`), which ~15 form files import instead
  of each declaring its own padding/border string. The number is documented as `--control-height` in
  `globals.css`. Getting a `<select>` to actually hold that height required more than a height rule: its
  native OS-drawn dropdown chrome carries its own intrinsic sizing and its own border/corner rendering
  regardless of `height`, so `appearance: none` (with `-webkit-`/`-moz-` prefixes — the unprefixed
  property alone doesn't fully strip Safari's native chrome) opts every select out of that entirely; a
  themed chevron is redrawn in its place. Small inline row-actions that sit beside a control in the same
  row (Match, Scan with camera, Generate sheet, Add component, and the compact table-row controls on
  Purchase orders/Invoicing) were brought to the same 36px so nothing regresses back to the mismatch this
  replaced. **Deliberately excluded:** the `/dashboard/scan` hero input/camera button and the login
  page's email/password fields — both are single, intentionally oversized touch targets, not part of a
  dense grid of side-by-side fields, and standalone primary submit buttons (Post receipt, Save as draft,
  etc.), which are full-width actions on their own row with nothing beside them to align to. Verified: no
  control across Overview, Product catalogue, BOM, Purchase orders, Receiving, Suppliers, Transfers,
  Adjustments, Sales, Customers, Invoicing, and Labels measures anything other than 36.00px; `tsc` and
  `eslint` clean; no page-level overflow at 375px.
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
- **Bill of materials** (`/dashboard/bom`, RFQ Phase 2) — flat parent → component BOM management (the
  schema's committed shape, per `product_bom` in the Foundation migration): add/remove components with a
  quantity-per-unit, plus a BOM explosion calculator (given a build quantity, total component
  requirements). `ProductRepository.listBom` previously always returned `[]`; it and two new methods
  (`addBomLine`, `removeBomLine`) are now backed by real mock state. Linked from the product catalogue's
  "BOM" action per row. Nested/multi-level BOM remains a **BUSINESS DECISION REQUIRED** item (§5.3) — this
  is the flat model, not blocked on that decision. Verified: built a 2-component BOM (cement, aggregate)
  for a concrete block SKU, removed one component and confirmed it reappeared in the "add component"
  picker while disappearing from the BOM table and the explosion calculation; exploded the remaining
  component (0.01 ton/unit) against a 5,000-unit build quantity → exactly 50 tons.
- **Credit notes** (`/dashboard/invoices`, RFQ Phase 4 gap) — issue a credit note (reason + amount) against
  any unpaid/partially-paid invoice, gated on `manage_invoices` and audit-logged against `credit_notes`.
  New `Invoice.creditedAmount` field and `CreditNote` domain type; outstanding balance is now
  `total - amountPaid - creditedAmount` everywhere it's computed (invoice list totals, per-row outstanding,
  `buildInvoiceAgeing`). Schema-as-code in
  `supabase/migrations/20260816110000_credit_notes.sql` (adds `invoices.credited_amount` and a
  `credit_notes` table). Verified live end-to-end on SO-1001 → INV-1001 (R3,000 subtotal, R450 VAT, R3,450
  total): issued a R1,000 credit note → outstanding dropped to exactly R2,450.00, Credited column showed
  R1,000.00, status flipped to "Partially paid"; recorded a R2,450 payment for the remainder → outstanding
  hit exactly R0.00, status flipped to "Paid".

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
| Requisitions (draft/approve/issue) — repurposed from Sales & Dispatch | Real logic and UI — see §1 |
| Purchase order lifecycle (draft/issue/partial-receive) | Real logic and UI — see §1 |
| Invoicing & billing (VAT, payments, ageing) | **Dormant** — real code, unreachable from nav — see §1 |
| Accounting Integration (Sage/QuickBooks/Xero) | Not started — **explicitly deferred by client decision**, see §5.5 |
| Dashboards & reports (14 of "15+", CSV export; PDF/Excel not built) | Real logic and UI — see §1 |
| Inventory data import (Excel/CSV) | **Not built** — no template defined yet, see §6 |
| Barcode/QR scanning — USB scanner + browser camera, at five touchpoints | Real logic and UI — see §1 |
| QR generation on labels | **Real** — `qrcode` package, verified by encode→decode round-trip — see §1 |
| Product labels (`/dashboard/labels`, print-ready sheets) | Real logic and UI — see §1 |
| Responsive / mobile (static sidebar ≥992px, drawer below, 375px min) | Real — verified across six widths — see §1 |
| Bill of materials (`/dashboard/bom`, flat BOM + explosion calculator) | Real logic and UI — see §1 |
| Credit notes (issue against invoice, nets off outstanding) | Real logic and UI — see §1 |
| Rendered Code 128 linear barcode symbol | Not built — unsafe to fake without a scanner to verify against — see §1 |
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
   today: only `admin` can approve/reject adjustments, manage the product catalogue, or manage departments.
   Confirm real assignments before Production. Notably absent: a distinct "requesting user" role for
   workshop staff who should be able to create a requisition without also holding receiving/transfer/
   catalogue permissions — today creating a requisition needs the same `manage_sales_orders` permission as
   approving and issuing one, held only by `admin` and `warehouse_clerk`.
3. **BOM structure.** Flat one-level (parent → component) BOM is built and working (`/dashboard/bom`).
   Confirm whether Cobro needs nested/multi-level BOM (e.g. a palletised product built from
   sub-assemblies) — that would be a schema change, not a UI one.
4. **Adjustment reason codes.** Seeded with plausible defaults (`BREAKAGE`, `CYCLE_COUNT`, `THEFT_LOSS`,
   `FOUND_STOCK`) and "requires approval" defaulted to true for all — confirm the real list and which
   roles approve which reasons.
5. **Accounting integration target.** RFQ allows Sage, QuickBooks, or Xero "or equivalent" — not yet
   chosen, and **explicitly deferred by client decision** as of the MRO scope-alignment meeting (§1) —
   this is now a "not yet" rather than a "blocked on a choice," and should not be built ahead of a
   separate future go-ahead even once a platform is named.
6. **Requisition approval hierarchy.** Today "Approve" is a single gate on `manage_sales_orders` — the
   same permission that also creates and issues. No distinct approver role, no second-approver check, no
   rejection path (only Cancel, available on draft/approved). Confirm whether Cobro needs a real approval
   chain before this goes near Production.
7. **Partial issues.** Not supported — a requisition issues in full or not at all (the dispatch logic this
   was repurposed from was always all-or-nothing). Confirm whether Stores needs to issue a requisition
   partially when full stock isn't on hand.
8. **Low-stock notification recipients.** The dashboard tile and Low Stock report surface the condition
   passively; there's no push/email notification to a person or role. Confirm who should be notified and
   how, and whether that's in scope for this engagement.
9. **VAT-exempt sales, payment terms, reorder point scope.** Three items from the original invoicing/BOM
   build (0%-rated invoices, 30-day payment terms, per-warehouse vs. global reorder thresholds) are now
   moot while invoicing is dormant and reorder points are unaffected by this pass — kept here only in case
   a genuine external customer-billing module is ever built as its own future decision.

## 6. Next steps (in order)

1. Resolve §5.1 (MVP cut-line) with the client before committing further engineering time — this
   materially changes phase sequencing.
2. Resolve §5.2 (permission matrix) and §5.5 (accounting platform) with the client.
3. AUTHENTICATION phase: real Supabase project + Supabase Auth, replacing `src/lib/auth.ts` — including
   real password hashing; the 2FA *gate* exists (§1), but real Supabase Auth MFA (an actual authenticator
   app enrollment) still needs to replace the mock flag-flip in `/dashboard/security`.
4. CORE DATA phase: apply all migrations (including the audit-log immutability trigger) to that project,
   replace the mock repositories with real Supabase-backed ones behind the same interfaces.
5. Accounting integration: explicitly deferred by client decision (§5.5) — do not build ahead of a
   separate future go-ahead, even once §5.5's platform question is answered.
6. Last of Phase 5: a rendered Code 128 linear barcode symbol — blocked on having a physical scanner to
   verify an encoder against. Reports, QR generation, and camera + USB scanning are done.
7. Inventory data import: X Spark provides an Excel/CSV template, Cobro populates it, the app needs a
   controlled import validating required fields/SKU uniqueness/UOM/barcode/quantities/duplicates before
   loading it. Not built — no template defined yet either. Demo data must stay clearly separate from
   whatever this produces.
8. PDF/Excel report export — only CSV exists today.
9. Resolve §5.6–§5.8 (approval hierarchy, partial issues, low-stock notification recipients) with the
   client before Production.
10. Phase 8: system testing, UAT, training materials, production cutover.
