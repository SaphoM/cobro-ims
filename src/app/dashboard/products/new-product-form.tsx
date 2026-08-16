'use client';

import { useActionState, useRef } from 'react';
import { createProductAction, type CreateProductFormState } from '@/app/dashboard/products/actions';
import { CameraScanner } from '@/components/scanner/camera-scanner';

const initialState: CreateProductFormState = { error: null, success: null };

const inputClass =
  'rounded-lg border border-accent/[0.14] bg-surface-2 px-3 py-2.5 text-[0.88rem] text-text placeholder:text-text-faint focus:border-accent focus:outline-none';

export function NewProductForm() {
  const [state, formAction, pending] = useActionState(createProductAction, initialState);
  const barcodeRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
      <h2 className="mb-4 font-display text-[1.05rem] font-medium text-text">Add a product</h2>

      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="flex flex-col gap-1.5 lg:col-span-2">
          <span className="text-[0.75rem] font-semibold text-text-muted">SKU</span>
          <input name="sku" required placeholder="CEM-42.5-50KG" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 lg:col-span-2">
          <span className="text-[0.75rem] font-semibold text-text-muted">Name</span>
          <input name="name" required placeholder="Cement 42.5N, 50kg bag" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Unit of measure</span>
          <input name="unitOfMeasure" required placeholder="bag / ea / m2 / ton" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Barcode</span>
          <div className="flex gap-2">
            <input ref={barcodeRef} name="barcode" placeholder="Optional" className={`${inputClass} flex-1`} />
            <CameraScanner
              buttonLabel="Scan"
              className="rounded-lg border border-accent/30 bg-surface-2 px-3 py-2.5 text-[0.82rem] font-semibold text-accent hover:bg-accent/10"
              onScan={(value) => {
                if (barcodeRef.current) barcodeRef.current.value = value;
              }}
            />
          </div>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Reorder point</span>
          <input type="number" name="reorderPoint" min="0" step="1" placeholder="Optional" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Reorder quantity</span>
          <input type="number" name="reorderQuantity" min="0" step="1" placeholder="Optional" className={inputClass} />
        </label>

        <div className="flex items-end lg:col-span-6">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
          >
            {pending ? 'Adding…' : 'Add product'}
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
