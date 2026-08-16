# Changelog

Version tracks development milestones, not production releases — nothing below has shipped to a real
Supabase project or a Cobro user yet (see `docs/ARCHITECTURE.md` for what's real vs. mocked). Semantic
versioning, pre-1.0 while auth, real data, and the remaining RFQ phases are outstanding.

## v0.16.0 — 2026-08-16

**Credit notes (RFQ Invoicing & Billing gap closed) — issue, track, and net against invoices.**
- New `Invoice.creditedAmount` field and `CreditNote` domain type; `InvoiceRepository.issueCreditNote`/
  `listCreditNotes` added, backed by real mock state with a `CN-1001`-style numbering counter
- Outstanding balance is now `total - amountPaid - creditedAmount` everywhere it's computed: the invoices
  list totals, the per-row outstanding figure, and `buildInvoiceAgeing` in the reports engine
- New "Issue credit note" action on `/dashboard/invoices` (reason + amount, gated on `manage_invoices`,
  audit-logged against `credit_notes`), alongside the existing "Record payment" action; new "Credited"
  column in the invoices table
- Schema-as-code: `supabase/migrations/20260816110000_credit_notes.sql` adds `invoices.credited_amount`
  and a `credit_notes` table for the eventual real Supabase project
- Verified live end-to-end on a fresh SO-1001 → INV-1001 (R3,000 subtotal, R450 VAT, R3,450 total): issued
  a R1,000 credit note ("Partial return - damaged bags") → outstanding dropped to exactly R2,450.00,
  Credited column showed R1,000.00, status flipped to "Partially paid"; then recorded a R2,450 payment for
  the remainder → outstanding hit exactly R0.00 and status flipped to "Paid"

## v0.15.0 — 2026-08-16

**Bill of materials (RFQ Phase 2 gap closed) — flat BOM management + explosion calculator.**
- `ProductRepository.listBom` previously always returned `[]`; now backed by real mock state, plus two
  new methods `addBomLine`/`removeBomLine`
- New `/dashboard/bom`: pick a product, add/remove components with a quantity-per-unit, and a "BOM
  explosion" calculator — given a build quantity, total component requirements
- Linked from the product catalogue's new "BOM" action per row
- Flat parent → component only, per the schema's already-committed shape — nested/multi-level BOM
  remains an explicit open decision (`docs/ARCHITECTURE.md` §5.3), not something this blocks on
- Verified: built a 2-component BOM (cement + aggregate) for a concrete block SKU; removed one component
  and confirmed it reappeared in the "add component" picker while disappearing from both the BOM table
  and the explosion output; exploded the remaining component (0.01 ton/unit) against a 5,000-unit build
  quantity → exactly 50 tons

## v0.14.0 — 2026-08-16

**Final five reports — 15 of the RFQ's "15+" target reached.**
- `buildPickList` — confirmed/dispatched orders, the RFQ's own "pick lists" phrase under Sales & Dispatch
- `buildAdjustmentReasonSummary` — counts by reason code and status (quantity/value impact not tracked
  at this level yet — `StockAdjustmentLine` isn't exposed by the repository)
- `buildWarehouseSummary` — SKU count, below-reorder count, and total value per location
- `buildOpenPurchaseOrders` — the exceptions view: only issued/partially-received POs, with days open
- `buildDormantStock` — on-hand stock with no movement recorded this server session (caveated: mock data
  has no persistent movement history before that, so this isn't true long-term dormancy)
- All five wired into `/dashboard/reports` with CSV export
- Verified across one live scenario touching five reports at once: a 100-unit PO received in two passes
  (60 then the 40-unit remainder outstanding) produced exactly matching figures on purchase order summary
  (100/60/40), supplier summary (R9,000 ordered / R5,400 received), and open purchase orders (40
  outstanding, R3,600); dormant stock correctly dropped the touched SKU from 8 rows to 7 the moment it
  was received; a confirmed sales order showed correctly on the pick list; a requested (unapproved)
  adjustment showed as 1 pending on the reason summary

## v0.13.0 — 2026-08-16

**Product label printing (RFQ Phase 5).**
- New `/dashboard/labels`: pick a product + copy count, get a print-ready sheet — SKU, product name, and
  barcode number in large, clear monospace text per label
- `@media print` + a `.no-print` convention (applied to the sidebar and the mock-data banner) so the
  printed page shows only the label sheet; `print:break-inside-avoid` keeps cards from splitting across
  a page break
- Deliberately does **not** render a Code 128/QR barcode symbol graphic — that needs the full standard
  bar-width lookup table, which this pass had no way to verify against a real scanner, and a wrong symbol
  would look legitimate on screen while not actually decoding. A human/scanner-readable text code was the
  honest choice over a fabricated barcode image; the page says so explicitly.
- "Print labels" action added to each row on the product catalogue
- Verified: generated a 6-copy sheet for `CEM-42.5-50KG`, correct SKU/name/barcode on every card, clean
  render with no console errors

## v0.12.0 — 2026-08-16

**2FA for privileged users (RFQ Phase 6) — mock enrollment gating the most sensitive action.**
- `UserRepository.setMfaEnrolled` + mutable mock user state
- `src/lib/permissions.ts`: `checkPermission` (non-throwing) now checks role AND, for
  `PRIVILEGED_PERMISSIONS` (currently just `approve_adjustments`), `user.mfaEnrolled`;
  `requirePermission` throws using the same check, so every existing call site got the gate for free
- New `/dashboard/security` — mock enrollment (flag-flip, no real authenticator app), with a clear note
  that it's standing in for real Supabase Auth MFA
- Adjustments page shows a banner when the signed-in user's 2FA isn't enabled yet, explaining that
  requesting doesn't need it but approving does; updated the now-stale "any signed-in user can approve"
  copy left over from the earlier RBAC pass
- Verified: Admin without 2FA enabled → blocked from approving with "This action requires two-factor
  authentication. Enable 2FA under Security first."; enabled 2FA → the same approval then succeeded

## v0.11.0 — 2026-08-16

**Four more reports — 10 of the RFQ's eventual 15+.**
- `buildSupplierSummary` — orders, ordered value vs. actually received value, per supplier
- `buildCustomerSummary` — order count, dispatched count, ordered value vs. dispatched value, per customer
- `buildReceivingHistory` — every `receipt` movement, human-readable (covers quick-receive and PO
  receipts alike, since both post the same movement type)
- `buildMovementTypeTotals` — count/total units/total value rolled up by stock movement type
- All four wired into `/dashboard/reports` with CSV export, same as the existing six
- Verified: a 50-unit PO fully received produced exactly R4,500.00 in both "ordered value" and "received
  value" on the supplier summary; the same receipt appeared correctly on receiving history and movement
  type totals; stock valuation's WAC recalculated correctly from the same receipt

## v0.10.0 — 2026-08-16

**RFQ Phase 6 (partial): RBAC enforcement + audit log.**
- `src/lib/permissions.ts` — real permission matrix (`Permission` type, `ROLE_PERMISSIONS`), enforced in
  every mutating Server Action across products, receiving, purchase orders, transfers, adjustments, sales
  orders, invoices, suppliers, customers, and the generic dashboard "record a movement" form
- Four demo accounts, one per role (admin/warehouse clerk/procurement/viewer) — `src/lib/demo-credentials.ts`,
  selectable via a role picker on the login page
- New `RoleRepository` and `AuditLogRepository` (append-only by construction — no update/delete method
  exists); every audited action writes an entry, viewable at new `/dashboard/audit-log`
- Real Postgres immutability trigger written (`supabase/migrations/20260816100000_audit_log_immutability.sql`),
  rejecting UPDATE/DELETE on `audit_log` — not applied anywhere yet, no live database
- **Caught and fixed during this pass:** the generic dashboard "record a movement" form could post any
  movement type, including write-offs, with no permission or approval check — a straight RBAC bypass
  around the dedicated adjustments approval flow. Now gated behind `approve_adjustments`.
- Sidebar now shows the signed-in user's role
- Verified end-to-end: Viewer blocked from posting a movement (clear error, ledger unchanged); Admin
  succeeded (WAC recalculated correctly); requesting + approving an adjustment as Admin produced two
  correct entries in the audit log (insert, then update) with the right table/user/timestamp
- Permission matrix itself remains a placeholder pending Cobro confirmation (see `docs/ARCHITECTURE.md` §5.2)

## v0.9.0 — 2026-08-16

**RFQ Phase 5: barcode/QR scanning (USB scanner).**
- `ProductRepository.getByBarcode` — exact-match barcode lookup
- New `/dashboard/scan` page: scan or type a barcode into a plain GET form (no client JS needed for the
  scan itself — a USB scanner behaves like a keyboard typing the code then pressing Enter, which submits
  an ordinary form natively); shows the matched product's stock across every warehouse, with quick links
  into receive/sell/adjust for that product
- Goods receiving form gained a "scan to select product" field that matches client-side against the
  loaded product list and auto-selects the product dropdown
- Verified: scanning `6001240912345` on the lookup page returned the correct product and ledger rows;
  scanning `6001240912346` on the receiving form correctly selected `BLK-STD-140`; an unknown barcode
  showed a clear not-found message
- Not built: camera-based scanning (`getUserMedia` + decoding — needs real hardware to verify properly)
  and label printing; RFQ allows "camera and/or USB scanner", so USB-only satisfies it as written

## v0.8.0 — 2026-08-16

**RFQ Phase 5 (partial): Dashboards & Reports.**
- `src/lib/services/reports.ts` — pure report-building functions: stock valuation (by warehouse, with
  subtotals + grand total), low stock/reorder suggestions, sales order summary, purchase order summary,
  invoice ageing (current/1-30/31-60/61-90/90+ buckets), stock movement history
- New `/dashboard/reports` page rendering all six, each with a "Export CSV" button
  (`src/components/export-csv-button.tsx`) — satisfies the RFQ's "exportable to Excel/CSV at any time"
  requirement
- Verified: a manual receipt (50 units @ R98) immediately reflected correctly in both the stock
  valuation report (WAC recalculated to R92.65) and movement history; CSV export ran with no console
  errors
- Not yet built: barcode/QR scanning, and the remaining ~9 reports toward the RFQ's eventual 15+

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
