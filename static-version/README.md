# Cobro IMS — Static Demo Twin

A **fully interactive, browser-only twin** of the Cobro IMS Next.js app, built to deploy on any static
host. Same look, same dummy data, same workflows — no server, no database, no backend of any kind.

The Next.js app in the parent folder is **untouched** and remains the source of truth. This is a separate
implementation, not a replacement.

---

## Why this exists

The Next.js app cannot be served as static files. Every page is an `async` Server Component that computes
HTML per request, all ~13 mutations are `'use server'` Server Actions, and `src/lib/auth.ts` uses the
server-only `cookies()` API. A static host has no server, so there is nothing to publish.

This twin re-implements the same UI and the same business logic to run **entirely in the browser**, with
[Zustand](https://github.com/pmndrs/zustand) standing in for the server-side mock repository layer.

---

## Run it locally

```bash
npm install
npm run dev          # dev server
```

```bash
npm run build        # produces dist/
npm run preview      # serves the built dist/ — test THIS, not just dev
```

Sign in with any of the four demo accounts (shown on the login page, one-click autofill):

| Role | Email | Password |
| --- | --- | --- |
| Admin | `demo@cobroconcrete.co.za` | `CobroDemo2026` |
| Warehouse clerk | `clerk@cobroconcrete.co.za` | `CobroClerk2026` |
| Procurement | `procurement@cobroconcrete.co.za` | `CobroProcure2026` |
| Viewer | `viewer@cobroconcrete.co.za` | `CobroViewer2026` |

---

## Deploy to Render

Create a **Static Site** (not a Web Service) pointed at this repository:

| Field | Value |
| --- | --- |
| Service type | **Static Site** |
| Repository | `XSparkDev/cobro-ims` |
| Branch | `qa` (or whichever branch holds this folder) |
| **Root Directory** | `static-version` |
| **Build Command** | `npm install && npm run build` |
| **Publish Directory** | `dist` |

**No rewrite rules are needed.** This app uses **hash routing** (`/#/dashboard/products`) specifically so
that deep links and hard refreshes work on a plain static host with zero configuration — the part after
`#` never reaches the server, so every URL resolves to `index.html` naturally.

> If you ever switch to browser history routing, you **must** add a Render rewrite rule
> (`/*` → `/index.html`, action: **Rewrite**) or every refresh on a sub-route will 404.

`vite.config.ts` sets `base: './'`, so all asset URLs are relative and the build works from any path.

### Secrets

There are none. The only credentials in the bundle are the four demo passwords, which are already printed
on the login page of the original app by design — they gate nothing real. No API keys, tokens, database
URLs, or service credentials exist anywhere in this project or its build output.

---

## What's real, what's simulated

| Area | Status in this build |
| --- | --- |
| WAC costing engine | **Real** — `src/store/engine.ts` is a verbatim copy of the original inventory engine |
| All 14 reports | **Real** — verbatim copies of the original pure report builders |
| RBAC (4 roles) | **Real** — verbatim permission matrix, enforced on every mutating action |
| 2FA gate on `approve_adjustments` | **Real gate**, mock enrollment (same as the original) |
| Audit log | **Real**, append-only — no update/delete method exists |
| QR codes on labels | **Real** — `qrcode` package, verified by encode→decode round-trip |
| Every workflow (receive, PO lifecycle, transfer, adjust, requisition) | **Real logic**, running against the Zustand store |
| Data persistence | `localStorage`, per-device — **not** a database |
| Authentication | **Demo only** — a client-side credential check. Protects nothing. |
| Code 128 linear barcode | **Not built** — same deliberate omission as the original |

### Data & persistence

The seed dataset (`src/store/seed.ts`) is a verbatim copy of the original's — same IDs, same products,
same opening stock, same suppliers/departments/reason codes. On first load it hydrates the Zustand store;
from then on the store persists to `localStorage` under the key `cobro-ims-static-demo`.

**"Reset demo data"** in the sidebar footer clears it and re-seeds. Because state is per-browser, two
visitors see independent copies, and clearing site data wipes it.

### Authentication — read this

Sign-in here is a **client-side demo check**, not authentication. The entire dataset lives in the
visitor's own browser, so the login screen only decides what the UI displays; it secures nothing. The
login page says so on the page itself. Real auth in the live system is server-side Supabase Auth.

The **RBAC and 2FA gates are genuinely enforced** in the store — a Viewer really is refused, and approving
an adjustment really does require 2FA — but since a determined user controls their own browser, treat all
of it as a faithful demonstration of the rules, not as security.

---

## Structure

```
src/
  store/
    types.ts             verbatim port of src/lib/domain/inventory.ts
    seed.ts              verbatim port of src/lib/data/mock/seed.ts
    engine.ts            verbatim port of inventory-engine.ts (WAC math — unaltered)
    reports.ts           verbatim port of services/reports.ts (all 14 builders)
    permissions.ts       ported matrix; sync instead of async (roles are a local constant)
    demo-credentials.ts  verbatim copy
    uuid.ts              browser replacement for Node's crypto.randomUUID
    useStore.ts          the Zustand store — every Server Action, same semantics
  ui/                    shared components (CSV export, camera scanner, scan row, inline feedback)
  layout/                sidebar + CSS-only mobile drawer, nav, auth guard
  pages/                 one component per route
```

### Three adaptations forced by the browser

1. `state.ledger` and `purchaseOrderLines` were `Map`s. Maps don't survive JSON serialization, so they're
   plain `Record`s with identical key formats.
2. `pendingTransferLines` / `pendingAdjustmentLines` were module-level `Map`s **outside** `state` in the
   original — fine for one server process, but a page refresh would have made in-transit transfers
   impossible to complete and pending adjustments impossible to approve. They're folded into the
   persisted store.
3. Permission checks are synchronous and actions return a result object instead of throwing, because the
   UI renders the message inline exactly the way `useActionState` did.

Everything else — status transitions, validation, error strings, document numbering (`PO-####`,
`GRN-####`, `XFR-####`, `ADJ-####`, `REQ-####`) — is unchanged.

---

## Verified against the original

Tested against the **built `dist/`**, not the dev server:

- Stock valuation grand total **R 465 789,00** on seed data — matches a hand-sum of all eight ledger rows
- Receive 160 @ R100 onto 1,840 @ R92.50 → **WAC R 93.10** exactly
- Two partial PO receipts (600 then 400) → compounded **WAC R 91.9727** exactly
- Transfer 200 DBN→PMB → destination inherits the **source's** WAC: **R 93.7721** exactly
- Requisition approve reserves only (on-hand and WAC untouched); issue drops on-hand by exactly the
  ordered quantity at WAC and releases the reservation
- 2FA gate blocks approval with the original's exact message, then permits it once enabled
- Viewer refused with `viewer does not have permission to do that.`
- QR encode→decode round-trip returns the identical string
- BOM explosion 0.02 × 5,000 = **100** exactly
- Deep-link hard refresh on `/#/dashboard/reports` works; all form controls measure exactly **36.00px**;
  no horizontal overflow at 375 / 768 / 991 / 992 / 1280; drawer↔sidebar flips exactly at 992px
- Zero console errors throughout

---

**Client:** Cobro Concrete (Pty) Ltd · **Technology partner:** X Spark
