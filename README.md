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
| | Goods receiving (quick-receive, ad-hoc) | ✅ |
| | Inter-warehouse transfers | ✅ |
| | Write-offs & adjustments (with approval gate) | ✅ |
| Phase 3 — Sales, Procurement & Suppliers | Sales orders & dispatch (reserve → dispatch) | ✅ |
| | Full purchase order lifecycle (draft → issue → partial/full receive) | ✅ |
| | Suppliers, Customers | ✅ |
| Phase 4 — Invoicing, Billing & Accounting | Invoicing & billing (VAT, payments, ageing) | ✅ |
| | Accounting integration (Sage/QuickBooks/Xero) | ⏳ blocked on §7.5 |
| Phase 5 — Dashboards, Reporting, Barcode Scanning | Dashboards & reports (15 of "15+", CSV export) | ✅ |
| | Barcode/QR scanning (USB scanner: lookup + receiving) | ✅ |
| | Product labels (print-ready sheets) | ✅ |
| | Camera-based scanning, rendered barcode symbol graphic | Not started |
| Phase 6 — User Management, Security, Audit Trail | RBAC enforcement (real, 4 demo roles) + audit log | ✅ |
| | DB-level audit log immutability trigger | ⏳ written, not applied (no live DB) |
| | 2FA gate on the most sensitive action (approve/reject adjustments) | ✅ |
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
  point/quantity.
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
- **Sales orders & dispatch** (`/dashboard/sales`) — draft (nothing reserved) → confirm (reserves stock,
  no ledger movement, no WAC change) → dispatch (posts the real outbound movement at the ledger's current
  WAC, releases the reservation) or cancel from draft/confirmed (releases any reservation, posts nothing).
- **Suppliers** (`/dashboard/suppliers`) and **Customers** (`/dashboard/customers`) — list + add, feeding
  the pickers on receiving/purchase orders and sales orders respectively.
- **Invoicing & billing** (`/dashboard/invoices`) — one VAT-compliant invoice generated per dispatched
  sales order (15% VAT, the current SARS rate; 30-day payment terms matching Cobro's own terms as vendor
  to Productivity SA). Payments — partial or full — move status `unpaid` → `partially_paid` → `paid`;
  ageing is computed against the due date. A dispatched order can't be invoiced twice.
- **Dashboard overview** (`/dashboard`) — live KPIs (SKUs tracked, total stock value, below-reorder-point
  count) and the multi-warehouse stock ledger table, plus a generic "record a movement" form that exercises
  the engine directly (the original proof-of-concept before the dedicated workflow pages existed).
- **Dashboards & reports** (`/dashboard/reports`) — all fifteen: stock valuation, low stock, warehouse
  summary, dormant stock, sales order summary, customer summary, pick list, purchase order summary,
  supplier summary, open purchase orders, invoice ageing, stock movement history, receiving history,
  movement type totals, and adjustment reason summary — each exportable to CSV. The RFQ's "15+" target,
  reached.
- **Barcode / QR scan** (`/dashboard/scan`) — scan or type a barcode to look up a product and its stock
  across every warehouse; USB scanners work today (they act as keyboard input, submitting a plain form on
  Enter). Also wired into Goods Receiving as a "scan to select product" field. Camera-based scanning isn't
  built yet.
- **Product labels** (`/dashboard/labels`) — pick a product and copy count, get a print-ready sheet (SKU,
  name, barcode number in large text). Deliberately a human/scanner-readable text code, not a rendered
  Code 128/QR symbol graphic — a wrong encoding would look legitimate but not scan, and this pass had no
  way to verify one against a real scanner (full rationale in `docs/ARCHITECTURE.md` §1). Linked from the
  product catalogue's "Print labels" action.
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
| Accounting integration (Sage/QuickBooks/Xero) | Not started — blocked on choosing a platform (§7.5) |
| Dashboards & reports (15 of "15+", CSV export) | Real logic and UI |
| Barcode/QR scanning (USB scanner: lookup + receiving) | Real logic and UI |
| Product labels (print-ready sheets) | Real logic and UI |
| Camera-based scanning, rendered barcode symbol graphic | Not started |
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
3. **BOM structure.** Currently one-level (parent → component). Does Cobro need nested/multi-level BOM?
4. **Adjustment reason codes.** Seeded with plausible defaults (`BREAKAGE`, `CYCLE_COUNT`, `THEFT_LOSS`,
   `FOUND_STOCK`) — confirm the real list and which roles approve which reasons.
5. **Accounting integration target.** RFQ allows Sage, QuickBooks, or Xero "or equivalent" — not chosen.
6. **Reorder point scope.** One global `reorder_point` per product today — does Cobro want per-warehouse
   thresholds instead?
7. **VAT-exempt sales.** Every invoice is standard-rated (15%) today — do any customers (e.g. exports)
   need a 0%-rated path?
8. **Payment terms.** Invoices default to 30 days, mirroring Cobro's own terms as vendor to Productivity
   SA — confirm this is actually Cobro's customer-facing policy.

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
src/components/export-csv-button.tsx   Reusable client-side CSV export, used by every report table
src/lib/auth.ts                 Mock session/auth — replaced wholesale in the real Authentication phase
src/lib/demo-credentials.ts     The 4 demo logins (kept separate so a 'use client' component can safely
                                 import it without pulling next/headers into the client bundle)
src/lib/now.ts                  Tiny wrapper around Date.now() so Server Components can read wall-clock
                                 time without tripping the react-hooks/purity lint rule

src/app/
  page.tsx                        Redirects to /login or /dashboard based on session
  login/                          Sign-in screen (server action + client form, role picker)
  dashboard/
    layout.tsx                      Sidebar nav + session gate for every /dashboard/* route
    page.tsx                        Overview: KPIs, stock ledger, generic "record a movement" demo
    products/                       Product catalogue
    receiving/                      Ad-hoc GRN quick-receive
    purchase-orders/                Full PO lifecycle: draft → issue → receive
    transfers/                      Inter-warehouse transfers
    adjustments/                    Write-offs & adjustments with approval gate
    sales/                          Sales orders & dispatch
    suppliers/, customers/          List + add pickers
    invoices/                       Invoicing & billing, payments, ageing
    reports/                        Dashboards & reports (15 of "15+"), CSV export per table
    scan/                            Barcode/QR lookup (USB scanner-friendly plain GET form)
    labels/                          Print-ready product label sheets (@media print, .no-print convention)
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
4. **Accounting integration:** once §9.5 is decided, build the Sage/QuickBooks/Xero sync.
5. **Rest of Phase 5:** camera-based scanning, a rendered barcode symbol graphic (Code 128/QR) for
   labels — reports are done (15 of "15+").
6. **Phase 8:** system testing, UAT, training materials, production cutover.
