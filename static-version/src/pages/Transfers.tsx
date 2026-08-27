import { useState } from 'react';
import { warehouses } from '@/store/seed';
import { useStore, type ActionResult } from '@/store/useStore';
import { inputClass, selectClass } from '@/ui/form-control-classes';
import { Feedback } from '@/ui/Feedback';
import { ScanRow, useScanRow } from '@/ui/ScanRow';

/** PORTED from src/app/dashboard/transfers/page.tsx + transfer-form.tsx. */
export function TransfersPage() {
  const products = useStore((s) => s.products);
  const transfers = useStore((s) => s.transfers);
  const initiateTransfer = useStore((s) => s.initiateTransfer);
  const completeTransfer = useStore((s) => s.completeTransfer);

  const [result, setResult] = useState<ActionResult | null>(null);
  const [rowResult, setRowResult] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const { message, matchBarcode, productSelectRef, quantityRef } = useScanRow(products, null);

  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  const sorted = [...transfers].sort((a, b) => b.initiatedAt.localeCompare(a.initiatedAt));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setResult(
      initiateTransfer({
        fromWarehouseId: String(form.get('fromWarehouseId')),
        toWarehouseId: String(form.get('toWarehouseId')),
        productId: String(form.get('productId')),
        quantity: Number(form.get('quantity')),
      })
    );
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Inter-warehouse transfers</h1>
        <p className="text-[0.86rem] text-text-muted">
          In-transit stock is out of the source ledger but not yet in the destination&apos;s.
        </p>
      </div>

      <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
        <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">Initiate a transfer</h2>
        <p className="mb-4 text-[0.83rem] text-text-muted">
          Posts a transfer-out at the source immediately (in-transit logic). The receiving warehouse only
          picks the stock up in the ledger once the transfer is marked complete below.
        </p>

        <ScanRow onMatch={matchBarcode} message={message} />

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">From</span>
            <select name="fromWarehouseId" required className={selectClass}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">To</span>
            <select name="toWarehouseId" required defaultValue={warehouses[1]?.id} className={selectClass}>
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

          <div className="flex items-end lg:col-span-5">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
            >
              {pending ? 'Initiating…' : 'Initiate transfer'}
            </button>
          </div>
        </form>

        <Feedback result={result} />
      </div>

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">Transfers</h2>
          <Feedback result={rowResult} />
        </div>
        {sorted.length === 0 ? (
          <p className="px-5 py-6 text-[0.85rem] text-text-faint">No transfers yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[0.86rem]">
              <thead>
                <tr className="text-left text-text-faint">
                  <th className="px-5 py-2.5 font-medium">Transfer</th>
                  <th className="px-5 py-2.5 font-medium">From</th>
                  <th className="px-5 py-2.5 font-medium">To</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((t) => (
                  <tr key={t.id} className="border-t border-accent/[0.08]">
                    <td className="px-5 py-3 font-mono-brand text-[0.78rem] text-text">{t.transferNumber}</td>
                    <td className="px-5 py-3 text-text-muted">{warehouseById.get(t.fromWarehouseId)?.code}</td>
                    <td className="px-5 py-3 text-text-muted">{warehouseById.get(t.toWarehouseId)?.code}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.72rem] font-semibold ${
                          t.status === 'in_transit' ? 'bg-accent/15 text-accent' : 'bg-white/5 text-text-muted'
                        }`}
                      >
                        {t.status === 'in_transit' ? 'In transit' : 'Completed'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {t.status === 'in_transit' && (
                        <button
                          type="button"
                          onClick={() => setRowResult(completeTransfer(t.id))}
                          className="text-[0.8rem] font-semibold text-accent hover:text-accent-hover"
                        >
                          Mark received
                        </button>
                      )}
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
