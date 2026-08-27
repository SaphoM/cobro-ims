import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { warehouses } from '@/store/seed';
import { useStore, type ActionResult } from '@/store/useStore';
import { inputClass, selectClass } from '@/ui/form-control-classes';
import { Feedback } from '@/ui/Feedback';
import { ScanRow, useScanRow } from '@/ui/ScanRow';

/** PORTED from src/app/dashboard/receiving/page.tsx + receive-form.tsx. */
export function ReceivingPage() {
  const [searchParams] = useSearchParams();
  const barcode = searchParams.get('barcode');

  const products = useStore((s) => s.products);
  const suppliers = useStore((s) => s.suppliers);
  const receipts = useStore((s) => s.goodsReceipts);
  const quickReceive = useStore((s) => s.quickReceive);

  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const { message, matchBarcode, productSelectRef, quantityRef } = useScanRow(products, barcode);

  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  const recentReceipts = [...receipts]
    .sort((a, b) => (b.receivedAt ?? '').localeCompare(a.receivedAt ?? ''))
    .slice(0, 20);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setResult(
      quickReceive({
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
        <h1 className="font-display text-[1.3rem] font-medium text-text">Goods receiving</h1>
        <p className="text-[0.86rem] text-text-muted">PO-linked receipts, posted straight into the stock ledger.</p>
      </div>

      <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
        <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">Receive stock (GRN)</h2>
        <p className="mb-4 text-[0.83rem] text-text-muted">
          Creates the purchase order, the goods receipt, and posts the receipt movement in one step — the
          path for genuine ad-hoc receipts with no formal PO raised. For the full lifecycle, use Purchase
          orders instead.
        </p>

        <ScanRow onMatch={matchBarcode} message={message} />

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
            <select name="productId" required ref={productSelectRef} className={selectClass}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">Quantity received</span>
            <input ref={quantityRef} type="number" name="quantity" min="0.001" step="0.001" required placeholder="0" className={inputClass} />
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
              {pending ? 'Posting…' : 'Post receipt'}
            </button>
          </div>
        </form>

        <Feedback result={result} />
      </div>

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">Recent receipts</h2>
        </div>
        {recentReceipts.length === 0 ? (
          <p className="px-5 py-6 text-[0.85rem] text-text-faint">No receipts posted yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[0.86rem]">
              <thead>
                <tr className="text-left text-text-faint">
                  <th className="px-5 py-2.5 font-medium">GRN</th>
                  <th className="px-5 py-2.5 font-medium">Warehouse</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {recentReceipts.map((r) => (
                  <tr key={r.id} className="border-t border-accent/[0.08]">
                    <td className="px-5 py-3 font-mono-brand text-[0.78rem] text-text">{r.grnNumber}</td>
                    <td className="px-5 py-3 text-text-muted">{warehouseById.get(r.warehouseId)?.code ?? '—'}</td>
                    <td className="px-5 py-3 text-text-muted capitalize">{r.status}</td>
                    <td className="px-5 py-3 text-text-muted">
                      {r.receivedAt ? new Date(r.receivedAt).toLocaleString('en-ZA') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
