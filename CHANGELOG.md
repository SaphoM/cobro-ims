# Changelog

Version tracks development milestones, not production releases — nothing below has shipped to a real
Supabase project or a Cobro user yet (see `docs/ARCHITECTURE.md` for what's real vs. mocked). Semantic
versioning, pre-1.0 while auth, real data, and the remaining RFQ phases are outstanding.

## v0.46.0 — 2026-09-10

**Label layout: set stamp moves to the logo row, fixing the still-too-tall card.** In v0.45.0 the set
code shared the SKU line, which squeezed `CEM-42.5-50KG` into a three-line wrap and kept the card
tall. It now sits faint and right-aligned on the logo row (an existing line, so no added height), and
the SKU gets its full column width back and stays on one line. Card height drops back to the ~30mm
minimum it had before label sets (measured ~173px → ~118px). No text is truncated; behaviour, payload
and sequence are unchanged.

## v0.45.0 — 2026-09-10

**Label layout: the set code + sequence moves onto the SKU line.** The v0.44.0 set stamp was added as
its own row under the product name, which pushed each label card taller. It now sits right-aligned on
the SKU line (`CEM-42.5-50KG          5117DF · 1/9`), small and mono, so the label keeps the exact
height it had before label sets existed. No behaviour change - same code, same sequence, same payload.

## v0.44.0 — 2026-09-10

**Label sets: every "Generate sheet" run stamps its labels with a shared set code and a 1-based
sequence.** So a scan can tell which print run a label came off and which one of the run it is
("QR 3 of 100"). It is a grouping + ordinal only — not a per-unit inventory identity, and not a link
to a goods receipt (that larger tracking-mode model was scoped out).

- New `COBRO3` scan payload: `COBRO3|<barcode>|<supplierId>|<expectedQuantity>|<setId>|<seq>|<setSize>`
  (`scan-payload.ts`). `ScanPayload` gains `setId` / `seq` / `setSize`, all nullable
  - Fully backwards-compatible: `encodeScanPayload` only emits COBRO3 when a set is present, else
    falls back to COBRO2 / COBRO1 / bare barcode exactly as before; `parseScanPayload` reads all four,
    and a malformed `seq`/`setSize` degrades to "unnumbered" rather than "3 of NaN"
- `/dashboard/labels` — each render mints one 6-char set code; every copy now encodes a **distinct**
  QR carrying its own `seq` of `setSize`. Printed on each label under the name (`407F2D · 3/4`), and
  in the sheet summary bar (`set 407F2D, numbered 1–4`)
  - Stateless by design: the page holds no state, so a refresh is a new run with a new code and
    nothing server-side records a set's membership — the grouping + ordinal live entirely on the label
- Receiving scan — a COBRO3 label shows `Matched … (set 1997BB, label 3 of 4)`; legacy scans unchanged
- Verified end to end: lib round-trip across all payload versions, a real QR PNG rendered through the
  `qrcode` service then decoded back to the exact COBRO3 string, and live label-sheet + receiving-scan

## v0.43.0 — 2026-09-10

**QR / product-label creation is now its own business permission, with an Admin-only per-user override.**
Before this, the Product labels page was gated on `manage_receiving` and there was no per-user permission
concept anywhere in the app. One capability, resolved in one place — no `create_qr` / `generate_qr` /
`print_label` duplicates, and it grants no inventory authority.

- New `create_product_labels` permission (`permissions.ts`, `seed.ts`). Role defaults: Admin (via `*`),
  Supervisor, Stores Manager, Stores Clerk = YES; both Team Leaders and Engineer / Requester = NO
- New per-user override `User.labelPermission: 'inherited' | 'allowed' | 'revoked'`
  (`domain/inventory.ts`). Defaults `inherited`, so every existing user keeps their role default
  - `allowed` forces YES even where the role says no; `revoked` forces NO even where the role says yes
  - Deliberately **not** cleared on a role change (unlike `area`) — an explicit grant/revoke is a
    decision about the person and must survive them moving roles (spec §15)
- `hasPermission` itself resolves the override for `create_product_labels`, so every existing caller —
  the sidebar nav filter, the `/dashboard/labels` route guard, the `/dashboard/products` "Print labels"
  row links — gets the effective answer with no new logic. This is the single authoritative check
- `UserRepository.setLabelPermission` (interface + mock impl); `create()` seeds `inherited`;
  `updateRole()` leaves it untouched
- New Admin-only Server Action `updateUserLabelPermissionAction` (`users/actions.ts`), gated on
  `manage_users` — no other role, including the target user, can grant or revoke. Writes an audit
  entry (full before/after user rows → the audit log diffs `labelPermission` old→new, who, when)
- `/dashboard/users` — new "QR / Label creation" column: an Allowed/Denied pill computed server-side
  by the same `hasPermission`, plus the source ("Role default" / "Admin override: allowed|revoked").
  New inline `Role default / Allowed (override) / Revoked (override)` selector per row
- `/dashboard/labels` route guard switched from `manage_receiving` to `create_product_labels`. There
  is still no label-generation POST endpoint — "Generate sheet" is a GET back to the same page, so the
  route guard is the enforcement point; a revoked user hitting the URL directly gets AccessDenied and
  zero rendered QR codes
- Known gap: no per-generation audit for label/bulk/reprint — generation is a GET SSR render, not a
  discrete mutation, so auditing it would fire on every page load. The permission-change audit is done

- `next.config.ts` — dev `allowedDevOrigins` LAN IP updated to 192.168.0.109

## v0.42.0 — 2026-09-10

**Supervisor role - the one thing the "update organisational hierarchy" super-prompt actually needed.**
Everything else that prompt describes (Team Leader roles + area-scoping, Stores-initiated returns, reminder
foundation, Scan out / Scan to Use, no monthly reconciliation, no Engineer self-service returns, the
Procurement/Viewer/Warehouse role migration) was already delivered in v0.40.0/v0.41.0 or explicitly deferred.

- New `supervisor` role (`permissions.ts`, `seed.ts`, `demo-credentials.ts`) - operational oversight ABOVE the
  Team Leaders, reporting to Management. The role model is now two non-crossing chains:
  `admin -> supervisor -> {mechanical,electrical}_team_leader -> engineer_requester` and
  `admin -> stores_manager -> stores_clerk`
- Permission set is **identical to a Team Leader** (`view_requisitions` + `view_reports`) - the only difference
  is SCOPE: a Team Leader's view is `area`-filtered, a Supervisor's is not
  - `sales/page.tsx` - Supervisor sees every team's requisitions (Team Leader sees one team's), no action
    buttons
  - `reports/page.tsx` - new `SUPERVISOR_VISIBLE_SECTIONS`: Requisition summary + Low stock + Stock movement
    history (broader than a Team Leader's two, far narrower than Admin's fifteen)
  - `dashboard/page.tsx` - Station view shows every team's stations; Stores view read-only for context; no
    Reserve/Requisition/Receive/EngineerScanCard
  - `notifications.ts` - Supervisor and Team Leaders now get the lightweight "held stock past N days"
    oversight rollup (Supervisor: all stations; Team Leader: own area) - "monitor outstanding Engineer-held
    stock" from the 8 September review, reusing the existing `reminders.ts`
- **No approval authority granted** - the 8 September review did not confirm whether a Supervisor approves
  requisitions. The extension point (a `requisition.review/approve/reject`-shaped permission, or a scoped
  `manage_sales_orders`) is documented; adding it needs no change to the shape of `ROLE_PERMISSIONS`
- `supervisor` has `area: null` and no station - `isAreaScopedRole()` is false for it, so the user form shows
  no area/station selector for a Supervisor and `ensureStation` never runs. Multiple Supervisors supported
- New demo account `supervisor@cobroconcrete.co.za` / `CobroSupervisor2026` on the login picker
- Verified live: nav shows exactly the 7 permitted items and none of the 8 restricted; Supervisor sees both a
  Mechanical and an Electrical requisition (unscoped) with zero action buttons; Reports shows exactly 3
  sections; station picker lists all engineer stations; notification bell renders without crashing. Regression:
  Mechanical Team Leader still sees only its own team's requisition; Approve -> Issue on a requisition still
  works end to end

## v0.41.0 — 2026-09-09

**8 September client review — refinement, not rebuild. Sequenced per the client's explicit decisions.**

**A. Mechanical/Electrical Team Leader roles - view-only oversight, no invented approval authority.**
- New roles in `permissions.ts`/`seed.ts`: `mechanical_team_leader`, `electrical_team_leader`, each holding only
  `view_requisitions` + `view_reports` - no create/approve/issue/manage permission of any kind. The meeting
  confirmed the roles exist, not that they approve requisitions, so neither is invented here; the doc comment
  names the exact extension point (a new permission, or a scoped `manage_sales_orders` check) for when Cobro
  confirms that
- Scoped by the existing `area` field (Mechanical/Electrical - the same mechanism Engineer/Requester already
  uses), via a new shared `isAreaScopedRole()` (`areas.ts`) rather than hard-coding the two role names at every
  call site: `/dashboard/sales` (Requisitions list), `/dashboard/reports` (Requisition summary + Low stock
  only), and the Overview's Station view (own team's stations only; Stores view shown read-only for context)
- Two demo accounts added (`mechlead@`/`electlead@cobroconcrete.co.za`) for testability
- Verified live: zero Stores/Admin nav items, sees only their own team's requisitions (confirmed a Mechanical
  Team Leader sees REQ-1001 but not an Electrical REQ-1002), no action buttons render anywhere

**B. Engineer -> Stores returns confirmed Stores-initiated - and a real bug fixed to make it usable.**
- No permission change - Engineer never held `manage_transfers`, stays that way
- The existing `/dashboard/transfers` mechanism already supported this (any warehouse, Engineer stations
  included, can be picked as source/destination) but the From/To pickers and the transfer history table were
  showing a station's auto-generated `code` (e.g. `STA-A1B2C3D4`) instead of its name - unusable in practice for
  Stores to identify which Engineer they're pulling from. Fixed in `transfer-form.tsx`/`transfers/page.tsx`
  using the same name-for-station/code-for-store convention already used everywhere else
- Verified live, full loop: Stores initiated a real return of 3 bags from an Engineer's station to DBN-FAC,
  `in_transit` -> "Mark received" -> `Completed`, store on-hand landed exactly right

**C. Reminder foundation - lightweight, no new notification platform.**
- New `reminders.ts`: a single named constant `STOCK_HELD_REMINDER_DAYS` (14, explicitly flagged as a
  placeholder pending Cobro's real number) plus two pure functions reading the existing stock ledger - no new
  table, no persisted state
- Wired into the existing notification bell (`notifications.ts`), not a new UI surface: Engineer sees "held
  over N days - use it, or ask Stores to arrange a return"; Stores/Admin see an oversight rollup across every
  Engineer station
- Verified live: bell renders correctly for every role with no false positives and no crash

**D. Monthly stock reconciliation - deliberately not built.** No code written; nothing above blocks adding it
later against the same ledger the reminders module already reads.

**E. Regression - full lifecycle re-run with real numbers, not assumed.** Draft -> Approve -> Issue (DBN-FAC
2,250 -> 2,244, station 0 -> 6) -> Scan to Use (station 6 -> 5) -> Stores-initiated return (station 5 -> 2,
DBN-FAC 2,244 -> 2,247) - every step verified against the actual rendered numbers, not just that the actions
succeeded.

## v0.40.0 — 2026-09-07

**Engineer's Overview: two distinct scan actions replace the broken generic movement form.**
- The old "Record a stock movement" card let an Engineer pick any movement type via dropdowns
  (Product/Store/Type/Quantity), but every type it offered was gated behind a Stores permission
  (`manage_receiving`/`manage_sales_orders`/`manage_transfers`/`approve_adjustments`) an Engineer never
  holds - every submission from it was already being silently rejected. Deleted `record-movement-form.tsx`
- New `engineer-scan-card.tsx` + `engineer-checkout-actions.ts` - no dropdowns, two scan buttons wired to
  two already-real, already-ownership-checked write paths that just weren't previously reachable from one
  scan:
  - **"Scan out"** - resolves a scanned barcode to one of the Engineer's own approved (confirmed)
    requisitions, shows a confirmation (product, qty, from, to, requisition #), then calls the existing
    `dispatchSalesOrderAction` on confirm - the same action `/dashboard/sales`'s "Accept" button already
    used. This is docs/ARCHITECTURE.md's originally-documented "engineer comes and scans to accept stock
    items" - real for the first time, not a new mechanism
  - **"Scan to Use"** - calls the existing `postScanAction({direction: 'use'})` directly on a matching scan,
    posting immediately (no confirmation gate, matching that mode's own established precedent) - the same
    ownership-checked, negative-stock-guarded action `/dashboard/scan`'s "Use" mode already posted, just
    previously unreachable (that page had no route/nav entry)
  - Transaction type is never client-supplied - the server derives it from which action was called and
    re-checks session + ownership itself either way, same as every other mutation in this app
  - "Scan to Use" is styled as the solid/filled button, "Scan out" as the outlined one; both sized to 200px
- Verified live end-to-end with real data: created and approved a requisition, scanned it out (confirmation
  matched exactly, stock moved store→station carrying WAC), scanned to use one (correct decrement, correct
  "USED" message), and scanned an item not on the station (rejected with a clear reason, no ledger change)

## v0.39.0 — 2026-09-07

**Stock by location: "Reserve"/"Reserved" order swapped, "Requisition" trigger restyled.**
- `stock-by-location-card.tsx` - the Reserved cell now shows "Reserve" before the reserved count, not after
- `quick-requisition-button.tsx` - the Engineer's "Requisition" trigger is a labelled pill button matching
  "Reserve"'s style (border, `bg-surface-2`, `text-accent-strong`) instead of a small icon-only button; the
  now-unused clipboard icon was removed. Opens the exact same "Quick requisition" modal, unchanged - a
  visual/trigger change only
- The Requisition column's fixed icon-width (`w-10`) was dropped so the wider labelled button fits properly
- Verified live as Engineer: "Requisition" renders on every Stores-view row it always did, still opens the
  same modal

## v0.38.0 — 2026-09-07

**"Reserve" - scan-to-approve a pending requisition straight from Stock by location.**
- New `pending-reservation-actions.ts` + `reserve-button.tsx`: a Stores-only "Reserve" button appears on a
  store row exactly when a draft (not-yet-approved) requisition exists against it. Clicking it lists every
  pending requisition on that row - department, quantity, requester - one at a time, each with its own
  "Scan to reserve"
- The scan confirms Stores is looking at the right item, not which item (the row already fixed that): a
  decoded code is read back to its barcode and compared to the row's product. A match calls the existing
  `confirmSalesOrderAction` - the same action `/dashboard/sales`'s own Approve button uses, so there is one
  reservation code path, not two. A mismatch is rejected with an error naming expected vs. scanned barcode -
  nothing reserved
- "Scan to reserve" sized to match the app's standard scan-button treatment (`h-11`, same as "Scan with
  camera" elsewhere)
- Deliberately Stores-only (`stores_manager`/`stores_clerk`), narrower than the `manage_sales_orders`
  permission it's built on (which Admin also holds via `'*'`) - a UI-visibility choice, not a new
  authorization rule; Admin still approves the normal way via `/dashboard/sales`
- Verified live end-to-end: created a real requisition as Engineer, reserved it as Stores Manager via a
  scanned barcode, confirmed the Reserved figure updated (120 → 125) and the requisition shows "Approved" on
  `/dashboard/sales` - the real approval path, not a shortcut duplicate. Confirmed Admin sees no Reserve
  button even with a requisition pending

**Stores profiles can no longer originate a requisition.**
- `permissions.ts` - `create_requisitions` removed from both `stores_manager` and `stores_clerk` (matching
  the existing exclusion pattern already used for Admin). Stores is who a requisition is raised AGAINST, not
  another requester; Stores' own restocking need is a Purchase Order, the same path Admin uses
- Since every requisition-creation surface already gates on this one permission, this single change removes
  the Quick Requisition icon + modal from the Overview's Stock by location table AND the inline "New
  requisition" form on `/dashboard/sales` for Stores, consistently - not just the one UI surface. Stores
  still approves/issues/reserves requisitions raised by others (`manage_sales_orders`, `view_requisitions`
  untouched); Engineer/Requester is completely unaffected
- Verified live: Stores Manager shows 0 Quick-Requisition icons and no "New requisition" section; Engineer
  still has both

## v0.37.0 — 2026-09-07

**Bulk data import is now self-service - upload replaces "send it to X Spark".**
- New `src/lib/csv.ts` - small dependency-free CSV parser handling the one edge case the template's own
  README calls out (a quoted field containing a comma), RFC 4180's `""` escape, and a stray Excel BOM
- New `bulk-import-actions.ts` (two Server Actions) + `bulk-import-form.tsx` (two upload cards) on
  `/dashboard/products`, gated on `manage_catalogue` same as everything else in that section:
  - **Products** - validates required columns (sku/name/unit_of_measure), SKU uniqueness (both within the
    file and against the existing catalogue), barcode uniqueness, and that reorder_point/reorder_quantity
    parse as numbers
  - **Opening stock** - validates required columns (sku/warehouse_code/quantity_on_hand/unit_cost), that
    every sku already exists as a product, every warehouse_code matches a real store, quantities/costs
    parse as numbers, and no (sku, warehouse) pair repeats within the file
  - Both are all-or-nothing: every row is checked before anything is written: one bad row fails the whole
    file, with every problem listed at once ("Row 4: sku is required.", etc.) rather than a partial import
    someone has to notice and clean up by hand
  - Opening stock posts through `stockMovementRepository.record` (movementType `adjustment`,
    `referenceType: 'bulk_import'`) - the same one write path every other stock-affecting workflow already
    goes through, not a second importer-specific one
  - `description` is accepted in the products CSV (for the uploader's own records) but not persisted - no
    `Product` field or UI surfaces it anywhere in the app today, on-import or otherwise
- New `import-instructions-modal.tsx` - "Read the instructions" now opens a modal (same visual/interaction
  pattern as the Scan station's existing help modal) instead of linking out to the raw `README.txt`
- `docs/ARCHITECTURE.md` updated - the "upload/import screen not built" line in §4's table and the matching
  §6 next-step are both now marked done, since this was the last of that`BUSINESS DECISION REQUIRED` gap
- Verified live end-to-end: missing-required-column rejection, duplicate-SKU/missing-field rejection
  (product count unchanged - nothing written), a real product import (6→7 products), a bad-warehouse-code
  rejection, and a real opening-stock import - confirmed the exact quantity/cost/WAC landed on the
  Overview's Stock by location afterward

**"Scan" removed from the Product catalogue's Add-a-product form.**
- `new-product-form.tsx` - dropped the `<CameraScanner>` trigger and its now-unused `barcodeRef`; barcode
  stays a plain typed field, same as it always could be alongside the scan option

## v0.36.0 — 2026-09-07

**GRN receiving's field grid collapses until there's something to show.**
- `receive-form.tsx` - From Supplier / To Location / Product / Quantity received / Unit cost / Post receipt
  collapse to a single hint line ("Scan a barcode above to see supplier, location, quantity and cost.")
  until a product is actually matched, instead of rendering a full grid of empty placeholders and a
  disabled button before anything has been scanned. Expands back to the full grid the instant `matchBarcode`
  sets a product, and stays expanded for the rest of that receipt. Applies on both pages that mount this
  component - Goods receiving and the Overview - since it's one shared change, not two
- Verified live on both pages: collapsed on load, expands on the first matched scan

**Admin's Stock by location now defaults to Stores, not Station.**
- `dashboard/page.tsx` - Admin opens on the same **Stores** tab Stores Manager/Clerk already default to; the
  store itself is what Admin oversees day to day, Station (Engineers' own stock) being the secondary
  oversight view. Engineer/Requester is unaffected - their own station is their own stock, so Station stays
  their default
- Verified live, signed in as Admin specifically (not Stores Manager, which already defaulted here) - the
  Stores tab is highlighted and its "excluding anything out on an Engineer's station" description shows on
  load

## v0.35.0 — 2026-09-07

**GRN receiving's "Scan with camera" is now multi-scan.**
- `src/app/dashboard/receiving/receive-form.tsx` - the camera/QR-handoff overlay now stays open across
  scans (`continuous` on `<CameraScanner>`, same pattern the Overview's Scan dialog already uses) instead
  of closing after the first hit, so an operator works through a whole delivery without reopening the
  camera per item
- Auto-closes the instant the tally reaches a label's expected quantity (e.g. `3/3`) - verified live: stays
  open below target, closes exactly at it. A delivery with no expected quantity on the label never
  auto-closes; the operator closes it manually (`continuous` mode's own Done scanning / ✕ / Escape),
  unchanged from every other continuous scan station in the app
- A status panel (matched product, SKU, running tally, "Remove 1") now renders inside the camera overlay
  while it's open - it covers the form underneath, so that feedback has to live there or it's invisible for
  the whole scanning session
- The auto-close check runs synchronously inside the scan handler (not a `useEffect`), matching the fix
  already applied to `<CameraScanner>` itself in v0.32.0 - avoids the same `react-hooks/set-state-in-effect`
  class of issue

**Dev server reachable via a Cloudflare quick tunnel too, not just the LAN.**
- `next.config.ts`'s `allowedDevOrigins` gains `"*.trycloudflare.com"` alongside the LAN IP - a cloudflared
  quick tunnel (`cloudflared tunnel --url http://localhost:3020`) gets a new random subdomain every time it
  restarts, so a wildcard means this never needs updating for that case. The LAN IP entry, by contrast,
  genuinely did need updating this session when the Mac's Wi-Fi reconnected and DHCP handed out a new
  address (`192.168.8.40` → `192.168.0.190`) - the dev-origin check has no way to know that on its own
- The tunnel exists to get a genuine HTTPS origin in front of the dev server: `getUserMedia` (camera access)
  is blocked by the browser on any plain-HTTP origin that isn't `localhost`, which the LAN IP alone can
  never satisfy - confirmed live against a real phone hitting the LAN IP directly ("No camera is available
  on this device or browser")
- Verified via `curl` with a spoofed `Origin` header: a `*.trycloudflare.com` origin gets the dev assets
  (`200`), an unrelated origin still gets rejected (`403`) - the wildcard is scoped, not wide open

**"Record a stock movement" removed from Admin's Overview.**
- `src/app/dashboard/page.tsx` - Admin already has the GRN card above plus every dedicated page (Transfers,
  Adjustments, Write-offs) this generic scan-any-movement-type card used to stand in for, so it stopped
  earning its place there. Engineer/Requester still sees it - it remains their only way to record a
  movement on their own station, which none of those dedicated pages cover for them

## v0.34.0 — 2026-09-07

**Dev server now reachable over the LAN for real phone-scanner testing.**
- `next.config.ts` adds `allowedDevOrigins: ["192.168.8.40"]` - without it, Next's dev-origin protection
  403s every `_next/*` JS/HMR request that doesn't come from `localhost`. The page's HTML/CSS still loaded
  fine over the LAN IP even without this (so it looked normal), but React never hydrated, so every button
  on the page - notification bell included - was silently inert. Update the IP here if this machine's LAN
  address changes (`ipconfig getifaddr en0` on macOS)
- Confirmed live: the demo-account picker, sign-in, and notification bell all work correctly when opened
  via `http://192.168.8.40:3020` from a second browser tab
- **Separate, real browser limitation this doesn't (and can't) fix**: `getUserMedia` (camera access) is
  blocked by the browser on any plain-`http://` origin that isn't `localhost` - a secure-context
  requirement, not a bug in this app. A phone opening the LAN IP directly will still see "No camera is
  available on this device or browser" from `<CameraScanner>`'s own fallback UI. Testing the real camera
  scan end-to-end needs an HTTPS tunnel (`cloudflared tunnel --url http://localhost:3020`, installed this
  session) in front of the dev server instead

**Product labels: Supplier and Quantity expected captions became tooltips.**
- New `src/components/info-tooltip.tsx` - a small "i" icon (click/tap or hover/focus) instead of inline
  caption text, so a long explanation can't stretch a form field's label wider than the input beneath it
  and throw off the gap to the next field (exactly what happened with "Quantity expected (optional -
  encodes into the QR)" wrapping onto its own lines)
- `src/app/dashboard/labels/page.tsx` - Supplier and Quantity expected both use it now; every field in that
  row keeps a uniform 12px gap regardless of caption length

## v0.33.0 — 2026-09-07

**Phone-side scan handoff no longer requires the phone to sign in.**
- `resolveScanHandoffAction` (`src/lib/scan-handoff-actions.ts`) no longer calls `getSession()` - a
  deliberate reversal of v0.32.0's "phone auth is mandatory" rule, made after the trade-off was spelled out
  and explicitly confirmed: attribute the scan to the desktop user who generated the QR, not to a phone
  session that no longer exists. See the file's new **ATTRIBUTION** comment for the reasoning and what it
  gives up (the audit trail names who's accountable - the signed-in desktop operator - not who physically
  held the phone)
- `/scan-session/[token]` (`src/app/scan-session/[token]/page.tsx`) drops the "not signed in → please log
  in" branch entirely; every other gate (token not found, expired, already resolved) is unchanged. Security
  still rests on the token itself: unguessable, single-use, expires in 3 minutes, only ever shown on the
  initiating desktop's own screen
- `src/app/login/page.tsx`'s optional `?next=` support and `src/lib/safe-redirect.ts` are no longer used by
  this flow but left in place - generically useful, harmless to keep
- Verified live: a request carrying zero cookies (`fetch(url, { credentials: 'omit' })`) still gets the
  scanner UI, not a login prompt; `resolveScanHandoffAction` always attributes to `handoff.initiatingUserId`
  (the desktop's session), never to the phone

**Product labels: Supplier is now required; the 60-copy cap is gone.**
- `src/app/dashboard/labels/page.tsx` - the Supplier dropdown lost its "optional" wording and the "No
  supplier - plain barcode" bypass option; the browser now blocks "Generate sheet" until a supplier is
  chosen (every label leaving the building should say who it came from)
- `MAX_LABELS` (60) removed outright - no `max` attribute, no "(max 60)" copy, no clamping on `requestedQty`

**Receiving's "Scan with camera" button repositioned to match "Post receipt" exactly.**
- `src/app/dashboard/receiving/receive-form.tsx` - "Scan with camera" moved onto its own row under the
  barcode input (previously squeezed beside "Match") and now sits in the same `lg:col-start-3` column of
  the same `grid-cols-1 / sm:grid-cols-2 / lg:grid-cols-5` track "Post receipt" uses below it, rather than a
  guessed pixel width - the two buttons are pixel-identical in width and horizontal position at every
  breakpoint by construction, not by coincidence

## v0.32.0 — 2026-09-06

**"Scan with camera" now hands off to a phone on desktop, instead of trying to use a desktop's own camera.**
- `<CameraScanner>` decides once per open which experience to show, based on the device that clicked it -
  see `src/lib/device.ts` (`pointer: coarse` + `maxTouchPoints`, not a screen-width or User-Agent guess):
  - **Phone/tablet** - opens this browser's own camera directly, exactly as before. Zero behaviour change.
  - **Desktop/laptop** - shows "Scan QR with your phone": a real, freshly-generated QR the phone scans to
    open `/scan-session/[token]` there, with the desktop polling until the phone resolves it and handing
    the result to the SAME `onScan` callback the direct camera path already used
- **Zero changes at any of the 7 existing call sites** (scan-movement, new-product-form, sales-order-form,
  adjustment-form, transfer-form, scan-station, receive-form) - every one of them gets the desktop handoff
  automatically, because the branching lives inside `<CameraScanner>` itself, not in each caller
- New `ScanHandoffRepository` (in-memory, same mock-data pattern as every other repository - no second
  database) backs the handoff: a session is an opaque token plus who created it, when it expires (3
  minutes), its status (pending/resolved/expired), and - once resolved - the raw scanned string. **The QR
  itself carries nothing but that token in a URL** - no barcode, no credential, no inventory data
  (`ScanHandoffSession`'s doc comment in `repositories.ts` spells out why)
- **Single-use and short-lived by construction**: `resolve()` throws on an already-resolved or expired
  session; a lookup can never distinguish "never existed" from "expired" (same message, so a guessed token
  learns nothing); `getScanHandoffStatusAction` only returns a result to the same authenticated user who
  created the session
- **Phone auth is mandatory, not optional**: `/scan-session/[token]` gates on `getSession()` before
  anything else - not logged in shows a login link carrying `?next=` back to the same session (new
  `safeNextPath` helper validates it's a same-origin relative path first, closing the obvious open-redirect
  hole a raw `next` query param would otherwise be). A scan can never reach `resolveScanHandoffAction`
  anonymously. The actual inventory transaction the desktop goes on to do with the scanned value still
  goes through whatever permission check it always did - a scan only ever identifies something, never
  posts, on either device
- Continuous mode (scan-station's counting stations) works the same way on desktop as it always has on
  phone: after each resolved scan, a fresh handoff session opens automatically so the same phone keeps
  scanning the next item without the desktop clicking "Scan with camera" again
- Verified: repository logic directly (create/get/resolve, single-use rejection, unknown-token rejection);
  live in the browser - the desktop modal generates a real QR, decoded with the browser's own
  `BarcodeDetector` to confirm it encodes exactly `<origin>/scan-session/<token>` and nothing else; the
  phone route correctly gates on auth with a working `next` round-trip; a genuinely expired session (real
  wall-clock 3-minute TTL) surfaced the exact expiry copy on both phone and desktop, live-polled; "Generate
  new QR" produces a real new token; and a mobile-emulated visit to the SAME token opens the direct camera
  (not a nested handoff), confirming no infinite regress
- **Limitation**: this sandbox has no camera hardware and the Browser pane blocks camera access outright,
  so the literal "phone camera decodes a real barcode" sub-step couldn't be exercised end-to-end here.
  Every other link in the chain was verified live against the real running server; the decode step itself
  is pre-existing, unmodified `CameraScanner` code, not new
- Files added: `src/lib/device.ts`, `src/lib/safe-redirect.ts`, `src/lib/scan-handoff-actions.ts`,
  `src/app/scan-session/[token]/page.tsx`, `src/app/scan-session/[token]/scan-session-client.tsx`. Changed:
  `src/lib/data/repositories.ts`, `src/lib/data/mock/repositories.ts`, `src/lib/data/index.ts`,
  `src/components/scanner/camera-scanner.tsx`, `src/app/login/page.tsx`, `src/app/login/login-form.tsx`,
  `src/app/login/actions.ts`

## v0.31.1 — 2026-09-06

**Stores profiles default to the "Stores" tab on Stock by location.**
- Stores Manager and Stores Clerk now open the Stock by location toggle on **Stores** instead of Station -
  their own stock is what's in the store, not what's on Engineers' stations (that view is oversight for
  them, not their default). Admin and Engineer/Requester keep the existing Station default
- `StockByLocationCard` gained an explicit `defaultViewId` prop rather than inferring the opening tab from
  array order, decided by role in `dashboard/page.tsx` (reusing the existing `isStoresRole` flag)
- Verified live for all four roles: Admin -> Station, Engineer -> Station, Stores Manager -> Stores,
  Stores Clerk -> Stores
- Files changed: `src/app/dashboard/stock-by-location-card.tsx`, `src/app/dashboard/page.tsx`

## v0.31.0 — 2026-09-06

**"Record a stock movement" removed from Stores profiles - Admin (and Engineer) only now.**
- Stores Manager and Stores Clerk no longer see the generic scan-any-movement-type card on the Overview.
  Receiving is now the dedicated GRN card above it; Issue happens via Requisitions, Transfer via the
  Transfers page, Adjustment/Write-off via the Adjustments page - so nothing this card did for Stores is
  actually gone, it now has one dedicated home per movement type instead of one generic card doing all of
  them
- Admin keeps it (oversight/ad-hoc use), and so does Engineer/Requester (their own station's accept/use
  flow, unaffected by this change - the "Stores profiles" carve-out is specifically Stores Manager and
  Stores Clerk)
- Verified live: Admin and Engineer both still see "Record a stock movement"; Stores Manager and Stores
  Clerk don't - the Overview goes straight from Receive stock (GRN) to Stock by location for them
- Files changed: `src/app/dashboard/page.tsx`

## v0.30.0 — 2026-09-06

**"From Supplier" / "To Location", and Quantity received is a live scan tally against an expected count.**
- Field labels on the GRN card: Supplier is now "From Supplier", Store is now "To Location" (the summary
  line above the fields reads "From X … To Y" the same way). Terminology-only - the underlying Store/
  warehouse concept is unchanged
- Removed the "Scan a Cobro delivery label above to set the product and supplier" hint paragraph under
  Post receipt. The button's disabled-state tooltip (hover title) still explains why, just not as
  always-visible page text
- **QR labels can now also carry an expected quantity** - `scan-payload.ts` gains a COBRO2 format,
  `COBRO1|<barcode>|<supplierId>|` extended to `COBRO2|<barcode>|<supplierId>|<expectedQuantity>`.
  Versioned rather than replacing COBRO1, so every label already printed keeps scanning correctly forever.
  Product Labels gained an optional "Quantity expected" field alongside Supplier
- **Quantity received is now a live scan tally, not a typed number** - re-scanning the same barcode adds
  one more, exactly like the Overview's Scan dialog's counting step. Shown as `received/expected` (e.g.
  "2 / 100") when the label carried an expected quantity, updating in real time as each scan lands; just
  the received count when it didn't, since there's nothing to compare against. A "Remove 1" button is the
  only way to correct a miscount - verified live: three scans of the same COBRO2 label produced 1/100 →
  2/100 → 3/100, and Remove 1 took it back to 2/100
- Post receipt's readiness gate now also requires at least one unit counted (`receivedCount > 0`), on top
  of Product and Supplier already being known
- A genuinely different barcode scanned mid-receipt starts a fresh tally, expected quantity and supplier
  rather than mixing two deliveries into one count; a re-scan of the SAME item that happens to omit a
  supplier (label misread) doesn't clobber a supplier already established for that item
- Files changed: `src/lib/scan-payload.ts`, `src/app/dashboard/labels/page.tsx`,
  `src/app/dashboard/receiving/receive-form.tsx`

## v0.29.0 — 2026-09-06

**Receive stock (GRN) is now fully scan-driven - no dropdowns left.**
- Supplier and Product no longer have a manual picker at all: both come only from the scan (Product from
  the barcode, Supplier from a Cobro delivery label's payload - see v0.28.0's `scan-payload.ts`). Each
  shows a "Scan … to select/set …" placeholder until the scan supplies it
- **Post receipt is disabled until both are known**, with a title/hint explaining why - a real
  consequence, not a cosmetic one: a plain manufacturer barcode carries no supplier, so a receipt can no
  longer be posted from one on this form. The code is expected to carry the information; a barcode that
  doesn't is now a real "not yet known" instead of a fallback to pick around
- Store is unaffected (already display-only since v0.28.0's single-store fact)
- Fixed a real bug surfaced while making Product state-driven instead of DOM-ref-driven: the "Receive this
  product" arrival-from-scan effect needed the same guarded-ref, run-once pattern `sales-order-form.tsx`
  already uses, or React's set-state-in-effect lint (correctly) flagged the new state write
- Verified live: a fresh load shows zero `<select>` elements in the GRN form and Post receipt disabled; a
  Cobro label (Product + Supplier) enables it; a plain barcode matches the product but leaves Supplier
  unknown and Post receipt correctly stays disabled
- Files changed: `src/app/dashboard/receiving/receive-form.tsx`

## v0.28.0 — 2026-09-06

**QR labels can now carry the supplier, so receiving scans once instead of scanning and then picking.**
- New `src/lib/scan-payload.ts` defines the label payload and how to read it back:
  `COBRO1|<barcode>|<supplierId>`. A delimited string rather than JSON - it stays short (QR size grows
  with payload and these print small), survives a USB scanner typing it as keyboard input without quoting
  trouble, and is readable by eye when something goes wrong. `COBRO1` is a format version so a later
  format can add fields without a scanner having to guess
- **Backwards compatible by design**: every label printed before this, and every manufacturer barcode on a
  bag of cement, is a bare barcode with no prefix - those scan exactly as they did. Anything that isn't a
  recognised Cobro payload is treated as a plain barcode, and a malformed payload degrades to a failed
  lookup rather than a parser error
- Product labels gained an optional Supplier picker; choosing one encodes it into the QR, leaving it blank
  prints the same plain-barcode QR as before
- On the GRN form, a scan that carries a supplier now **states** it rather than re-asking: the matched
  line reads "Matched CEM-42.5-50KG … · Supplier Steel Supply Co. · Store DBN-FAC", and the Supplier field
  becomes bold read-only text ("from the label") with a hidden input. A plain barcode says nothing about
  who delivered it, so the picker stays a picker - a supplier is never guessed. A label naming a supplier
  this instance doesn't know is ignored rather than silently selecting something else
- Store is likewise display-only whenever there is exactly one store (there is, since the single-store
  consolidation) - a dropdown with one option was never a choice. It reverts to a picker on its own if a
  second store is ever added
- `lookupBarcodeAction` unwraps the payload too, so a supplier-bearing label scanned at the Overview's
  scan dialog still finds the same product
- Verified: codec round-trips, plain barcodes pass through untouched, scanner whitespace/newlines are
  stripped, malformed input degrades safely; and live in the browser - a label encoding Steel Supply Co.
  (deliberately not the dropdown's default) produced `supplierId=sup-steel-supply` as read-only text,
  while a plain barcode left the dropdown in place with no Supplier claim on the matched line
- Files added: `src/lib/scan-payload.ts`. Changed: `src/app/dashboard/labels/page.tsx`,
  `src/app/dashboard/receiving/receive-form.tsx`, `src/app/dashboard/scan/actions.ts`

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
