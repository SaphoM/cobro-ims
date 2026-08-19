'use client';

import { useActionState } from 'react';
import { recordMovementAction, type RecordMovementFormState } from '@/app/dashboard/actions';
import { inputClass, selectClass } from '@/lib/ui/form-control-classes';
import type { Product, Warehouse } from '@/lib/domain/inventory';

const initialState: RecordMovementFormState = { error: null, success: null };

const MOVEMENT_LABELS: Record<string, string> = {
  receipt: 'Receipt (GRN)',
  dispatch: 'Dispatch (sale)',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  adjustment: 'Adjustment (found)',
  write_off: 'Write-off',
};

export function RecordMovementForm({ products, warehouses }: { products: Product[]; warehouses: Warehouse[] }) {
  const [state, formAction, pending] = useActionState(recordMovementAction, initialState);

  return (
    <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
      <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">Record a stock movement</h2>
      <p className="mb-4 text-[0.83rem] text-text-muted">
        Proves the inventory engine end-to-end: this posts an append-only movement, then re-derives the
        ledger&apos;s quantity and weighted-average cost from it — the same path GRN, dispatch, transfers and
        write-offs will all use once those modules exist.
      </p>

      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex flex-col gap-1.5 lg:col-span-2">
          <span className="text-[0.75rem] font-semibold text-text-muted">Product</span>
          <select
            name="productId"
            required
            className={selectClass}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Warehouse</span>
          <select
            name="warehouseId"
            required
            className={selectClass}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Type</span>
          <select
            name="movementType"
            required
            defaultValue="receipt"
            className={selectClass}
          >
            {Object.entries(MOVEMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Quantity</span>
          <input
            type="number"
            name="quantity"
            min="0.001"
            step="0.001"
            required
            placeholder="0"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Unit cost (R)</span>
          <input
            type="number"
            name="unitCost"
            min="0"
            step="0.01"
            required
            placeholder="0.00"
            className={inputClass}
          />
        </label>

        <div className="flex items-end lg:col-span-5">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
          >
            {pending ? 'Posting…' : 'Post movement'}
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
