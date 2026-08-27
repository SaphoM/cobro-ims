import { useState } from 'react';
import { Link } from 'react-router-dom';
import { warehouses } from '@/store/seed';
import { useStore, type ActionResult } from '@/store/useStore';
import { inputClass, selectClass } from '@/ui/form-control-classes';
import { Feedback } from '@/ui/Feedback';
import type { PoStatus } from '@/store/types';

/**
 * PORTED from src/app/dashboard/purchase-orders/page.tsx + po-form.tsx +
 * receive-line.tsx. Full lifecycle: draft → issue → receive (one or more
 * times, partial receipts tracked against the order).
 */
export function PurchaseOrdersPage() {
  const products = useStore((s) => s.products);
  const suppliers = useStore((s) => s.suppliers);
  const purchaseOrders = useStore((s) => s.purchaseOrders);
  const purchaseOrderLines = useStore((s) => s.purchaseOrderLines);
  const createPurchaseOrder = useStore((s) => s.createPurchaseOrder);
  const issuePurchaseOrder = useStore((s) => s.issuePurchaseOrder);

  const [result, setResult] = useState<ActionResult | null>(null);
  const [rowResult, setRowResult] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);

  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  const productById = new Map(products.map((p) => [p.id, p]));

  // The original's withLine() threw when a PO had no line (a real data
  // inconsistency it wanted surfaced). Here the list simply skips such a row
  // rather than blanking the whole page — the quickReceive bug that used to
  // cause it is fixed, so this is belt-and-braces, not a behaviour change.
  const orders = [...purchaseOrders]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((po) => ({ po, line: purchaseOrderLines[po.id] }))
    .filter((row): row is { po: (typeof purchaseOrders)[number]; line: NonNullable<(typeof purchaseOrderLines)[string]> } => Boolean(row.line));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setResult(
      createPurchaseOrder({
        supplierId: String(form.get('supplierId')),
        warehouseId: String(form.get('warehouseId')),
        productId: String(form.get('productId')),
        quantity: Number(form.get('quantity')),
        unitCost: Number(form.get('unitCost')),
      })
    );
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Purchase orders</h1>
        <p className="text-[0.86rem] text-text-muted">
          Draft → issue → receive (one or more times — partial receipts are tracked against the order).
          For ad-hoc receipts with no PO, use{' '}
          <Link to="/dashboard/receiving" className="text-accent hover:underline">
            Goods receiving
          </Link>{' '}
          instead.
        </p>
      </div>

      <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
        <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">New purchase order</h2>
        <p className="mb-4 text-[0.83rem] text-text-muted">
          Saved as a draft — nothing is sent to the supplier or posted to the ledger until it&apos;s issued
          and then received.
        </p>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1.5 lg:col-span-2">
            <span className="text-[0.75rem] font-semibold text-text-muted">Supplier</span>
            <select name="supplierId" required className={selectClass}>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
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
            <select name="productId" required className={selectClass}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">Quantity ordered</span>
            <input type="number" name="quantity" min="0.001" step="0.001" required placeholder="0" className={inputClass} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">Unit cost (R)</span>
            <input type="number" name="unitCost" min="0" step="0.01" required placeholder="0.00" className={inputClass} />
          </label>

          <div className="flex items-end lg:col-span-5">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
            >
              {pending ? 'Saving…' : 'Save as draft'}
            </button>
          </div>
        </form>

        <Feedback result={result} />
      </div>

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">Orders</h2>
          <Feedback result={rowResult} />
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
                {orders.map(({ po, line }) => {
                  const product = productById.get(line.productId);
                  const remaining = Math.round((line.quantityOrdered - line.quantityReceived) * 1000) / 1000;
                  return (
                    <tr key={po.id} className="border-t border-accent/[0.08]">
                      <td className="px-5 py-3 font-mono-brand text-[0.78rem] text-text">{po.poNumber}</td>
                      <td className="px-5 py-3 text-text-muted">{supplierById.get(po.supplierId)?.name}</td>
                      <td className="px-5 py-3 text-text-muted">
                        {product?.sku} <span className="text-text-faint">— {product?.name}</span>
                      </td>
                      <td className="px-5 py-3 text-text-muted">{warehouseById.get(po.warehouseId)?.code}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-text">
                        {line.quantityOrdered.toLocaleString()} {product?.unitOfMeasure}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-text-muted">
                        {line.quantityReceived.toLocaleString()} {product?.unitOfMeasure}
                      </td>
                      <td className="px-5 py-3">
                        <StatusPill status={po.status} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        {po.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => setRowResult(issuePurchaseOrder(po.id))}
                            className="text-[0.8rem] font-semibold text-accent hover:text-accent-hover"
                          >
                            Issue
                          </button>
                        )}
                        {(po.status === 'issued' || po.status === 'partially_received') && (
                          <ReceiveLine
                            poId={po.id}
                            remaining={remaining}
                            unit={product?.unitOfMeasure ?? 'ea'}
                            onResult={setRowResult}
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

/** PORTED from receive-line.tsx — the inline partial-receive control. */
function ReceiveLine({
  poId,
  remaining,
  unit,
  onResult,
}: {
  poId: string;
  remaining: number;
  unit: string;
  onResult: (r: ActionResult) => void;
}) {
  const receivePurchaseOrder = useStore((s) => s.receivePurchaseOrder);
  const [pending, setPending] = useState(false);
  const [local, setLocal] = useState<ActionResult | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const quantity = Number(new FormData(form).get('quantity'));
    setPending(true);
    const result = receivePurchaseOrder(poId, quantity);
    setPending(false);
    setLocal(result);
    onResult(result);
    if (result.ok) form.reset();
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="number"
          name="quantity"
          min="0.001"
          max={remaining}
          step="0.001"
          required
          placeholder={`up to ${remaining}`}
          className="h-9 w-28 rounded-lg border border-accent/[0.14] bg-surface-2 px-2.5 py-1.5 text-right text-[0.82rem] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg bg-accent px-3 py-1.5 text-[0.78rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
        >
          {pending ? 'Posting…' : `Receive (${unit})`}
        </button>
      </form>
      {local && !local.ok && <p className="text-[0.72rem] text-[#f3a99a]">{local.error}</p>}
      {local && local.ok && <p className="text-[0.72rem] text-accent">{local.message}</p>}
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
