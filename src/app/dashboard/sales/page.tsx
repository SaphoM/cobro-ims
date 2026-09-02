import { customerRepository, productRepository, salesOrderRepository, warehouseRepository } from '@/lib/data';
import { SalesOrderForm } from '@/app/dashboard/sales/sales-order-form';
import { RequisitionActionsCell } from '@/app/dashboard/sales/requisition-actions-cell';
import type { SalesOrderStatus } from '@/lib/domain/inventory';

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ barcode?: string }>;
}) {
  const { barcode } = await searchParams;
  const [customers, warehouses, products, orders] = await Promise.all([
    customerRepository.list(),
    warehouseRepository.list(),
    productRepository.list(),
    salesOrderRepository.list(),
  ]);

  const customerById = new Map(customers.map((c) => [c.id, c]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  const productById = new Map(products.map((p) => [p.id, p]));

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

      <SalesOrderForm customers={customers} warehouses={warehouses} products={products} initialBarcode={barcode} />

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">Requisitions</h2>
        </div>
        {orders.length === 0 ? (
          <p className="px-5 py-6 text-[0.85rem] text-text-faint">No requisitions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-[0.86rem]">
              <thead>
                <tr className="text-left text-text-faint">
                  <th className="px-5 py-2.5 font-medium">Requisition</th>
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
                  return (
                    <tr key={o.id} className="border-t border-accent/[0.08]">
                      <td className="px-5 py-3 font-mono-brand text-[0.78rem] text-text">{o.orderNumber}</td>
                      <td className="px-5 py-3 text-text-muted">{customerById.get(o.customerId)?.name}</td>
                      <td className="px-5 py-3 text-text-muted">
                        {product?.sku} <span className="text-text-faint">- {product?.name}</span>
                      </td>
                      <td className="px-5 py-3 text-text-muted">{warehouseById.get(o.warehouseId)?.code}</td>
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
                        <RequisitionActionsCell orderId={o.id} status={o.status} />
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
