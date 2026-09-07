# Changelog

Version tracks development milestones, not production releases — nothing below has shipped to a real
Supabase project or a Cobro user yet (see `docs/ARCHITECTURE.md` for what's real vs. mocked). Semantic
versioning, pre-1.0 while auth, real data, and the remaining RFQ phases are outstanding.

## v0.27.1 — 2026-09-06

**"Post receipt" centred and sized to match Scan - Stores profiles only.**
- On a Stores Manager / Stores Clerk profile the GRN form's submit now takes the middle column of the
  five-column grid, which is both centred under the form and exactly the width the Overview's Scan button
  occupies - the two buttons are placed the same way, so they line up. Measured identical at 1400px:
  203x36 for both, same left and right edges
- Admin is deliberately unchanged: standard left-aligned submit, 123x41
- Files changed: `src/app/dashboard/receiving/receive-form.tsx` (new optional `centerSubmit` prop),
  `src/app/dashboard/page.tsx`, `src/app/dashboard/receiving/page.tsx` (both decide it by role)

## v0.27.0 — 2026-09-06

**Receive stock (GRN) on the Overview, and its Unit cost is now Admin-only too.**
- The GRN quick-receive form now also sits on the Overview, directly above "Record a stock movement", so a
  delivery can be booked in without leaving the page. It is the **same component and the same server
  action** as `/dashboard/receiving`, not a second implementation - one permission gate, one code path
- Gated on `manage_receiving`, the permission the receiving route and the receive action already use:
  Admin and both Stores roles get it, Engineer / Requester does not (and never receives the markup, since
  the check is server-side). Store pickers are limited to real stores - supplier goods land in a store,
  never straight onto an Engineer's personal station
- **Unit cost on the GRN form now follows the v0.25.0 rule**: `manage_pricing` (Admin) edits it, everyone
  else sees the catalogue price as plain bold orange text with no input. Putting the two forms on one page
  made the inconsistency obvious - an editable cost in the GRN card sitting directly above a read-only one
  in the movement card
- Enforced server-side in `receiveStockAction`, mirroring `recordMovementAction`: a non-Admin's submitted
  unit cost is discarded and re-derived - catalogue price, then the location's existing WAC, and a clear
  refusal if there is neither. Never zero, which would drag WAC down and corrupt the valuation
- Verified live: the editable input renders only for Admin on both `/dashboard` and `/dashboard/receiving`
  (Stores Clerk gets a hidden field and read-only text on both), and a Stores Clerk receipt posted at the
  catalogue price - Cement 2,252 → 2,253 bags with WAC moving 92.81 → 92.82, i.e. up toward R118 rather
  than down toward zero
- Files changed: `src/app/dashboard/page.tsx`, `src/app/dashboard/receiving/page.tsx`,
  `src/app/dashboard/receiving/receive-form.tsx`, `src/app/dashboard/receiving/actions.ts`

## v0.26.0 — 2026-09-06

**"Stock by location" gains role-aware views, a station picker and a product filter.**
- The card now has a **Station / Stores** view toggle, and what each view contains is scoped to the
  viewer's role rather than to what their permissions technically allow:
  - **Admin / Stores** - Station shows every Engineer's station (oversight of what's out on the floor);
    Stores shows the physical store itself
  - **Engineer / Requester** - Station opens on their own station; Stores shows what they may actually
    requisition from, which is every store PLUS every other Engineer's station (the peer-pickup set the
    Requisitions "Store" picker already used), never their own
- **Station picker** beside the toggle, shown only while the Station view is active - an Engineer's own
  station is listed first and labelled "(yours)", so their default view is exactly what it was before the
  picker existed, and peers are now inspectable directly rather than read out of the Stores list. This is
  not new exposure: peer stations were already visible to them in the Stores rows and the Requisitions
  picker
- **Product filter** listing the full catalogue (SKU + name), applying to either view and combining with
  the station picker
- An "everything, everywhere" third view was built first and then dropped: between Station and Stores it
  added no location the viewer couldn't already see, so it was a third button that only made the choice
  harder
- The table markup itself is unchanged - it moved into a client component purely so switching views is a
  state change (no navigation, no refetch, nothing else on the page reset)
- Layout: heading and the three controls share one row on wide screens with the description spanning the
  full width beneath them (sharing a single row squeezed the description into a narrow column and wrapped
  the heading onto two lines); on a phone the controls stack and the reading order stays heading →
  description → controls. Verified no overflow or sideways scroll at 375px, 820px and 1400px
- Verified live for Admin, Stores Manager, Stores Clerk and Engineer, including the empty state for a
  station holding no stock
- Files added: `src/app/dashboard/stock-by-location-card.tsx`. Changed: `src/app/dashboard/page.tsx`

**Confirmed, not changed:** external requisition (a Purchase Order against a supplier) remains Admin +
Stores only - `manage_purchase_orders`, enforced at nav visibility, the route gate, and the server
actions. Engineer / Requester gets Access Denied. No change was needed; verified live for all four roles.

## v0.25.0 — 2026-09-06

**Unit cost is Admin-only to set - visible to everyone, changeable by nobody else.**
- The stock-movement Unit cost now follows the same rule the Quick requisition's Unit value already did:
  `manage_pricing` (Admin) edits it, every other role sees it. Setting what stock cost is a pricing
  decision, the same authority that sets price on the catalogue - it is not a store-floor choice
- Non-Admin roles get the figure as **plain bold orange text, no input outline** (the product's catalogue
  price), in both places it appeared: the Overview's "Record a stock movement" card and the scan dialog's
  count step. Gating only the form would have been theatre, since the dialog is what posts
- **Enforced server-side, not just hidden**: `recordMovementAction` now discards a non-Admin's submitted
  `unitCost` outright and re-derives it - catalogue price first, then the location's existing WAC, and a
  clear refusal if there is neither (never zero, which would silently drag WAC down and corrupt the stock
  valuation). What posts therefore always matches the figure the user was shown
- Seeing costs at all remains a separate, Admin-controlled setting (`showCostsToAllRoles`,
  `src/lib/costs.ts`) - untouched here. Costs-hidden roles still see the withheld marker, not a price
- Verified live: as Admin the field is still an editable input; as Stores Manager it renders as
  `R 118.00` (computed colour `rgb(238,152,60)`, font-weight 700, 0px border, and zero `<input>` elements
  in that label), and posting 1 bag moved WAC 92.79 → 92.80 with stock value up exactly R118.00 -
  i.e. costed at the catalogue price, not at the zero the form would have sent
- Files changed: `src/app/dashboard/record-movement-form.tsx`, `src/app/dashboard/scan-movement.tsx`,
  `src/app/dashboard/page.tsx`, `src/app/dashboard/actions.ts`

**README brought back in line with the app.**
- Fixed stale documentation of the standalone `/dashboard/scan` page, removed back in v0.20.0 - four
  references (§5.1 control-height exceptions, Engineer stations, the module list, the project-layout tree)
  still described it as a live page
- Documented what had shipped but was never written up: the Admin requisition-creation exclusion (v0.21.0),
  the RBAC-scoped notification bell (v0.24.0), the mobile Scan-first Overview layout (v0.23.0), and the
  Unit cost rule above
- §2 status table gained rows for each; §9.13 (low-stock notification recipients) narrowed to what is
  genuinely still open - out-of-band push/email to a named person, since the in-app half now exists
- Files changed: `README.md`

## v0.24.1 — 2026-09-06

**Scan dialog subtitle, larger.**
- "Scan the item"'s subtitle ("Scan to check-in / check-out stock.") bumped from 0.83rem to 1.33rem
- Confirmed the notification bell's count badge (added in v0.24.0) is already live on both desktop and
  mobile - Admin shows "2", Engineer correctly shows none at zero - no code change needed for that
- Files changed: `src/app/dashboard/scan-movement.tsx`

## v0.24.0 — 2026-09-06

**New: RBAC-scoped notification bell.**
- A bell icon (desktop sidebar and mobile sticky header, same dual-placement pattern ThemeToggle already
  uses) with a red count badge and a dropdown of clickable action items - "what needs my attention right
  now", scoped to what each role actually does in the confirmed Cobro workflow, not to everything a
  permission technically allows:
  - **Admin**: items below reorder point (their purchasing trigger) and store-sourced requisitions
    awaiting approval
  - **Stores Manager / Stores Clerk**: requisitions awaiting approval and purchase orders awaiting
    receiving
  - **Engineer / Requester**: their own requisitions approved and ready to collect, and any pickup
    requests sourced from their own station awaiting their approval
- Deliberately NOT a persisted notification feed - no `notifications` table, no read/unread state, no
  timestamps. There's no backend to persist or push them yet, and inventing one would be a second,
  competing source of truth for state this app already derives live everywhere else (the ledger view, the
  Reserved-cell popover, the Overview stat tiles). `src/lib/notifications.ts` recomputes a small snapshot
  from the existing repositories on every render instead
- The clearest case for scoping by job, not by permission: Admin holds `manage_receiving` via `'*'`, but
  receiving is Stores' physical job (Admin purchases; Stores receives, reserves and issues) - so "purchase
  orders awaiting receiving" is a Stores notification only, even though Admin could technically open that
  page
- The dropdown is portalled to `document.body` and positioned with `fixed` coordinates read off the
  button's own rect (same technique as `ScanMovement`'s and `QuickRequisitionButton`'s dialogs) - the
  desktop sidebar sets `overflow-y-auto`, which per the CSS overflow spec forces the x-axis to `auto` too,
  so a plain `absolute` dropdown was silently clipped to the sidebar's own width instead of floating over
  the main content
- Verified live for Admin, Stores Manager, and Engineer (each shows exactly its scoped items, including
  the correct empty "You're all caught up" state), on both desktop and mobile
- Files added: `src/lib/notifications.ts`, `src/app/dashboard/notification-bell.tsx`. Changed:
  `src/app/dashboard/layout.tsx`

**Scan dialog copy.**
- "Scan the item"'s subtitle changed from "Scan an item to start counting it. Nothing is posted yet." to
  "Scan to check-in / check-out stock."
- The code-number field's placeholder changed from "Type or scan the code number" to "Type product id code
  or scan QR code"
- Files changed: `src/app/dashboard/scan-movement.tsx`

- `npx tsc --noEmit` and `npm run lint` both clean

## v0.23.0 — 2026-09-06

**Mobile-only Scan-first layout for "Record a stock movement".**
- Below the `sm` breakpoint (the same width the fields grid already collapses to one column at), the
  Overview's "Record a stock movement" card now shows just the heading and a prominent, full-width Scan
  button - the explanation paragraph and the Product/Store/Type/Quantity/Unit cost fields are hidden.
  Desktop/tablet are unchanged: same explanation, same five-field grid, Scan inline with the rest at its
  usual 36px control height
- This is a deliberate phone-first trade-off, not an oversight: Store has one real option since the
  single-store consolidation (plus each Engineer's own station), Quantity comes from the scan count, and
  Unit cost has its own field inside the scan dialog - so the only thing a mobile operator can't set here
  is movement Type, which has no in-dialog picker and defaults to Receipt (GRN). Dispatch/Transfer/
  Adjustment/Write-off still need the full form on a wider screen
- `ScanMovement` gained an optional `triggerHeightClassName` prop (defaults to `h-9`, the 36px standard)
  so the mobile-only instance can render a taller, easier tap target (`min-h-[45px]`) without duplicating
  any of the component's scan/dialog logic - both the mobile and desktop/tablet instances share the same
  lifted state and handlers; only one is ever visible or clickable at a given width
- `npx tsc --noEmit` and `npm run lint` both clean
- Files changed: `src/app/dashboard/record-movement-form.tsx`, `src/app/dashboard/scan-movement.tsx`

## v0.22.0 — 2026-09-06

**Removed `static-version` — the browser-only static-site twin of the app.**
- A full audit found `static-version/` (a Vite/Zustand/localStorage twin, originally built to deploy the
  demo to a static host with no server) had forked its own RBAC and data model since creation: 3 roles
  (admin/engineer/store) instead of the current 4, Admin locked OUT of purchasing (contradicting the
  confirmed "Admin purchases" business rule), Requisitions and Transfers merged into one workflow, and a
  generic "Asset" location concept replacing the Engineer's-station model - none of it ever reconciled back
  into the real app
- Decision: there is no separate mobile app in this project - "mobile" is the main Next.js app's own
  responsive breakpoints (a 992px CSS-only drawer, verified down to 375px - see docs/ARCHITECTURE.md).
  `static-version` was a demo artifact, not a maintained second product, so it's removed rather than
  reconciled - one app, one RBAC model, one data model, one source of truth
- Removed: the entire `static-version/` directory, its nested `package.json`/`package-lock.json`, and the
  `cobro-ims-static-preview` entry in `.claude/launch.json`
- Cleaned up: `tsconfig.json`'s now-meaningless `static-version` exclude entry
- This also removes the two pre-existing, previously-flagged `static-version/` lint errors
  (`react-hooks/set-state-in-effect` in `Labels.tsx`, `react-hooks/purity` in `Reports.tsx`) - `npm run lint`
  is now warning-only, zero errors
- `npx tsc --noEmit` and `npm run lint` both clean
- Files changed: `.claude/launch.json`, `tsconfig.json`. Removed: `static-version/` (entire directory)

## v0.21.0 — 2026-09-06

**Admin no longer requisitions stock — a confirmed business rule, enforced end to end.**
- Admin purchases (Purchase Orders against a supplier); Engineer/Requester (and Stores) requisitions
  (internal requests against Stores). These were two conflated processes: Admin held `create_requisitions`
  via its `'*'` catch-all, so both the Overview Quick requisition icon and the full `/dashboard/sales`
  create form silently worked for Admin
- Fixed at the single enforcement point every path already called through
  (`hasPermission`/`checkPermission`/`requirePermission` in `src/lib/permissions.ts`), not by hiding UI: a
  new `ROLE_EXCLUSIONS` map carves `create_requisitions` out of Admin's `'*'`, so the Overview icon, the
  `/dashboard/sales` form, the `createSalesOrderAction` Server Action, and the sidebar nav filter are all
  covered automatically, with no separate/duplicate check to keep in sync
- Admin's read/oversight access is preserved and made explicit: a new `view_requisitions` permission
  (held by Stores Manager, Stores Clerk, Engineer/Requester, and Admin) now gates the "Requisitions" nav
  link and the page, decoupled from `create_requisitions`
- `/dashboard/sales` no longer renders a create form Admin can fill in only to be refused on submit -
  Admin instead sees an explanation ("Admin does not requisition stock from Stores… raise a Purchase Order
  instead") linking to Purchase Orders, with the full requisitions list and existing Approve/Cancel rights
  unchanged below it
- `createSalesOrderAction`'s denial message is Admin-specific rather than a generic "no permission" string
- Audited the rest of the app for other requisition-creation entry points (product catalogue, mobile,
  quick actions, routes): none exist beyond the two above. The orphaned `/dashboard/scan` scan-station
  component's "Requisition this product" link is dead code - its page was already removed in v0.20.0 and
  nothing imports it
- `npx tsc --noEmit` and `npm run lint` both clean (only the pre-existing, deferred `static-version/`
  issues remain)
- Files changed: `src/lib/permissions.ts`, `src/lib/nav-items.ts`, `src/app/dashboard/sales/actions.ts`,
  `src/app/dashboard/sales/page.tsx`

## v0.20.0 — 2026-09-06

**Scan station consolidated onto Overview; single-store demo data; Quick requisition shortcut.**
- Removed the standalone `/dashboard/scan` page and its nav link. Scanning (Look up, Scan IN, Scan OUT,
  and the Engineer-station Use mode from v0.19.x) now lives entirely on the Overview's existing "Record a
  stock movement" card - one scan surface instead of two. The reusable scan components/actions stay in
  the codebase (currently unreferenced) in case a dedicated entry point is wanted again later
- Demo data reduced to a single physical Store (Durban Store / DBN-FAC) - Pietermaritzburg and Richards
  Bay removed, with their seeded stock consolidated into Durban's ledger (blended WAC), not dropped.
  Inter-store Transfers keeps its page/schema but has nothing to demo between real stores until a second
  one exists; Engineer-station transfers (accept/peer pickup) are unaffected
- Store names now say "Store" consistently (was a Factory/Warehouse/Depot mix); Store pickers show the
  full name alongside the code (`DBN-FAC - Durban Store`), matching how Engineer stations are already shown
- Two more Engineers seeded (Sarah Naidoo/Electrical, Karabo Dlamini/Workshop) so more-than-one Engineer
  station exists by default, without needing to create them live first every session restart
- A Store can now be its own "requesting department" (a Customer record per Store), so a Store can raise
  a requisition for its own use, not only external departments
- **New: Quick requisition** - a small icon on each "Stock by location" row (shown only to a session with
  `create_requisitions`, hidden on the viewer's own station) opens a compact modal with Product/Store
  already fixed to that row - only Department, Quantity, and Unit value are left to fill in. Reuses
  `createSalesOrderAction` directly, so there's no second validation/permission path to keep in sync.
  Unit value prefills from the catalogue price and is read-only for every role except Admin
  (`manage_pricing`, the same authority that edits price on the catalogue itself). Shows on-hand at the
  row's own location plus a secondary "Also on hand at ..." line covering every other store and Engineer's
  station currently holding the product, so a requester sees the full picture without leaving the modal
- The same live "available units" counter (updates as Product/Store selection changes) is now on the full
  Requisitions page's create form too, not just Overview and the Quick requisition modal
- `npx tsc --noEmit` and `npm run lint` both clean (only the pre-existing, deferred `static-version/`
  issues remain)
- Files changed: `src/app/dashboard/page.tsx`, `record-movement-form.tsx`, `actions.ts`,
  `sales/page.tsx`, `sales/sales-order-form.tsx`, `scan/actions.ts`, `scan/scan-help.tsx`,
  `scan/scan-station.tsx`, `users/actions.ts`, `src/lib/data/repositories.ts`,
  `src/lib/data/mock/repositories.ts`, `src/lib/data/mock/seed.ts`, `src/lib/domain/inventory.ts`,
  `src/lib/nav-items.ts`, `purchase-orders/page.tsx`, `receiving/page.tsx`. Removed:
  `scan/page.tsx`. New: `src/app/dashboard/quick-requisition-button.tsx`

## v0.19.2 — 2026-09-06

**Fix: product catalogue and BOM editing are Admin-only, not Stores Manager too.**
- `manage_catalogue` (create a product, add/remove a BOM component) was left on Stores Manager, matching
  the "operational edit only where appropriate" wording from an earlier brief. Corrected: Stores shouldn't
  add any product to the system at all - that's master-data ownership, Admin's alone
- Stores Manager and Stores Clerk are now both view-only on `/dashboard/products` and `/dashboard/bom` -
  the "Add a product" form, "Bulk data import" section, and "Add a component"/"Remove" BOM controls no
  longer render for either role. Admin unaffected
- Verified live: Stores Manager on Product catalogue shows the list only, no add form, no bulk-import
  section; BOM page shows no add-component form; Admin still sees both, unchanged
- Files changed: `src/lib/permissions.ts`, `src/lib/data/mock/seed.ts`, `README.md`,
  `docs/ARCHITECTURE.md`

## v0.19.1 — 2026-09-06

**Overview: live available-stock counter on the "Record a stock movement" form.**
- A bold counter under the Product field now shows on-hand quantity at the currently selected Store
  ("1,835 bag available at DBN-FAC"), updating immediately when either Product or Store changes - no
  extra fetch, derived from the same ledger data the page already loads for the Store table below
- Zero on hand renders in red with an explicit "- none on hand here", everything else in bold orange
  (`text-accent-strong`) so it's not missed before the operator scans
- Files changed: `src/app/dashboard/page.tsx`, `src/app/dashboard/record-movement-form.tsx`

## v0.19.0 — 2026-09-06

**RBAC completion: menu, route, and action-level access control on top of the existing permission model.**
- Menu visibility (`src/lib/nav-items.ts`): the sidebar was one static list shown to every role; each
  item now names the one existing `Permission` that separates "sees this" from "doesn't" (reusing
  `manage_purchase_orders`, `manage_receiving`, `manage_transfers`, `request_adjustments`,
  `create_requisitions`, `view_reports`, `manage_users`, and a new `view_audit_log`), filtered in
  `dashboard/layout.tsx` before render
- Route protection (`src/components/access-denied.tsx`): Purchase orders, Goods receiving, Suppliers,
  Transfers, Write-offs & adjustments, Product labels, and Audit log now reject a role without the
  matching permission before rendering any content — typing the URL directly is blocked exactly like a
  hidden nav link would be, not just visually absent
- Action-level trims within still-visible pages: Product catalogue/BOM hide add/edit forms (not disable
  them) for non-catalogue-managers; Departments/Suppliers hide their create forms for non-managers;
  Requisitions hides Approve/Issue/Cancel entirely for an Engineer; Overview drops the "Record a stock
  movement" panel for an Engineer, none of whose permissions apply to any of its six movement types
- `request_adjustments` removed from Stores Clerk — a Clerk can no longer request or approve a
  write-off/adjustment on their own authority; only Admin and Stores Manager can
- Audit log narrowed per role (not just gated): Admin sees every entry; Stores Manager/Clerk see
  everything except `users`/`app_settings` rows; Engineer has no access (their own activity is already
  visible on Requisitions)
- Dashboards & reports narrowed per role using the same fetched data: Stores Clerk loses the three
  purchasing/supplier-facing sections; Engineer sees only Low stock and their own Requisition summary
- One deliberate deviation from the originating brief, confirmed with the client first: Purchase Orders
  stayed full-authority for both Stores roles (per the client's earlier explicit instruction) rather than
  switching to the brief's Admin-only/Stores-view-only model
- Verified live for all four roles: nav-item lists match spec exactly; 8 direct-URL access attempts as
  Engineer and 1 as Stores Clerk all correctly denied; Reports content correctly scoped per role; Suppliers
  view-vs-edit split confirmed for Stores Clerk vs. Admin
- `npx tsc --noEmit` and `npm run lint` both clean (only the pre-existing, deferred `static-version/`
  issues remain)
- Files changed: `src/lib/permissions.ts` and 17 page components under `src/app/dashboard/`, plus
  `README.md` and `docs/ARCHITECTURE.md`. New: `src/lib/nav-items.ts`, `src/components/access-denied.tsx`

## v0.18.2 — 2026-09-06

**UI: collapse the demo-accounts card on `/login` behind a chevron toggle.**
- The RBAC-testing card (role buttons + autofilled email/password) was open by default, taking up a
  third of the login card before a user even looks at the sign-in form
- Now collapsed by default with a clickable header row and a chevron that rotates on open — same
  autofill behaviour once expanded, nothing else on the page changed
- Verified live: loads collapsed, expands on click, autofill still fills email/password correctly
- One file changed: `src/app/login/login-form.tsx`

## v0.18.1 — 2026-09-06

**Fix: grant purchase-order permission to both Stores roles, not Admin-only.**
- `manage_purchase_orders` was left Admin-only by oversight in v0.18.0's role rebuild — Cobro's actual
  workflow has Stores placing orders directly with external suppliers, not routing every reorder through
  Admin. Added it to both `stores_manager` and `stores_clerk`; Engineer / Requester still doesn't hold it
- Verified live: signed in as Demo Stores Clerk, created PO-1001 as a draft against Natal Cement
  Distributors — the server accepted it, not just the button rendering
- `npx tsc --noEmit` and `npm run lint` both clean (only the pre-existing, deferred `static-version/`
  issues remain)
- Files changed: `src/lib/permissions.ts`, `docs/ARCHITECTURE.md`, `README.md`

## v0.18.0 — 2026-09-06

**User roles & access model update — 4 roles matching Cobro's real operating structure, plus an
Admin-only user management screen (no rebuild of auth, DB architecture, or inventory logic).**
- Replaced the old roles (Admin, Warehouse Clerk, Procurement, Viewer) with exactly four: **Admin**
  (consolidates system admin, purchasing, supplier/catalogue/threshold management, and reporting —
  Procurement, Viewer, and Management are no longer separate roles), **Stores Manager** and **Stores
  Clerk** (the operational store function: receive, scan in/out, reserve, process/issue requisitions,
  transfer — no system administration), and **Engineer / Requester** (raises and tracks their own
  requisitions, tied to a factory **Area**, never touches the inventory ledger directly)
- Split the old `manage_sales_orders` permission in two: `create_requisitions` (Stores Manager, Stores
  Clerk, Engineer / Requester) and `manage_sales_orders` kept for approve/issue/cancel (Stores only) —
  the one substantive change to requisition permission logic, needed so an Engineer can create but never
  approve their own or anyone else's requisition
- New `/dashboard/users` screen (Admin-only, added `manage_users` permission): create a user (Name,
  Email, Role, and an Area when the role is Engineer / Requester) and change an existing user's role,
  area, or active status — every action audited. Multiple Admins are fully supported, not a singleton
- Added `User.area: string | null` to the domain type and a fixed `FACTORY_AREAS` list
  (`src/lib/areas.ts`); Requester/Area now show on every requisition row, derived from the existing
  `createdBy` field — no schema change to the Requisition itself
- Extended mock auth so a user created via the new screen can sign in immediately, with a documented
  shared default password (`NEW_USER_DEFAULT_PASSWORD`) alongside the 4 demo accounts — still exactly as
  much auth as before, no real per-user credentials, no password hashing; also added the deactivated-
  account sign-in rejection this exposed as a gap
- Migrated seed data in place (same 4 user/role IDs, remapped names/emails/roles) rather than deleting
  and recreating — safe because this is mock/demo data with no real Cobro users yet
- Verified live end-to-end: second Admin created and signed in independently; Engineer created a
  requisition with an Area and was correctly refused (server-side, not just UI-hidden) when attempting to
  approve it; Stores Clerk approved and issued it (ledger 1,840 → 1,835 at the correct WAC); audit log
  entries confirmed for user creation, role/area changes, and the requisition actions; Stores Clerk denied
  access to `/dashboard/users`; 36px control standard and mobile/responsive layout re-checked
- `npx tsc --noEmit` and `npm run lint` both clean (only the pre-existing, explicitly-deferred
  `static-version/` errors remain, untouched)
- Explicitly untouched: authentication architecture, database schema/migrations, WAC inventory engine,
  dashboard visual design, accounting/customer-sales scope, `static-version/`
- Files changed: `src/lib/permissions.ts`, `src/lib/data/repositories.ts`,
  `src/lib/data/mock/repositories.ts`, `src/lib/data/mock/seed.ts`, `src/lib/demo-credentials.ts`,
  `src/lib/auth.ts`, `src/lib/domain/inventory.ts`, `src/app/dashboard/layout.tsx`,
  `src/app/dashboard/sales/actions.ts`, `src/app/dashboard/sales/page.tsx`,
  `src/app/dashboard/scan/scan-help.tsx`, `README.md`, `docs/ARCHITECTURE.md`. New:
  `src/lib/areas.ts`, `src/app/dashboard/users/page.tsx`, `src/app/dashboard/users/actions.ts`,
  `src/app/dashboard/users/user-form.tsx`, `src/app/dashboard/users/user-row-actions.tsx`

## v0.17.2 — 2026-08-16

**Make the v0.17.1 select/input height fix hold across browser engines.**
- `select { min-height: calc(...) }` alone matched select and input heights exactly in this
  environment's Chromium, but a live screenshot showed the mismatch persisting elsewhere — native
  `<select>` chrome (`appearance: auto`) carries its own engine-specific intrinsic sizing that can
  override a plain `min-height` in some browsers, even with identical padding/border/font-size
- Fixed with `appearance: none` on every select, so `min-height` is the only thing deciding its box
  in every engine. Removing the native appearance also removes the native dropdown arrow, so a
  themed one (muted grey, matching `--text-muted`) is redrawn in the same spot, with `padding-right`
  widened so option text never sits under it
- Verified: every select/input still measures identical (43.12px) on Overview, Receiving, Sales,
  Transfers, Adjustments, BOM and Labels; no text clipping under the new padding on any page; no
  page-level horizontal overflow at 375px
- One file changed: `src/app/globals.css`

## v0.17.1 — 2026-08-16

**UI polish: uniform form-control heights.**
- Every `<select>` across the app rendered 0.12px shorter than the `<input>`s beside it on the
  same row — both share identical padding/border/font-size, but `<select>` sizes from intrinsic
  font metrics and ignores `line-height`, while `<input>` uses the body's `line-height: 1.5`
- Fixed with one rule in `globals.css`: `select { min-height: calc(1.5em + 1.25rem + 2px) }` —
  `min-height`, not `height`, so it can only grow a select to match, never clamp one down
- Verified live across every dashboard page with form rows (Overview, Product catalogue, BOM,
  Purchase orders, Receiving, Suppliers, Transfers, Adjustments, Sales, Customers, Labels): a
  single uniform control height (43.12px) everywhere, no distinct values remaining
- No other change — one file, `src/app/globals.css`, +16 lines

## v0.17.0 — 2026-08-16

**QR generation, camera scanning at the operational touchpoints, and a full responsive pass
(RFQ Phase 5 gaps closed).**

*QR code generation*
- `src/lib/services/qrcode.ts` renders real, spec-compliant QR symbols via the `qrcode` package
- Product labels now print a scannable QR alongside the existing human-readable barcode text
- Verified by round-trip, not just by eye: encoded `6001240912345`, decoded the resulting PNG
  back with `jsQR`, got the identical string. This is what made QR safe to ship without scanner
  hardware — unlike Code 128, which is still deliberately **not** rendered (see below)

*Camera scanning (RFQ: "browser-based camera scanning and/or USB scanner support")*
- New reusable `src/components/scanner/camera-scanner.tsx` — requests the camera, decodes frames
  with `jsqr`, hands the decoded string to the caller. Handles permission-denied, no-camera, and
  generic-failure states, always stops the stream on scan/cancel/unmount, and guards against
  duplicate scan events. `jsqr` is dynamically imported so it only loads when the overlay opens
- Wired into five existing pages, always as an *additional input method* feeding the existing
  workflow — never a parallel one: Barcode/QR scan (lookup), Goods receiving, Transfers,
  Sales & dispatch (all scan-to-select-product), and Product catalogue (scan to fill Barcode)
- A scan only ever identifies an item. It posts nothing, authorises nothing, and bypasses no
  permission, validation or stock check — every mutation still goes through the existing Server
  Actions and the WAC engine untouched

*Responsive (RFQ: full mobile browser functionality, 375px minimum viewport)*
- Dashboard sidebar becomes an off-canvas drawer below 992px (CSS-only, no client JS), with a
  dimmed backdrop, a sticky ☰ header, an in-drawer ✕, tap-backdrop-to-close, auto-close on
  navigation, and background scroll lock
- Static push-style sidebar from 992px up — chosen as the narrowest width where the sidebar and
  the three dashboard stat tiles both fit without clipping (measured, not guessed)
- Fixed two latent bugs in the process, both requiring an open-drawer-then-widen sequence to
  surface: a stale backdrop that dimmed the entire desktop layout (equal-specificity collision
  between the min-width variant and the peer-checked variant — resolved by stacking the width bound onto
  the checked variant), and a scroll lock that outlived the drawer and left the page unscrollable
- Verified at 375 / 768 / 960 / 991 / 992 / 1280: no page-level horizontal overflow, no card
  clipping, desktop visually unchanged

*Still not built (unchanged, and deliberate)*
- A rendered Code 128 linear barcode symbol. Its checksum/subset rules are easy to get subtly
  wrong and there was no scanner to verify a hand-rolled encoder against — a wrong symbol would
  look legitimate and silently fail to scan. The human-readable code USB scanners already read
  remains the honest option

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
