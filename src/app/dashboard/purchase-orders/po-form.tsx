'use client';

import { useActionState, useState } from 'react';
import { createPurchaseOrderAction, type PurchaseOrderFormState } from '@/app/dashboard/purchase-orders/actions';
import { inputClass, selectClass } from '@/lib/ui/form-control-classes';
import { HIDDEN_COST } from '@/lib/ui/cost-display';
import { formatCurrency } from '@/lib/ui/currency';
import type { Product, Supplier, Warehouse } from '@/lib/domain/inventory';
import { formatWarehouseLabel } from '@/lib/warehouse-label';
import { PACKAGING_UOM_LABELS } from '@/lib/uom';

const initialState: PurchaseOrderFormState = { error: null, success: null };

export function PurchaseOrderForm({
  suppliers,
  warehouses,
  products,
  showCosts,
}: {
  suppliers: Supplier[];
  warehouses: Warehouse[];
  products: Product[];
  /** The separate, Admin-controlled "show costs to all roles" setting. Off
   *  means money is withheld entirely, so the read-only display shows the
   *  withheld marker instead of a figure. */
  showCosts: boolean;
}) {
  const [state, formAction, pending] = useActionState(createPurchaseOrderAction, initialState);
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id ?? '');
  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const pkgUom = selectedProduct?.packagingUom ?? null;
  const qtyPerPkg = selectedProduct?.qtyPerPackage ?? null;
  const hasPackaging = !!(pkgUom && qtyPerPkg);
  const pkgLabel = pkgUom ? (PACKAGING_UOM_LABELS[pkgUom] ?? pkgUom) : '';

  return (
    <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
      <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">New purchase order</h2>
      <p className="mb-4 text-[0.83rem] text-text-muted">
        Saved as a draft - nothing is sent to the supplier or posted to the ledger until it&apos;s issued
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
          <span className="text-[0.75rem] font-semibold text-text-muted">Store</span>
          <select name="warehouseId" required className={selectClass}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {formatWarehouseLabel(w)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 lg:col-span-2">
          <span className="text-[0.75rem] font-semibold text-text-muted">Product</span>
          <select
            name="productId"
            required
            className={selectClass}
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} - {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">
            Quantity ordered{selectedProduct ? ` (${selectedProduct.unitOfMeasure})` : ''}
          </span>
          <input type="number" name="quantity" min="0.001" step="0.001" required placeholder="0" className={inputClass} />
          {hasPackaging && (
            <span className="text-[0.72rem] text-text-faint">
              Enter in individual {selectedProduct!.unitOfMeasure}s — {qtyPerPkg} = 1 {pkgLabel}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">
            Unit cost (R)
            {showCosts && <span className="ml-1 font-normal text-text-faint">from the catalogue</span>}
          </span>
          {/*
            Read-only for every role - the Product Catalogue's Price column is
            the only place a product's cost can be changed (see
            products/price-cell.tsx). This figure is what
            createPurchaseOrderAction costs the PO line at regardless of what,
            if anything, this form submits - there is no unitCost field to
            submit any more.
          */}
          <div className="flex h-9 items-center text-[0.95rem] font-bold text-accent-strong">
            {!showCosts
              ? HIDDEN_COST
              : selectedProduct?.unitPrice != null
                ? `${formatCurrency(selectedProduct.unitPrice)}`
                : selectedProduct?.defaultUnitCost != null
                  ? `${formatCurrency(selectedProduct.defaultUnitCost)} (default)`
                  : 'No price set'}
          </div>
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
        <p role="alert" className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[0.82rem] text-danger-text">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="mt-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[0.82rem] text-accent-strong">
          {state.success}
        </p>
      )}
    </div>
  );
}
