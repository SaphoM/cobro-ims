'use client';

import { useActionState } from 'react';
import { initiateTransferAction, type TransferFormState } from '@/app/dashboard/transfers/actions';
import type { Product, Warehouse } from '@/lib/domain/inventory';

const initialState: TransferFormState = { error: null, success: null };
const selectClass =
  'rounded-lg border border-accent/[0.14] bg-surface-2 px-3 py-2.5 text-[0.88rem] text-text focus:border-accent focus:outline-none';
const inputClass =
  'rounded-lg border border-accent/[0.14] bg-surface-2 px-3 py-2.5 text-[0.88rem] text-text placeholder:text-text-faint focus:border-accent focus:outline-none';

export function TransferForm({ products, warehouses }: { products: Product[]; warehouses: Warehouse[] }) {
  const [state, formAction, pending] = useActionState(initiateTransferAction, initialState);

  return (
    <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
      <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">Initiate a transfer</h2>
      <p className="mb-4 text-[0.83rem] text-text-muted">
        Posts a transfer-out at the source immediately (in-transit logic). The receiving warehouse only
        picks the stock up in the ledger once the transfer is marked complete below.
      </p>

      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
          <select name="productId" required className={selectClass}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Quantity</span>
          <input type="number" name="quantity" min="0.001" step="0.001" required placeholder="0" className={inputClass} />
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
