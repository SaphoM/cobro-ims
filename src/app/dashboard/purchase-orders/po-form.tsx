'use client';

import { useActionState } from 'react';
import { createPurchaseOrderAction, type PurchaseOrderFormState } from '@/app/dashboard/purchase-orders/actions';
import { inputClass, selectClass } from '@/lib/ui/form-control-classes';
import type { Product, Supplier, Warehouse } from '@/lib/domain/inventory';

const initialState: PurchaseOrderFormState = { error: null, success: null };

export function PurchaseOrderForm({
  suppliers,
  warehouses,
  products,
}: {
  suppliers: Supplier[];
  warehouses: Warehouse[];
  products: Product[];
}) {
  const [state, formAction, pending] = useActionState(createPurchaseOrderAction, initialState);

  return (
    <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
      <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">New purchase order</h2>
      <p className="mb-4 text-[0.83rem] text-text-muted">
        Saved as a draft — nothing is sent to the supplier or posted to the ledger until it&apos;s issued
        and then received.
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
