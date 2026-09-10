import {
  customerRepository,
  productRepository,
  roleRepository,
  salesOrderRepository,
  stockLedgerRepository,
  userRepository,
  warehouseRepository,
} from '@/lib/data';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { SalesOrderForm } from '@/app/dashboard/sales/sales-order-form';
import { RequisitionActionsCell } from '@/app/dashboard/sales/requisition-actions-cell';
import type { SalesOrderStatus } from '@/lib/domain/inventory';

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ barcode?: string }>;
}) {
  const { barcode } = await searchParams;
  const [customers, warehouses, products, allOrders, users, ledger, session] = await Promise.all([
    customerRepository.list(),
    warehouseRepository.list(),
    productRepository.list(),
    salesOrderRepository.list(),
    userRepository.list(),
    stockLedgerRepository.listAll(),
    getSession(),
  ]);

  const role = session ? await roleRepository.getById(session.roleId) : null;
  const isEngineer = role?.name === 'engineer_requester';
  const isAdmin = role?.name === 'admin';
  // View-only oversight, added per the 8 September client review - see
  // permissions.ts's ROLE_PERMISSIONS comment for why this stops at
  // visibility (`view_requisitions`) rather than approval authority. A Team
  // Leader is area-scoped (below); a Supervisor is not - they simply fall
  // through to the full list, same as Admin/Stores, but with no action
  // buttons (canProcess is false for them too).
  const isTeamLeader = role?.name === 'mechanical_team_leader' || role?.name === 'electrical_team_leader';
  // Admin does not requisition stock - see permissions.ts's ROLE_EXCLUSIONS.
  // The server action already refuses this regardless of what's rendered
  // here, but a form Admin can fill in and only then be told no is a dead
  // control, not a real one - so it's replaced with an explanation instead
  // of just vanishing.
  const canCreate = session ? await hasPermission(session, 'create_requisitions') : false;
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  const userById = new Map(users.map((u) => [u.id, u]));
  // Engineer / Requester sees requisitions they raised themselves, PLUS any
  // peer requisition sourced from their own station (see Warehouse's doc
  // comment in src/lib/domain/inventory.ts) - they need to see those to
  // Approve/release them. A Team Leader sees every requisition raised by
  // someone in their own `area` (Mechanical/Electrical) - "team oversight",
  // not the whole business, per the 8 September review; §22/§23. Every
  // other role still sees the full list, same as before this role model
  // existed.
  const myStationId = session ? warehouses.find((w) => w.ownerUserId === session.id)?.id : undefined;
  const orders =
    isEngineer && session
      ? allOrders.filter((o) => o.createdBy === session.id || o.warehouseId === myStationId)
      : isTeamLeader && session?.area
        ? allOrders.filter((o) => userById.get(o.createdBy)?.area === session.area)
        : allOrders;
  // Stores/Admin can process every requisition, unchanged. An Engineer
  // additionally gets two narrow, ownership-based rights the server checks
  // independently in sales/actions.ts: approving a peer pickup sourced from
  // their own station, and accepting/cancelling their own request. A Team
  // Leader gets neither - `manage_sales_orders` is false for them, so
  // RequisitionActionsCell renders no action buttons on any row they see.
  const canProcess = session ? await hasPermission(session, 'manage_sales_orders') : false;

  const customerById = new Map(customers.map((c) => [c.id, c]));
  const productById = new Map(products.map((p) => [p.id, p]));
  // Requisition sources: every store, plus every OTHER Engineer's station -
  // seeing an unused item sitting on a peer's shelf and requesting it
  // straight from there (instead of a fresh store pickup) is the point of
  // stations being visible at all. Never your own - see createSalesOrderAction.
  const requestableWarehouses = warehouses.filter((w) => w.id !== myStationId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Requisitions</h1>
        <p className="text-[0.86rem] text-text-muted">
          Internal stock requests from a department or workshop - draft → approve (reserves stock) → issue
          (posts the outbound movement, releases the reservation). Not customer sales - see
          docs/ARCHITECTURE.md for why this module was repurposed from Sales &amp; Dispatch.
        </p>
      </div>

      {canCreate ? (
        <SalesOrderForm
          customers={customers}
          warehouses={requestableWarehouses}
          products={products}
          ledger={ledger}
          initialBarcode={barcode}
        />
      ) : (
        isAdmin && (
          <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
            <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">New requisition</h2>
            <p className="text-[0.83rem] text-text-muted">
              Admin does not requisition stock from Stores - that&apos;s Engineer/Requester&apos;s
              process. To replenish stock, raise a{' '}
              <a href="/dashboard/purchase-orders" className="font-semibold text-accent-strong hover:underline">
                Purchase Order
              </a>{' '}
              against a supplier instead. You can still track every requisition below.
            </p>
          </div>
        )
      )}

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">
            {isEngineer ? 'Your requisitions' : 'Requisitions'}
          </h2>
        </div>
        {orders.length === 0 ? (
          <p className="px-5 py-6 text-[0.85rem] text-text-faint">
            {isEngineer ? "You haven't raised any requisitions yet." : 'No requisitions yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] border-collapse text-[0.86rem]">
              <thead>
                <tr className="text-left text-text-faint">
                  <th className="px-5 py-2.5 font-medium">Requisition</th>
                  <th className="px-5 py-2.5 font-medium">Requested by</th>
                  <th className="px-5 py-2.5 font-medium">Area</th>
                  <th className="px-5 py-2.5 font-medium">Department</th>
                  <th className="px-5 py-2.5 font-medium">Product</th>
                  <th className="px-5 py-2.5 font-medium">Store</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Qty</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Value</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const product = productById.get(o.productId);
                  const requester = userById.get(o.createdBy);
                  const sourceWarehouse = warehouseById.get(o.warehouseId);
                  const isOwnRequest = session?.id === o.createdBy;
                  const isSourceStationOwner = session?.id != null && sourceWarehouse?.ownerUserId === session.id;
                  const canApprove = canProcess || isSourceStationOwner;
                  const canAccept = canProcess || isOwnRequest;
                  const canCancel = canProcess || (isOwnRequest && o.status === 'draft');
                  return (
                    <tr key={o.id} className="border-t border-accent/[0.08]">
                      <td className="px-5 py-3 font-mono-brand text-[0.78rem] text-text">{o.orderNumber}</td>
                      <td className="px-5 py-3 text-text-muted">{requester?.fullName ?? 'Unknown'}</td>
                      <td className="px-5 py-3 text-text-muted">{requester?.area ?? '—'}</td>
                      <td className="px-5 py-3 text-text-muted">{customerById.get(o.customerId)?.name}</td>
                      <td className="px-5 py-3 text-text-muted">
                        {product?.sku} <span className="text-text-faint">- {product?.name}</span>
                      </td>
                      <td className="px-5 py-3 text-text-muted">
                        {sourceWarehouse?.type === 'engineer_station' ? sourceWarehouse.name : sourceWarehouse?.code}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-text">
                        {o.quantityOrdered.toLocaleString()} {product?.unitOfMeasure}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-text">
                        R{' '}
                        {(o.quantityOrdered * o.unitPrice).toLocaleString('en-ZA', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-5 py-3">
                        <StatusPill status={o.status} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        {(canApprove || canAccept || canCancel) && (
                          <RequisitionActionsCell
                            orderId={o.id}
                            status={o.status}
                            canApprove={canApprove}
                            canAccept={canAccept}
                            acceptLabel={!canProcess && isOwnRequest ? 'Accept' : 'Issue'}
                            canCancel={canCancel}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: SalesOrderStatus }) {
  const styles: Record<SalesOrderStatus, string> = {
    draft: 'bg-neutral-soft text-text-muted',
    confirmed: 'bg-accent/15 text-accent-strong',
    dispatched: 'bg-neutral-soft text-text-muted',
    cancelled: 'bg-danger/15 text-danger-text',
  };
  const labels: Record<SalesOrderStatus, string> = {
    draft: 'Draft',
    confirmed: 'Approved',
    dispatched: 'Issued',
    cancelled: 'Cancelled',
  };
  return <span className={`rounded-full px-2 py-0.5 text-[0.72rem] font-semibold ${styles[status]}`}>{labels[status]}</span>;
}
