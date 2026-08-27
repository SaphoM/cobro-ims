import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { warehouses } from '@/store/seed';
import { useStore, type ActionResult } from '@/store/useStore';
import { inputClass, selectClass } from '@/ui/form-control-classes';
import { Feedback } from '@/ui/Feedback';
import { ScanRow, useScanRow } from '@/ui/ScanRow';
import type { SalesOrderStatus } from '@/store/types';

/**
 * PORTED from src/app/dashboard/sales/page.tsx + sales-order-form.tsx.
 * Route stays `/dashboard/sales` and the internal identifiers stay
 * SalesOrder/customerId — this was a terminology and workflow-labeling
 * change in the original, not a schema rename, and that decision is
 * preserved here rather than re-litigated.
 */
export function RequisitionsPage() {
  const [searchParams] = useSearchParams();
  const barcode = searchParams.get('barcode');

  const products = useStore((s) => s.products);
  const customers = useStore((s) => s.customers);
  const orders = useStore((s) => s.salesOrders);
  const createSalesOrder = useStore((s) => s.createSalesOrder);
  const confirmSalesOrder = useStore((s) => s.confirmSalesOrder);
  const dispatchSalesOrder = useStore((s) => s.dispatchSalesOrder);
  const cancelSalesOrder = useStore((s) => s.cancelSalesOrder);

  const [result, setResult] = useState<ActionResult | null>(null);
  const [rowResult, setRowResult] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const { message, matchBarcode, productSelectRef, quantityRef } = useScanRow(products, barcode);

  const customerById = new Map(customers.map((c) => [c.id, c]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  const productById = new Map(products.map((p) => [p.id, p]));
  const sorted = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setResult(
      createSalesOrder({
        customerId: String(form.get('customerId')),
        warehouseId: String(form.get('warehouseId')),
        productId: String(form.get('productId')),
        quantity: Number(form.get('quantity')),
        unitPrice: Number(form.get('unitPrice')),
      })
    );
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Requisitions</h1>
        <p className="text-[0.86rem] text-text-muted">
          Internal stock requests from a department or workshop — draft → approve (reserves stock) → issue
          (posts the outbound movement, releases the reservation). Not customer sales.
        </p>
      </div>

      <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
        <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">New requisition</h2>
        <p className="mb-4 text-[0.83rem] text-text-muted">
          Created as a draft — it reserves nothing until approved, and nothing leaves the ledger until issued.
        </p>

        <ScanRow onMatch={matchBarcode} message={message} />

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="flex flex-col gap-1.5 lg:col-span-2">
            <span className="text-[0.75rem] font-semibold text-text-muted">Requesting department</span>
            <select name="customerId" required className={selectClass}>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">Warehouse</span>
            <select name="warehouseId" required className={selectClass}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 lg:col-span-2">
            <span className="text-[0.75rem] font-semibold text-text-muted">Product</span>
            <select name="productId" required ref={productSelectRef} className={selectClass}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">Quantity</span>
            <input ref={quantityRef} type="number" name="quantity" min="0.001" step="0.001" required placeholder="0" className={inputClass} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">Unit value (R)</span>
            <input type="number" name="unitPrice" min="0" step="0.01" required placeholder="0.00" className={inputClass} />
          </label>

          <div className="flex items-end lg:col-span-6">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
            >
              {pending ? 'Creating…' : 'Create requisition'}
            </button>
          </div>
        </form>

        <Feedback result={result} />
      </div>

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">Requisitions</h2>
          <Feedback result={rowResult} />
        </div>
        {sorted.length === 0 ? (
          <p className="px-5 py-6 text-[0.85rem] text-text-faint">No requisitions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-[0.86rem]">
              <thead>
                <tr className="text-left text-text-faint">
                  <th className="px-5 py-2.5 font-medium">Requisition</th>
                  <th className="px-5 py-2.5 font-medium">Department</th>
                  <th className="px-5 py-2.5 font-medium">Product</th>
                  <th className="px-5 py-2.5 font-medium">Warehouse</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Qty</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Value</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((o) => {
                  const product = productById.get(o.productId);
                  return (
                    <tr key={o.id} className="border-t border-accent/[0.08]">
                      <td className="px-5 py-3 font-mono-brand text-[0.78rem] text-text">{o.orderNumber}</td>
                      <td className="px-5 py-3 text-text-muted">{customerById.get(o.customerId)?.name}</td>
                      <td className="px-5 py-3 text-text-muted">
                        {product?.sku} <span className="text-text-faint">— {product?.name}</span>
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
                        <div className="flex justify-end gap-3">
                          {o.status === 'draft' && (
                            <button
                              type="button"
                              onClick={() => setRowResult(confirmSalesOrder(o.id))}
                              className="text-[0.8rem] font-semibold text-accent hover:text-accent-hover"
                            >
                              Approve
                            </button>
                          )}
                          {o.status === 'confirmed' && (
                            <button
                              type="button"
                              onClick={() => setRowResult(dispatchSalesOrder(o.id))}
                              className="text-[0.8rem] font-semibold text-accent hover:text-accent-hover"
                            >
                              Issue
                            </button>
                          )}
                          {(o.status === 'draft' || o.status === 'confirmed') && (
                            <button
                              type="button"
                              onClick={() => setRowResult(cancelSalesOrder(o.id))}
                              className="text-[0.8rem] font-semibold text-text-faint hover:text-danger"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
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
    draft: 'bg-white/5 text-text-muted',
    confirmed: 'bg-accent/15 text-accent',
    dispatched: 'bg-white/5 text-text-muted',
    cancelled: 'bg-danger/15 text-[#f3a99a]',
  };
  const labels: Record<SalesOrderStatus, string> = {
    draft: 'Draft',
    confirmed: 'Approved',
    dispatched: 'Issued',
    cancelled: 'Cancelled',
  };
  return <span className={`rounded-full px-2 py-0.5 text-[0.72rem] font-semibold ${styles[status]}`}>{labels[status]}</span>;
}
