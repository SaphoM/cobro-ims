'use client';

import { useActionState } from 'react';
import { receiveStockAction, type ReceiveFormState } from '@/app/dashboard/receiving/actions';
import type { Product, Supplier, Warehouse } from '@/lib/domain/inventory';

const initialState: ReceiveFormState = { error: null, success: null };
const selectClass =
  'rounded-lg border border-accent/[0.14] bg-surface-2 px-3 py-2.5 text-[0.88rem] text-text focus:border-accent focus:outline-none';
const inputClass =
  'rounded-lg border border-accent/[0.14] bg-surface-2 px-3 py-2.5 text-[0.88rem] text-text placeholder:text-text-faint focus:border-accent focus:outline-none';

export function ReceiveForm({
  suppliers,
  warehouses,
  products,
}: {
  suppliers: Supplier[];
  warehouses: Warehouse[];
  products: Product[];
}) {
  const [state, formAction, pending] = useActionState(receiveStockAction, initialState);

  return (
    <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
      <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">Receive stock (GRN)</h2>
      <p className="mb-4 text-[0.83rem] text-text-muted">
        Creates the purchase order, the goods receipt, and posts the receipt movement in one step — a
        deliberate shortcut while full Purchase Order lifecycle management (RFQ Phase 3) doesn&apos;t exist
        yet. The schema underneath still models PO → GRN properly.
      </p>

      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
          <span className="text-[0.75rem] font-semibold text-text-muted">Quantity received</span>
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
            {pending ? 'Posting…' : 'Post receipt'}
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
