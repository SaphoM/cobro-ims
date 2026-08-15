'use client';

import { useActionState } from 'react';
import { requestAdjustmentAction, type AdjustmentFormState } from '@/app/dashboard/adjustments/actions';
import type { AdjustmentReasonCode, Product, Warehouse } from '@/lib/domain/inventory';

const initialState: AdjustmentFormState = { error: null, success: null };
const selectClass =
  'rounded-lg border border-accent/[0.14] bg-surface-2 px-3 py-2.5 text-[0.88rem] text-text focus:border-accent focus:outline-none';
const inputClass =
  'rounded-lg border border-accent/[0.14] bg-surface-2 px-3 py-2.5 text-[0.88rem] text-text placeholder:text-text-faint focus:border-accent focus:outline-none';

export function AdjustmentForm({
  products,
  warehouses,
  reasonCodes,
}: {
  products: Product[];
  warehouses: Warehouse[];
  reasonCodes: AdjustmentReasonCode[];
}) {
  const [state, formAction, pending] = useActionState(requestAdjustmentAction, initialState);

  return (
    <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
      <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">Request an adjustment</h2>
      <p className="mb-4 text-[0.83rem] text-text-muted">
        Every adjustment needs approval before it touches the ledger — nothing here posts a movement until
        someone with authority approves it below. Approver permissions are still a{' '}
        <span className="text-accent">BUSINESS DECISION REQUIRED</span> item; any signed-in user can
        approve in this mock.
      </p>

      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
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
          <span className="text-[0.75rem] font-semibold text-text-muted">Reason</span>
          <select name="reasonCodeId" required className={selectClass}>
            {reasonCodes.map((r) => (
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
          <input type="number" name="quantity" min="0.001" step="0.001" required placeholder="0" className={inputClass} />
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

      {state.error && (
        <p role="alert" className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[0.82rem] text-[#f3a99a]">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="mt-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[0.82rem] text-accent">
          {state.success}
        </p>
      )}
    </div>
  );
}
