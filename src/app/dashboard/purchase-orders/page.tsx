import {
  productRepository,
  purchaseOrderRepository,
  supplierRepository,
  warehouseRepository,
} from '@/lib/data';
import { PurchaseOrderForm } from '@/app/dashboard/purchase-orders/po-form';
import { ReceiveLine } from '@/app/dashboard/purchase-orders/receive-line';
import { issuePurchaseOrderAction } from '@/app/dashboard/purchase-orders/actions';
import type { PoStatus } from '@/lib/domain/inventory';

export default async function PurchaseOrdersPage() {
  const [suppliers, warehouses, products, orders] = await Promise.all([
    supplierRepository.list(),
    warehouseRepository.list(),
    productRepository.list(),
    purchaseOrderRepository.list(),
  ]);

  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  const productById = new Map(products.map((p) => [p.id, p]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Purchase orders</h1>
        <p className="text-[0.86rem] text-text-muted">
          Draft → issue → receive (one or more times — partial receipts are tracked against the order).
          For ad-hoc receipts with no PO, use{' '}
          <a href="/dashboard/receiving" className="text-accent hover:underline">
            Goods receiving
          </a>{' '}
          instead.
        </p>
      </div>

      <PurchaseOrderForm suppliers={suppliers} warehouses={warehouses} products={products} />

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">Orders</h2>
        </div>
        {orders.length === 0 ? (
          <p className="px-5 py-6 text-[0.85rem] text-text-faint">No purchase orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-[0.86rem]">
              <thead>
                <tr className="text-left text-text-faint">
                  <th className="px-5 py-2.5 font-medium">PO</th>
                  <th className="px-5 py-2.5 font-medium">Supplier</th>
                  <th className="px-5 py-2.5 font-medium">Product</th>
                  <th className="px-5 py-2.5 font-medium">Warehouse</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Ordered</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Received</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((po) => {
                  const product = productById.get(po.line.productId);
                  const remaining = po.line.quantityOrdered - po.line.quantityReceived;
                  return (
                    <tr key={po.id} className="border-t border-accent/[0.08]">
                      <td className="px-5 py-3 font-mono-brand text-[0.78rem] text-text">{po.poNumber}</td>
                      <td className="px-5 py-3 text-text-muted">{supplierById.get(po.supplierId)?.name}</td>
                      <td className="px-5 py-3 text-text-muted">
                        {product?.sku} <span className="text-text-faint">— {product?.name}</span>
                      </td>
                      <td className="px-5 py-3 text-text-muted">{warehouseById.get(po.warehouseId)?.code}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-text">
                        {po.line.quantityOrdered.toLocaleString()} {product?.unitOfMeasure}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-text-muted">
                        {po.line.quantityReceived.toLocaleString()} {product?.unitOfMeasure}
                      </td>
                      <td className="px-5 py-3">
                        <StatusPill status={po.status} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        {po.status === 'draft' && (
                          <form action={issuePurchaseOrderAction.bind(null, po.id)}>
                            <button type="submit" className="text-[0.8rem] font-semibold text-accent hover:text-accent-hover">
                              Issue
                            </button>
                          </form>
                        )}
                        {(po.status === 'issued' || po.status === 'partially_received') && (
                          <ReceiveLine poId={po.id} remaining={remaining} unit={product?.unitOfMeasure ?? 'ea'} />
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

function StatusPill({ status }: { status: PoStatus }) {
  const styles: Record<PoStatus, string> = {
    draft: 'bg-white/5 text-text-muted',
    issued: 'bg-accent/15 text-accent',
    partially_received: 'bg-accent/15 text-accent',
    received: 'bg-white/5 text-text-muted',
    cancelled: 'bg-danger/15 text-[#f3a99a]',
  };
  const labels: Record<PoStatus, string> = {
    draft: 'Draft',
    issued: 'Issued',
    partially_received: 'Partially received',
    received: 'Received',
    cancelled: 'Cancelled',
  };
  return <span className={`rounded-full px-2 py-0.5 text-[0.72rem] font-semibold ${styles[status]}`}>{labels[status]}</span>;
}
