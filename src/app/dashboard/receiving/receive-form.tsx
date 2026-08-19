'use client';

import { useActionState, useRef, useState } from 'react';
import { receiveStockAction, type ReceiveFormState } from '@/app/dashboard/receiving/actions';
import { CameraScanner } from '@/components/scanner/camera-scanner';
import { inputClass, selectClass } from '@/lib/ui/form-control-classes';
import type { Product, Supplier, Warehouse } from '@/lib/domain/inventory';

const initialState: ReceiveFormState = { error: null, success: null };

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
  const [scanMessage, setScanMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const productSelectRef = useRef<HTMLSelectElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const scanFormRef = useRef<HTMLFormElement>(null);
  const scanBarcodeRef = useRef<HTMLInputElement>(null);

  function handleBarcodeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const barcodeInput = e.currentTarget.elements.namedItem('scanBarcode') as HTMLInputElement;
    const barcode = barcodeInput.value.trim();
    if (!barcode) return;

    const match = products.find((p) => p.barcode === barcode);
    if (match && productSelectRef.current) {
      productSelectRef.current.value = match.id;
      setScanMessage({ text: `Matched ${match.sku} — ${match.name}.`, ok: true });
      quantityRef.current?.focus();
    } else {
      setScanMessage({ text: `No product with barcode "${barcode}".`, ok: false });
    }
    barcodeInput.value = '';
    barcodeInput.focus();
  }

  return (
    <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
      <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">Receive stock (GRN)</h2>
      <p className="mb-4 text-[0.83rem] text-text-muted">
        Creates the purchase order, the goods receipt, and posts the receipt movement in one step — a
        deliberate shortcut while full Purchase Order lifecycle management (RFQ Phase 3) doesn&apos;t exist
        yet. The schema underneath still models PO → GRN properly.
      </p>

      <form
        ref={scanFormRef}
        onSubmit={handleBarcodeSubmit}
        className="mb-4 flex flex-col items-stretch gap-2 border-b border-accent/[0.08] pb-4 sm:flex-row sm:items-end"
      >
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Scan barcode to select product</span>
          <input
            ref={scanBarcodeRef}
            name="scanBarcode"
            type="text"
            autoComplete="off"
            placeholder="Scan or type, then Enter"
            className={`${inputClass} font-mono-brand`}
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className="h-9 flex-1 rounded-lg border border-accent/30 bg-surface-2 px-3 py-1.5 text-[0.82rem] font-semibold text-accent hover:bg-accent/10 sm:flex-none"
          >
            Match
          </button>
          <CameraScanner
            buttonLabel="Scan with camera"
            className="h-9 flex-1 rounded-lg border border-accent/30 bg-surface-2 px-3 py-1.5 text-[0.82rem] font-semibold text-accent hover:bg-accent/10 sm:flex-none"
            onScan={(value) => {
              if (scanBarcodeRef.current) scanBarcodeRef.current.value = value;
              scanFormRef.current?.requestSubmit();
            }}
          />
        </div>
      </form>
      {scanMessage && (
        <p className={`mb-4 text-[0.78rem] ${scanMessage.ok ? 'text-accent' : 'text-danger'}`}>{scanMessage.text}</p>
      )}

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
          <input
            ref={quantityRef}
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
