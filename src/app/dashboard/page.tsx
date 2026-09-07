import {
  customerRepository,
  productRepository,
  roleRepository,
  salesOrderRepository,
  stockLedgerRepository,
  supplierRepository,
  warehouseRepository,
} from '@/lib/data';
import { getSession } from '@/lib/auth';
import { canSeeCosts } from '@/lib/costs';
import { hasPermission } from '@/lib/permissions';
import { HIDDEN_COST } from '@/lib/ui/cost-display';
import { stockValue } from '@/lib/services/inventory-engine';
import { ReceiveForm } from '@/app/dashboard/receiving/receive-form';
import { EngineerScanCard } from '@/app/dashboard/engineer-scan-card';
import { StockByLocationCard, type StockView } from '@/app/dashboard/stock-by-location-card';
import type { StockLedgerView } from '@/lib/domain/inventory';

export default async function DashboardOverviewPage() {
  const [products, warehouses, ledgerEntries, customers, suppliers, salesOrders, session] = await Promise.all([
    productRepository.list(),
    warehouseRepository.list(),
    stockLedgerRepository.listAll(),
    customerRepository.list(),
    supplierRepository.list(),
    salesOrderRepository.list(),
    getSession(),
  ]);
  const showCosts = await canSeeCosts(session);
  // Same permission the full Requisitions form requires - Stores Manager,
  // Stores Clerk and Engineer / Requester all hold it, Admin has it via
  // '*'. Gates the quick-requisition icon on the table below; the action
  // itself re-checks this independently either way.
  const canRequest = session ? await hasPermission(session, 'create_requisitions') : false;
  // Same permission the Product catalogue's price field requires - Admin
  // only. Everyone else gets the quick requisition's Unit value AND the
  // stock-movement form's Unit cost as a read-only display of the catalogue
  // price, not an editable field. Seeing the figure is a separate rule
  // (`showCosts` above) - this one is only about changing it.
  const canEditPrice = session ? await hasPermission(session, 'manage_pricing') : false;
  // Same permission /dashboard/receiving gates its whole route on, and that
  // the receive action re-checks for itself - receiving is a Stores function
  // (Admin and both Stores roles), never an Engineer's.
  const canReceive = session ? await hasPermission(session, 'manage_receiving') : false;

  const productById = new Map(products.map((p) => [p.id, p]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

  const ledgerView: StockLedgerView[] = ledgerEntries
    .map((entry) => {
      const product = productById.get(entry.productId);
      const warehouse = warehouseById.get(entry.warehouseId);
      if (!product || !warehouse) return null;
      return {
        ...entry,
        product,
        warehouse,
        stockValue: stockValue(entry),
        isBelowReorderPoint:
          product.reorderPoint != null && entry.quantityOnHand < product.reorderPoint,
      };
    })
    .filter((v): v is StockLedgerView => v !== null)
    .sort((a, b) => a.product.name.localeCompare(b.product.name));

  const totalStockValue = ledgerView.reduce((sum, row) => sum + row.stockValue, 0);
  const lowStockCount = ledgerView.filter((row) => row.isBelowReorderPoint).length;

  // Every location holding this product, by product - lets the Quick
  // requisition modal show "also on hand at" across every store AND every
  // Engineer's station, not just the one row it was opened from. A
  // requester deciding where to source from needs that full picture
  // without leaving the modal to go check the table underneath it.
  const locationsByProduct = new Map<
    string,
    { warehouseId: string; label: string; qty: number }[]
  >();
  for (const row of ledgerView) {
    if (row.quantityOnHand <= 0) continue;
    const label = row.warehouse.type === 'engineer_station' ? row.warehouse.name : row.warehouse.code;
    const list = locationsByProduct.get(row.productId) ?? [];
    list.push({ warehouseId: row.warehouseId, label, qty: row.quantityOnHand });
    locationsByProduct.set(row.productId, list);
  }
  for (const list of locationsByProduct.values()) {
    list.sort((a, b) => b.qty - a.qty);
  }

  // How many pending (draft, not-yet-approved) requisitions sit against each
  // product/store row - decides whether that row's "Reserve" button renders
  // at all (see stock-by-location-card.tsx / reserve-button.tsx). Store rows
  // only: a station-sourced requisition is a peer pickup the OWNING Engineer
  // approves themselves on /dashboard/sales, not something Stores reserves.
  const pendingByRow = new Map<string, number>();
  const warehouseTypeById = new Map(warehouses.map((w) => [w.id, w.type]));
  for (const order of salesOrders) {
    if (order.status !== 'draft') continue;
    if (warehouseTypeById.get(order.warehouseId) !== 'store') continue;
    const key = `${order.productId}::${order.warehouseId}`;
    pendingByRow.set(key, (pendingByRow.get(key) ?? 0) + 1);
  }

  /*
    Which stock views this role may see, built HERE on the server so an
    unentitled view never reaches the browser at all - the toggle can only
    ever switch between what it was handed, so there is no client flag to
    flip to reach a blocked one.

    Role-name check rather than a permission: "Admin and Stores" is the rule
    as stated, and no existing Permission means "may see stock everywhere"
    - reusing an operational one (`manage_receiving`, say) to stand in for a
    view right is exactly the can-vs-should conflation the notification
    scoping already avoids. Same pattern as src/lib/notifications.ts.
  */
  const role = session ? await roleRepository.getById(session.roleId) : null;
  const isAdminOrStores =
    role?.name === 'admin' || role?.name === 'stores_manager' || role?.name === 'stores_clerk';
  // Stores profiles only - Admin keeps the standard left-aligned submit on
  // the receive form (see ReceiveForm's `centerSubmit`).
  const isStoresRole = role?.name === 'stores_manager' || role?.name === 'stores_clerk';
  // Stores profiles only, deliberately narrower than `manage_sales_orders`
  // (which Admin also holds via '*') - the "Reserve" shortcut on the table
  // below is a Stores-floor action, same restriction as the receive form's
  // centred submit above. Admin still approves requisitions the normal way,
  // on /dashboard/sales - confirmSalesOrderAction itself still only checks
  // the permission, not the role, so this is a UI-visibility choice, not a
  // new authorization rule.
  const canReserve = isStoresRole;
  // Only an Engineer / Requester has a personal station; Admin and Stores
  // have none, which is what splits the two shapes of Station/Stores view
  // below.
  const myStationId = session ? warehouses.find((w) => w.ownerUserId === session.id)?.id ?? null : null;

  /*
    Station rows cover every Engineer's station, for everyone who gets this
    view - the station picker beside the toggle is what narrows it down.

    That widening is not new exposure for an Engineer: peer stations are
    already in their Stores rows below (and in the Requisitions "Store"
    picker), because seeing an unused item on a peer's shelf is the whole
    point of peer pickup. What changes is only that they can now look at one
    directly instead of reading it out of the Stores list.
  */
  const stationRows = ledgerView.filter((row) => row.warehouse.type === 'engineer_station');

  // The picker's options, in the order they're offered. An Engineer opens on
  // their OWN station (what this view showed before the picker existed);
  // Admin and Stores have no station of their own, so they open on all of
  // them, which is the oversight view they had before.
  const stationWarehouses = warehouses.filter((w) => w.type === 'engineer_station');
  const stationOptions = [
    ...(myStationId
      ? stationWarehouses
          .filter((w) => w.id === myStationId)
          .map((w) => ({ id: w.id, label: `${w.name} (yours)` }))
      : []),
    ...stationWarehouses
      .filter((w) => w.id !== myStationId)
      .map((w) => ({ id: w.id, label: w.name })),
  ];
  const defaultStationId = myStationId ?? 'all';

  // The product filter's options: the full catalogue, not just what happens
  // to be in stock in the current view - "no rows for that product here" is
  // itself an answer someone may be looking for, and a list that changes
  // shape as you switch views is harder to use than one that doesn't.
  const productOptions = products
    .map((product) => ({ id: product.id, label: `${product.sku} - ${product.name}` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const storesRows = isAdminOrStores
    ? // The physical store(s) - what is actually in the store, as opposed to
      // what is out on stations.
      ledgerView.filter((row) => row.warehouse.type === 'store')
    : // What this Engineer may actually requisition from: every store PLUS
      // every OTHER Engineer's station, never their own - the same set
      // sales/page.tsx builds for the Requisitions "Store" picker, so peer
      // pickup stays visible here too.
      ledgerView.filter((row) => row.warehouse.id !== myStationId);

  /*
    Two views, for every role: Station and Stores. An "everything, everywhere"
    view was dropped - between the two below it added no location the viewer
    couldn't already see, so it was a third button that only made the choice
    harder. What still differs by role is what each view CONTAINS (see the
    filters above), not how many buttons there are.
  */
  const visibleViews: StockView[] = [
    {
      id: 'station' as const,
      label: 'Station',
      description: isAdminOrStores
        ? "Stock currently sitting on Engineers' own stations - issued from the store, not yet used."
        : 'Stock currently at your own station - accepted from the store, still yours to use.',
      rows: stationRows,
    },
    {
      id: 'stores' as const,
      label: 'Stores',
      description: isAdminOrStores
        ? 'Stock held in the store itself, excluding anything out on an Engineer\'s station.'
        : 'Stock you can requisition from - the store, plus any other Engineer\'s station holding it.',
      rows: storesRows,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="SKUs tracked" value={products.length.toLocaleString()} />
        <StatTile
          label="Stock on hand (value)"
          value={
            showCosts
              ? `R ${totalStockValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : HIDDEN_COST
          }
        />
        <StatTile
          label="Below reorder point"
          value={lowStockCount.toString()}
          tone={lowStockCount > 0 ? 'warning' : 'default'}
        />
      </section>

      {/* The same GRN quick-receive form /dashboard/receiving hosts, surfaced
          here above the scan card so a delivery can be booked in without
          leaving the Overview. One component, one action, one permission -
          not a second implementation. Real physical stores only: goods from
          a supplier land in a store, never straight onto an Engineer's
          personal station. */}
      {canReceive && (
        <ReceiveForm
          suppliers={suppliers}
          warehouses={warehouses.filter((w) => w.type === 'store')}
          products={products}
          canEditPrice={canEditPrice}
          showCosts={showCosts}
          centerSubmit={isStoresRole}
        />
      )}

      {/* Stores now has the GRN card above for receiving, and Issue/Transfer/
          Adjustment/Write-off happen on their own dedicated pages - Admin
          has that plus every dedicated page the old generic movement form
          used to stand in for, so it stopped earning its place on either of
          their Overviews. Engineer-only now, and no longer that generic
          form: every movement type it offered required a Stores permission
          Engineer never holds, so every submission from it was already
          being silently rejected. This is the two things an Engineer can
          actually do - see engineer-scan-card.tsx. */}
      {myStationId && (
        <EngineerScanCard
          myStationId={myStationId}
          myStationLabel={warehouses.find((w) => w.id === myStationId)?.name ?? 'your station'}
        />
      )}

      <StockByLocationCard
        views={visibleViews}
        // Stores Manager/Clerk open on their own stock (Stores); Station
        // there is Engineers' oversight, not their own. Admin now opens on
        // Stores too - the store itself is what Admin oversees day to day,
        // Station being Engineers' own oversight view second. Engineer keeps
        // the Station default - their own station is their own stock.
        defaultViewId={role?.name === 'admin' || isStoresRole ? 'stores' : 'station'}
        stationOptions={stationOptions}
        defaultStationId={defaultStationId}
        productOptions={productOptions}
        canRequest={canRequest}
        showCosts={showCosts}
        canEditPrice={canEditPrice}
        sessionUserId={session?.id ?? null}
        customers={customers}
        locationsByProduct={Object.fromEntries(locationsByProduct)}
        canReserve={canReserve}
        pendingByRow={Object.fromEntries(pendingByRow)}
      />
    </div>
  );
}

function StatTile({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warning' }) {
  return (
    <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
      <div className="text-[0.78rem] font-semibold text-text-muted">{label}</div>
      <div className={`mt-1.5 font-display text-[1.6rem] font-medium tabular-nums ${tone === 'warning' && value !== '0' ? 'text-danger' : 'text-text'}`}>
        {value}
      </div>
    </div>
  );
}
