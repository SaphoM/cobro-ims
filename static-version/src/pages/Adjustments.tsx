import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adjustmentReasonCodes, warehouses } from '@/store/seed';
import { useCurrentUser, useStore, type ActionResult } from '@/store/useStore';
import { inputClass, selectClass } from '@/ui/form-control-classes';
import { Feedback } from '@/ui/Feedback';
import { ScanRow, useScanRow } from '@/ui/ScanRow';

/** PORTED from src/app/dashboard/adjustments/page.tsx + adjustment-form.tsx. */
export function AdjustmentsPage() {
  const [searchParams] = useSearchParams();
  const barcode = searchParams.get('barcode');

  const session = useCurrentUser();
  const products = useStore((s) => s.products);
  const adjustments = useStore((s) => s.adjustments);
  const requestAdjustment = useStore((s) => s.requestAdjustment);
  const decideAdjustment = useStore((s) => s.decideAdjustment);

  const [result, setResult] = useState<ActionResult | null>(null);
  const [rowResult, setRowResult] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const { message, matchBarcode, productSelectRef, quantityRef } = useScanRow(products, barcode);

  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  const reasonById = new Map(adjustmentReasonCodes.map((r) => [r.id, r]));
  const sorted = [...adjustments].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const quantity = Number(form.get('quantity'));
    const direction = String(form.get('direction'));
    setPending(true);
    setResult(
      requestAdjustment({
        warehouseId: String(form.get('warehouseId')),
        productId: String(form.get('productId')),
        reasonCodeId: String(form.get('reasonCodeId')),
        // 'missing' is a write-off (negative), 'found' adds back (positive) —
        // the sign is what decides write_off vs adjustment at approval time.
        quantityDelta: direction === 'missing' ? -Math.abs(quantity) : Math.abs(quantity),
        unitCost: Number(form.get('unitCost')),
      })
    );
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Write-offs &amp; adjustments</h1>
        <p className="text-[0.86rem] text-text-muted">Reason-coded, approval-gated stock corrections.</p>
      </div>

      {session && !session.mfaEnrolled && (
        <div className="rounded-xl border border-accent/30 bg-accent/[0.08] px-4 py-3 text-[0.82rem] text-accent">
          Approving or rejecting requires 2FA. Enable it under{' '}
          <Link to="/dashboard/security" className="font-semibold underline">
            Security
          </Link>{' '}
          first — requesting an adjustment doesn&apos;t need it.
        </div>
      )}

      <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
        <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">Request an adjustment</h2>
        <p className="mb-4 text-[0.83rem] text-text-muted">
          Every adjustment needs approval before it touches the ledger — nothing here posts a movement until
          someone with authority approves it below. Approving requires both the right role and 2FA enabled.
          The exact role assignments are still a{' '}
          <span className="text-accent">BUSINESS DECISION REQUIRED</span> item — only Admin can approve in
          this placeholder matrix.
        </p>

        <ScanRow onMatch={matchBarcode} message={message} />

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
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
            <span className="text-[0.75rem] font-semibold text-text-muted">Reason</span>
            <select name="reasonCodeId" required className={selectClass}>
              {adjustmentReasonCodes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">Direction</span>
            <select name="direction" required defaultValue="missing" className={selectClass}>
              <option value="missing">Missing (write-off)</option>
              <option value="found">Found (add back)</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">Quantity</span>
            <input ref={quantityRef} type="number" name="quantity" min="0.001" step="0.001" required placeholder="0" className={inputClass} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">Unit cost (R)</span>
            <input type="number" name="unitCost" min="0" step="0.01" required placeholder="0.00" className={inputClass} />
          </label>

          <div className="flex items-end lg:col-span-6">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
            >
              {pending ? 'Submitting…' : 'Submit for approval'}
            </button>
          </div>
        </form>

        <Feedback result={result} />
      </div>

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">Adjustment requests</h2>
          <Feedback result={rowResult} />
        </div>
        {sorted.length === 0 ? (
          <p className="px-5 py-6 text-[0.85rem] text-text-faint">No adjustments requested yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[0.86rem]">
              <thead>
                <tr className="text-left text-text-faint">
                  <th className="px-5 py-2.5 font-medium">Adjustment</th>
                  <th className="px-5 py-2.5 font-medium">Warehouse</th>
                  <th className="px-5 py-2.5 font-medium">Reason</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((a) => (
                  <tr key={a.id} className="border-t border-accent/[0.08]">
                    <td className="px-5 py-3 font-mono-brand text-[0.78rem] text-text">{a.adjustmentNumber}</td>
                    <td className="px-5 py-3 text-text-muted">{warehouseById.get(a.warehouseId)?.code}</td>
                    <td className="px-5 py-3 text-text-muted">{reasonById.get(a.reasonCodeId)?.code}</td>
                    <td className="px-5 py-3">
                      <StatusPill status={a.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      {a.status === 'pending_approval' && (
                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => setRowResult(decideAdjustment(a.id, 'approved'))}
                            className="text-[0.8rem] font-semibold text-accent hover:text-accent-hover"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => setRowResult(decideAdjustment(a.id, 'rejected'))}
                            className="text-[0.8rem] font-semibold text-text-faint hover:text-danger"
                          >
                            Reject
                          </button>
                        </div>
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

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending_approval: 'bg-accent/15 text-accent',
    approved: 'bg-white/5 text-text-muted',
    rejected: 'bg-danger/15 text-[#f3a99a]',
  };
  const labels: Record<string, string> = {
    pending_approval: 'Pending approval',
    approved: 'Approved',
    rejected: 'Rejected',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[0.72rem] font-semibold ${styles[status] ?? ''}`}>
      {labels[status] ?? status}
    </span>
  );
}
