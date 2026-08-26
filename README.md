# Cobro IMS

**Cobro Concrete's inventory management system.** Cobro owns the system and the data; **X Spark** designs,
develops, and supports it. This README is the single "read this first" document — it should be enough for
anyone (or any future session picking this project back up) to understand what exists, why, and what's
still open, without re-reading the whole commit history.

Current version: **see `package.json`** (also shown live on the login page footer). Full version history
in [`CHANGELOG.md`](CHANGELOG.md).

---

## 1. What this is

A cloud-based, multi-warehouse Inventory Management System replacing Cobro's fragmented spreadsheet-based
stock tracking with one audit-trailed platform covering procurement, warehousing, dispatch, invoicing, and
(eventually) accounting integration.

**Business context:**

- **Client:** Cobro Concrete (Pty) Ltd — a small KwaZulu-Natal manufacturer, up to 5 warehouse/factory/store
  locations, fewer than 20 users.
- **Technology partner:** X Spark — responsible for product discovery, architecture, UX/UI, development,
  security, DevOps, testing, deployment, documentation, training, and post-implementation support.
- **Funded via:** Productivity SA (Region 1), under an approved Scope of Work. Purchase Order **PO-9522**,
  **R171,695 (incl. VAT)**, **8-week** delivery window, due **30/09/2026**. Includes 6 months post-delivery
  support and hosting.
- **Primary source of truth:** the actual RFQ documents in the parent folder — `Scope of Work Request_IMS.docx`,
  `PO9522- Cobro - Inventory System.pdf`, `Cobro IMS System Map.png`. Read those before changing scope here;
  this README summarizes them but isn't a substitute.
- **Budget/timeline reality check:** the full RFQ scope (procurement → warehouse → sales → invoicing →
  accounting integration → RBAC/2FA → immutable audit trail → 15+ reports → barcode scanning → POPIA/VAT
  compliance → 99.5% uptime SLA) is large for an 8-week, R171,695 engagement. This is flagged as an open
  **BUSINESS DECISION REQUIRED** — see §7 — not silently absorbed.

**Ownership principle:** production ownership (Supabase project, database, storage, domain, backups,
credentials) is meant to end up with Cobro, not X Spark. Development is currently happening against mock
data specifically so that a live Supabase project doesn't get provisioned under the wrong account by
default — see §4.

### 1.1 Scope alignment — internal MRO, not customer sales (client discovery meeting)

A discovery meeting with Cobro confirmed Cobro IMS is an **internal MRO (Maintenance, Repair, Operations)
inventory system** — Stores purchases → items scanned in → held → a workshop/department requisitions parts
→ Stores processes the request → items scanned out. **Not** a customer-facing sales platform, CRM, or
e-commerce system.

The app had already built a real customer/VAT/sales module (`SalesOrder` with `customerId`, linked
VAT invoices, payments, credit notes) before this was confirmed — none of that applies to an internal
workshop request (you don't VAT-invoice your own maintenance department). Rather than build a second,
parallel Requisitions module from scratch, that existing module was **repurposed**:

- **"Sales & dispatch" → "Requisitions"**, **"Customers" → "Departments"** (nav, page copy, status labels:
  Confirm/Reserved → Approve/Approved, Dispatch/Dispatched → Issue/Issued). Order numbers now read
  `REQ-1001` instead of `SO-1001`.
- **VAT invoicing, payments, and credit notes are now dormant** — the only UI path that created an invoice
  (the "Generate invoice" button on the requisitions list) has been removed. The `/dashboard/invoices`
  route, its Server Actions, and the underlying repository methods are **untouched and still work** if
  visited directly; they're just unreachable from navigation and never populated going forward. Nothing
  was deleted, per the standing "don't delete, mark dormant" principle — see §9 for why this stays
  reversible rather than ripped out.
- Internal TypeScript identifiers (`SalesOrder`, `salesOrderRepository`, `Customer`, the `manage_sales_orders`
  permission string, DB field names) were **deliberately left unrenamed** — this was a terminology and
  UI-workflow fix, not a schema migration. Renaming those touches the data layer, every report, and the
  future Supabase migrations for zero user-visible benefit.

See `docs/ARCHITECTURE.md` §1 for the full before/after and the open business decisions this surfaced.

---

## 2. Current status

Development has been **progressive**, following the brief's own staged plan:

```
DISCOVER → ARCHITECT → FOUNDATION → [AUTHENTICATION] → CORE DATA / INVENTORY ENGINE →
WAREHOUSE OPERATIONS → PROCUREMENT → SALES & DISPATCH → INVOICING → ACCOUNTING →
REPORTING → SECURITY HARDENING → UAT → PRODUCTION
```

**Done and browser-verified** (not just written — every workflow below was clicked through end-to-end with
the resulting numbers hand-checked):

| RFQ Phase | Module | Status |
| --- | --- | --- |
| Foundation | Schema, WAC inventory engine, mock data layer, login + dashboard shell | ✅ |
| Phase 2 — Core Inventory Operations | Product catalogue | ✅ |
| | Bill of materials (flat, + explosion calculator) | ✅ |
| | Goods receiving (quick-receive, ad-hoc) | ✅ |
| | Inter-warehouse transfers | ✅ |
| | Write-offs & adjustments (with approval gate) | ✅ |
| Phase 3 — Requisitions, Procurement & Suppliers | Requisitions (draft → approve → issue), internal stock requests | ✅ |
| | Full purchase order lifecycle (draft → issue → partial/full receive) | ✅ |
| | Suppliers, Departments | ✅ |
| Phase 4 — Invoicing, Billing & Accounting | **Dormant** — VAT invoicing, payments, ageing (§1.1: not applicable to internal MRO; not deleted) | ⏸ |
| | Credit notes | ⏸ dormant, same reason |
| | Accounting integration (Sage/QuickBooks/Xero) | ⏳ explicitly deferred by client decision — see §7.5 |
| Phase 5 — Dashboards, Reporting, Barcode Scanning | Dashboards & reports (14 of "15+" — Invoice ageing retired with §1.1, CSV export) | ✅ |
| | Barcode/QR scanning — USB scanner (lookup, receiving, transfers, sales, catalogue) | ✅ |
| | Barcode/QR scanning — browser camera, same five touchpoints | ✅ |
| | Product labels (print-ready sheets, with real scannable QR) | ✅ |
| | Rendered Code 128 linear barcode symbol | Not started — see §7 |
| Phase 6 — User Management, Security, Audit Trail | RBAC enforcement (real, 4 demo roles) + audit log | ✅ |
| | DB-level audit log immutability trigger | ⏳ written, not applied (no live DB) |
| | 2FA gate on the most sensitive action (approve/reject adjustments) | ✅ |
| Responsive / mobile | Full browser functionality down to a 375px viewport | ✅ |
| Authentication | Real Supabase Auth | **Deferred by explicit direction**, not oversight |
| Core Data | Live Supabase project | **Deferred by explicit direction** — see §4 |
| Testing, Training, UAT, Production | — | Not started |

**Right now, this is a schema-and-engine-first vertical slice, not a partial ERP.** Every module that *is*
built goes all the way from UI → server action → repository → the WAC inventory engine → the (mocked)
ledger, and was verified live rather than assumed correct. Nothing that *isn't* built has a half-finished
UI sitting on top of nothing.

For the detailed, ongoing decision log (what's real vs. mocked, open business decisions, next steps in
order), see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). For the version-by-version build history, see
[`CHANGELOG.md`](CHANGELOG.md).

---

## 3. Running it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 (or whatever port `next dev` picks) — you'll land on `/login`. Four demo
accounts, one per RBAC role, are shown on the page itself with one-click autofill (also in
`src/lib/demo-credentials.ts`) — pick a role to see what it can and can't do:

```
Admin          demo@cobroconcrete.co.za         CobroDemo2026
Warehouse clerk clerk@cobroconcrete.co.za        CobroClerk2026
Procurement    procurement@cobroconcrete.co.za   CobroProcure2026
Viewer         viewer@cobroconcrete.co.za        CobroViewer2026
```

There is **no real backend**. The entire app runs on an in-memory mock data layer (`src/lib/data/mock`)
that resets every time the dev server restarts. This is deliberate for the current phase — see §4.

---

## 4. Why mock data instead of a live Supabase project (for now)

Decided explicitly, not by default:

- Production ownership is meant to end up with **Cobro**, and no Cobro-controlled Supabase org exists yet.
  Provisioning a project now would default to X Spark's own org — workable as a stopgap, but not something
  to do silently on a client's behalf.
- It doesn't block development on that account-setup conversation happening in parallel.

Instead, development proceeds against:

1. **Real schema-as-code** (`supabase/migrations/*.sql`) — written for and ready to apply to a real
   Supabase/Postgres project the moment one exists.
2. **A real repository interface layer** (`src/lib/data/repositories.ts`) that any real backend must
   satisfy.
3. **A mock implementation** of that exact interface (`src/lib/data/mock/`) standing in today.

**When a real Supabase project exists:** run the migrations in `supabase/migrations/`, write
`src/lib/data/supabase/*.ts` implementing the same interfaces, and flip `DATA_SOURCE=supabase` in
`src/lib/data/index.ts`. No calling code — services, pages, server actions — should need to change, because
none of it imports the mock layer directly; everything imports from `src/lib/data/index.ts`.

The same logic applies to auth: `src/lib/auth.ts` is a deliberately minimal mock session (one hardcoded
demo user, a cookie, no password hashing, no MFA) standing in for real Supabase Auth. It exposes exactly
two functions — `getSession()` and the sign-in/out actions — so replacing it wholesale doesn't ripple
through every page that currently calls `getSession()`.

---

## 5. Tech stack

- **Frontend:** Next.js 16 (App Router, Server Components + Server Actions), React 19, TypeScript, Tailwind
  v4.
- **Data (target):** Supabase — Postgres, Auth, Storage, Edge Functions. Not yet provisioned.
- **Data (current):** in-memory mock repositories behind the exact interfaces the Supabase layer will
  implement.

This matches the RFQ's own system map (responsive SPA, RESTful data access, relational DB, OAuth/2FA)
without needing a separate Node/.NET API tier — Supabase's generated REST/Postgres access plus Edge
Functions cover that role directly, which matters given the tight budget and timeline (§1, §7.1).

### 5.1 Design system: form control height

Every single-line input and select in the dashboard is **36px** tall (Tailwind's `h-9`), via one shared
source: `src/lib/ui/form-control-classes.ts` (`inputClass`, `selectClass`). Pages import these instead of
declaring their own padding/border/height, so the height is enforced from one place, not by convention
across ~15 files. The number itself is documented as `--control-height` in `src/app/globals.css`.

Selects additionally need `appearance: none` (with `-webkit-`/`-moz-` prefixes) to hold that height in
every browser engine — a native `<select>`'s OS-drawn chrome carries its own intrinsic sizing and its own
border/corner rendering that a plain `height` rule can't fully override. See the comment on the `select`
rule in `globals.css` for the full explanation, including why Safari needs the prefixed property
specifically.

**Two exceptions, deliberately not on the 36px standard:**
- The `/dashboard/scan` barcode/QR lookup's hero input and camera button — a single, oversized,
  intentionally large touch target for warehouse-floor scanning, not one of a dense row of fields.
- The login page's email/password fields — a single centered auth card, not a dashboard data-entry row.

Shrinking either to match a dense form row would be a visual redesign, not a consistency fix — they were
never inconsistent with anything, they're deliberately their own size.

Primary submit buttons (Post receipt, Save as draft, Create order, etc.) also stay their own larger size —
they're standalone full-width actions on their own row, not one of several controls that need to align
with each other, so there's nothing for them to be inconsistent with.

---

## 6. How the app is put together

**The golden rule this codebase follows:** `DATA → DOMAIN → API → BUSINESS LOGIC → SECURITY → UI →
REPORTING` — never `UI → fake data → database later`. Concretely:

```
supabase/migrations/          Postgres schema, schema-as-code (target: Supabase; not yet applied anywhere)
        ↓
src/lib/domain/inventory.ts   TypeScript types mirroring that schema, by hand
        ↓
src/lib/data/repositories.ts  Repository INTERFACES — the seam. Services and UI only ever depend on these.
        ↓
src/lib/data/mock/            The current implementation of those interfaces (in-memory, resettable)
        ↓
src/lib/services/             Business logic — pure functions with no I/O (the WAC inventory engine)
        ↓
src/app/                      Next.js routes: Server Components (read), Server Actions (write)
```

**The inventory engine** (`src/lib/services/inventory-engine.ts`) is the one place stock quantity and cost
math happens — Weighted-Average-Cost (WAC) costing, per the RFQ's explicit requirement (not an assumption).
Every stock-affecting workflow (GRN receiving, dispatch, inter-warehouse transfer, adjustment/write-off)
posts through the same `applyMovement` function, so the stock ledger is always a true derivation of an
append-only movement log — which is exactly what makes the audit trail meaningful later. It's implemented
as pure, unit-testable functions with zero I/O.

**Reservation is separate from movement.** Confirming a sales order reserves stock
(`stock_ledger.quantity_reserved`) without posting a stock movement or touching WAC — it's a ledger-state
change, handled by `adjustReserved`, distinct from `applyMovement`. Only dispatch posts the real outbound
movement and releases the reservation.

**Every mutating Server Action re-checks the session itself** (`getSession()` at the top of each action) —
Server Functions in Next.js are reachable via direct POST requests, not just through the rendered UI, so
"the page was behind a login redirect" is not sufficient authorization on its own.

**RBAC follows the same pattern.** Every mutating Server Action also calls `hasPermission`/
`requirePermission` (`src/lib/permissions.ts`) right after the session check — a role, not just a login,
gates every write. Every audited action then writes to an append-only `AuditLogRepository`
(`/dashboard/audit-log`), the same way stock movements are append-only: no update/delete method exists
for a caller to call, even if a real database's own immutability trigger is still just written, not
applied (see `supabase/migrations/20260816100000_audit_log_immutability.sql`).

---

## 7. What each module actually does

- **Product catalogue** (`/dashboard/products`) — list + add SKUs, unit of measure, barcode, reorder
  point/quantity. Also hosts **bulk data import templates** — downloadable CSVs for product master data and
  opening stock (§6 below), matching the real domain fields exactly. The upload/import screen itself isn't
  built yet — see §11.
- **Bill of materials** (`/dashboard/bom`) — flat parent → component BOM management (add/remove
  components with a quantity-per-unit) plus a BOM explosion calculator: given a build quantity, total
  component requirements. Nested/multi-level BOM is still an open decision (§9.3); this is the flat model.
- **Goods receiving** (`/dashboard/receiving`) — "quick receive": creates a PO + PO line + GRN + GRN line
  and posts the stock movement in one step, for genuine ad-hoc receipts with no formal PO raised.
- **Purchase orders** (`/dashboard/purchase-orders`) — the formal lifecycle: draft → issue → receive one
  or more times against it (partial receipts supported, each posts its own GRN + `receipt` movement at the
  PO's quoted unit cost) until fully received.
- **Inter-warehouse transfers** (`/dashboard/transfers`) — initiate posts a `transfer_out` at the source
  immediately (in-transit, out of that warehouse's ledger); complete posts the matching `transfer_in` at
  the destination, carrying the **source's WAC** as the transferred cost — so a transfer never fabricates
  value, it just moves stock at its existing cost.
- **Write-offs & adjustments** (`/dashboard/adjustments`) — request stays `pending_approval` and never
  touches the ledger; approving posts the movement (the sign of the quantity delta decides `adjustment` vs.
  `write_off`); rejecting never does. Approving/rejecting requires the `approve_adjustments` permission —
  admin-only in the current placeholder matrix (§9.2).
- **Requisitions** (`/dashboard/sales` — route unchanged, page repurposed per §1.1) — an internal stock
  request from a department/workshop: draft (nothing reserved) → approve (reserves stock, no ledger
  movement, no WAC change) → issue (posts the real outbound movement at the ledger's current WAC, releases
  the reservation) or cancel from draft/approved (releases any reservation, posts nothing). Order numbers
  are `REQ-####`.
- **Suppliers** (`/dashboard/suppliers`) and **Departments** (`/dashboard/customers` — route unchanged) —
  list + add, feeding the pickers on receiving/purchase orders and requisitions respectively.
- **Invoicing & billing** (`/dashboard/invoices`) — **dormant per §1.1.** Still fully functional if visited
  directly (VAT invoice generation, payments, ageing, credit notes all still work against existing data),
  but unreachable from navigation and no requisition creates one — internal stock movements aren't VAT
  sales. Kept rather than deleted in case Cobro's real business (they do sell concrete externally) ever
  needs a genuine customer-billing module — that would be a new, separate decision, not this one.
- **Dashboard overview** (`/dashboard`) — live KPIs (SKUs tracked, total stock value, below-reorder-point
  count) and the multi-warehouse stock ledger table, plus a generic "record a movement" form that exercises
  the engine directly (the original proof-of-concept before the dedicated workflow pages existed).
- **Dashboards & reports** (`/dashboard/reports`) — fourteen: stock valuation, low stock, warehouse
  summary, dormant stock, requisition summary, department summary, pick list, purchase order summary,
  supplier summary, open purchase orders, stock movement history, receiving history, movement type totals,
  and adjustment reason summary — each exportable to CSV. (Invoice ageing was retired from this list along
  with the rest of dormant invoicing — §1.1 — dropping the count from 15 to 14 against the RFQ's "15+"
  target; the function itself still exists in `reports.ts`, unused.) Export formats today are **CSV only**
  — the RFQ mentions PDF/Excel too; not built yet, see §11.
- **Barcode / QR scan** (`/dashboard/scan`) — scan or type a barcode to look up a product and its stock
  across every warehouse. Two input methods, same lookup: a **USB/Bluetooth scanner** (they act as keyboard
  input, submitting a plain form on Enter — no client JS needed) and the **browser camera** on phones and
  tablets.
- **Scanning at the operational touchpoints** — the same camera-or-USB scan-to-identify pattern is wired
  into **Goods receiving**, **Transfers**, and **Sales & dispatch** (scan to select the product on the
  existing form), and into the **Product catalogue** (scan to fill the Barcode field on a new product).
  A scan only ever *identifies* an item — it posts nothing and bypasses no permission, validation, or stock
  check. Everything after identification is the existing workflow, unchanged.
- **Product labels** (`/dashboard/labels`) — pick a product and copy count, get a print-ready sheet with
  SKU, name, the barcode number in large text, and a **real scannable QR code** per label. The QR comes
  from the `qrcode` package and was verified by round-trip (encode → decode back to the identical string),
  not just visually. A rendered **Code 128** linear symbol is still deliberately not built — its
  checksum/subset rules are easy to get subtly wrong, and a wrong symbol would look legitimate while
  silently failing to scan (full rationale in `docs/ARCHITECTURE.md` §1). Linked from the product
  catalogue's "Print labels" action.
- **Audit log** (`/dashboard/audit-log`) — append-only record of every approval, issue, receipt, dispatch,
  invoice, and catalogue change, with who did it and when. Real DB-level immutability needs a live
  Postgres project (trigger is written, not applied) — see §6.
- **Security** (`/dashboard/security`) — mock 2FA enrollment. Approving/rejecting adjustments — the one
  action that posts a real stock-value change with no second approver — requires it; every other demo
  account starts unenrolled, so the gate is immediately visible when testing as Admin.

Every workflow above was exercised live in the browser during development — not just written and assumed
correct — with the resulting quantities/costs/VAT amounts hand-verified against the expected math. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §1 for the specific numbers checked for each module.

---

## 8. What's real vs. mocked

| Area | Status |
| --- | --- |
| UI (login, dashboard shell + nav, every module page) | Real, matches the approved visual design |
| WAC costing math | Real business logic, pure functions, exercised by every workflow |
| Every module in §7 | Real logic and UI, running against the mock data layer |
| Database schema | Written (`supabase/migrations/`), **not applied anywhere yet** |
| Auth | Mock — 4 hardcoded demo user/password pairs, cookie session. **Deferred by direction.** No password hashing, no real Supabase Auth. |
| RBAC | **Real enforcement** — every mutating Server Action checks a permission via `src/lib/permissions.ts`; 4 demo accounts (one per role) to test with. The matrix itself is still a placeholder pending Cobro sign-off |
| Audit log | **Real** — every audited action writes an append-only entry, viewable at `/dashboard/audit-log`. DB-level immutability trigger written, not applied (no live project) |
| Accounting integration (Sage/QuickBooks/Xero) | Not started — **explicitly deferred by client decision**, not just unchosen (§7.5) |
| Requisitions (draft → approve → issue), internal stock requests | Real logic and UI — repurposed from Sales & Dispatch, §1.1 |
| Invoicing, payments, credit notes | **Dormant** — real code, no longer reachable from navigation, §1.1 |
| Dashboards & reports (14 of "15+", CSV export; PDF/Excel not built) | Real logic and UI |
| Barcode/QR scanning — USB scanner + browser camera, at five touchpoints | Real logic and UI |
| QR code generation on product labels | **Real** — `qrcode` package, verified by encode→decode round-trip |
| Product labels (print-ready sheets) | Real logic and UI |
| Bill of materials (flat, + explosion calculator) | Real logic and UI |
| Responsive / mobile (drawer nav below 992px, 375px minimum) | Real — verified at 375/768/960/991/992/1280 |
| Rendered Code 128 linear barcode symbol | Not started — unsafe to fake without a scanner to verify against |
| 2FA for privileged users | **Real gate** on approving/rejecting adjustments (`/dashboard/security`) — mock enrollment, no real authenticator app |

---

## 9. Business decisions required — do not resolve these by assumption

These affect stock valuation, financial calculations, approval authority, VAT, or user permissions, and
the RFQ / SoW does not define them. Confirm with Cobro before further engineering commits to an assumption:

1. **MVP cut-line for the 8-week/R171,695 window.** What ships by 30/09/2026 vs. what falls into the
   6-month post-delivery support window — the full RFQ scope is a lot for this budget/timeline.
2. **Permission matrix per role.** `src/lib/permissions.ts` now *enforces* a real matrix, but it's a
   placeholder built from plausible role responsibilities, not one the RFQ defines or Cobro confirmed —
   e.g. only `admin` can approve/reject adjustments, manage the catalogue, or manage customers today.
3. **BOM structure.** Flat one-level (parent → component) is built and working (`/dashboard/bom`, with a
   BOM explosion calculator). Does Cobro need nested/multi-level BOM instead — a schema change, not a UI one?
4. **Adjustment reason codes.** Seeded with plausible defaults (`BREAKAGE`, `CYCLE_COUNT`, `THEFT_LOSS`,
   `FOUND_STOCK`) — confirm the real list and which roles approve which reasons.
5. **Accounting integration target.** RFQ allows Sage, QuickBooks, or Xero "or equivalent" — not chosen.
6. **Reorder point scope.** One global `reorder_point` per product today — does Cobro want per-warehouse
   thresholds instead?
7. **VAT-exempt sales.** Moot while invoicing is dormant (§1.1) — only relevant again if a genuine
   external customer-billing module is ever built as its own decision.
8. **Payment terms.** Same — dormant along with invoicing.
9. **Requisition approval hierarchy.** Today "approve" is a single step gated by the same
   `manage_sales_orders` permission as creating and issuing — there's no distinct approver role or
   second-approver check. Does Cobro need a real approval chain (e.g. a supervisor sign-off separate from
   the person who can issue stock)?
10. **A distinct "requesting user" / "requester" role.** The current roles (admin, warehouse_clerk,
    procurement, viewer) don't include a role for workshop staff who should be able to *create* a
    requisition but not manage receiving, transfers, or the catalogue. Not invented here — see §9.2 of
    `docs/ARCHITECTURE.md`.
11. **Partial issues.** Not supported — a requisition is issued in full or not at all, the same all-or-
    nothing behaviour the underlying dispatch logic already had. Does Cobro need partial fulfilment?
12. **Who can cancel a requisition.** Currently anyone with `manage_sales_orders` (the same permission that
    creates/approves/issues) — no separate "who's allowed to cancel someone else's request" rule exists.
13. **Low-stock notification recipients.** The dashboard tile and the Low Stock report surface the
    condition; there's no push/email notification to a specific person or role. Who should be notified,
    and how?

Full detail and rationale for each lives in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §5.

---

## 10. Project layout

```
supabase/migrations/            Postgres schema, schema-as-code, not yet applied to any project
  20260815120000_...sql           Foundation + Phase 2: warehouses, products, BOM, suppliers, minimal POs,
                                   GRN, transfers, adjustments, stock ledger/movements, roles, audit log
  20260815130000_...sql           Phase 3 sales half: customers, sales_orders, sales_order_lines
  20260815140000_...sql           Phase 4: invoices, invoice_payments
  20260816100000_...sql           Phase 6: audit_log immutability trigger (rejects UPDATE/DELETE)

src/lib/domain/inventory.ts     TypeScript types mirroring the schema, by hand, kept in sync manually
src/lib/permissions.ts          RBAC: Permission type, ROLE_PERMISSIONS matrix, hasPermission/requirePermission
src/lib/data/
  repositories.ts                 Repository INTERFACES — the seam every service/page depends on
  index.ts                        Single entry point; DATA_SOURCE switch (mock today, supabase later)
  mock/
    seed.ts                         Seed data: warehouses, products, suppliers, customers, 4 users, roles
    repositories.ts                 The mock implementation of every repository interface
src/lib/services/
  inventory-engine.ts              The WAC costing engine — pure functions, no I/O
  reports.ts                       Report-building functions (stock valuation, low stock, sales/PO
                                    summaries, invoice ageing, movement history) — pure, fetch-then-build
  qrcode.ts                        Server-side QR symbol generation (PNG data URL) for product labels
src/components/export-csv-button.tsx   Reusable client-side CSV export, used by every report table
src/components/scanner/camera-scanner.tsx  Reusable browser-camera QR scanner (jsqr, dynamically
                                    imported). Identifies a code and hands it back — never posts
src/lib/auth.ts                 Mock session/auth — replaced wholesale in the real Authentication phase
src/lib/demo-credentials.ts     The 4 demo logins (kept separate so a 'use client' component can safely
                                 import it without pulling next/headers into the client bundle)
src/lib/now.ts                  Tiny wrapper around Date.now() so Server Components can read wall-clock
                                 time without tripping the react-hooks/purity lint rule

src/app/
  page.tsx                        Redirects to /login or /dashboard based on session
  login/                          Sign-in screen (server action + client form, role picker)
  dashboard/
    layout.tsx                      Sidebar nav + session gate for every /dashboard/* route.
                                     Static sidebar from 992px, CSS-only off-canvas drawer below
    page.tsx                        Overview: KPIs, stock ledger, generic "record a movement" demo
    products/                       Product catalogue + bulk data import template downloads
    bom/                             Bill of materials (flat) + explosion calculator
    receiving/                      Ad-hoc GRN quick-receive
    purchase-orders/                Full PO lifecycle: draft → issue → receive
    transfers/                      Inter-warehouse transfers
    adjustments/                    Write-offs & adjustments with approval gate
    sales/                          Requisitions (route unchanged; repurposed from Sales & Dispatch, §1.1)
    suppliers/, customers/          List + add pickers (customers/ now labeled "Departments" in the UI)
    invoices/                       Dormant — invoicing, payments, credit notes; still functional, unlinked
    reports/                        Dashboards & reports (14 of "15+"), CSV export per table
    scan/                            Barcode/QR lookup (USB scanner-friendly GET form + camera scan)
    labels/                          Print-ready label sheets with real QR (@media print, .no-print)
    audit-log/                      Append-only audit trail viewer
    security/                       Mock 2FA enrollment, gating the most sensitive action

docs/ARCHITECTURE.md            The running decision log — phase status, what's real/mocked, open
                                 business decisions, next steps in order. Update it as phases complete.
CHANGELOG.md                    Version-by-version build history (semver, pre-1.0)
```

---

## 11. Next steps (in order)

1. **Resolve §9.1 (MVP cut-line) and §9.2 (permission matrix) with the client** before committing further
   engineering time — both materially change what's built next.
2. **Authentication phase:** real Supabase project + Supabase Auth, replacing `src/lib/auth.ts` —
   including real password hashing; the 2FA *gate* already exists (§7), but real Supabase Auth MFA (an
   actual authenticator app) still needs to replace the mock flag-flip in `/dashboard/security`.
3. **Core Data phase:** apply all migrations (including the audit-log immutability trigger) to that
   project, replace the mock repositories with real Supabase-backed ones behind the same interfaces.
4. **Accounting integration:** explicitly deferred by client decision — do not build ahead of a future,
   separate go-ahead, once a platform is chosen (§9.5).
5. **Last of Phase 5:** a rendered Code 128 linear barcode symbol for labels — needs a physical scanner
   on hand to verify the encoder against before it's safe to ship. Reports (14 of "15+"), QR generation,
   and camera + USB scanning are all done.
6. **Inventory data import.** Cobro doesn't have a complete digital inventory list yet. **Templates now
   exist and are downloadable from `/dashboard/products`** — a product master-data CSV and an opening-stock
   CSV (quantity + cost per warehouse), each matching the real domain fields exactly, plus a plain-language
   instructions file. **The self-service import mechanism itself is still not built** — a completed file is
   currently loaded by X Spark manually. Still needed: an upload-and-import screen with controlled
   validation (required fields, SKU uniqueness, UOM, barcode/QR identifiers, numeric quantities,
   duplicates, and that every opening-stock SKU exists in the product file) before that data can self-load.
   Demo/dummy data must stay clearly separate from whatever Cobro's real import produces.
7. **PDF/Excel report export.** Only CSV export exists today; the RFQ mentions PDF and Excel too.
8. **Phase 8:** system testing, UAT, training materials, production cutover.
