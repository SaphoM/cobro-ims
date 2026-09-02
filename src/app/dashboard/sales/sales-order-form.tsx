'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { createSalesOrderAction, type SalesOrderFormState } from '@/app/dashboard/sales/actions';
import { CameraScanner } from '@/components/scanner/camera-scanner';
import { inputClass, selectClass } from '@/lib/ui/form-control-classes';
import type { Customer, Product, Warehouse } from '@/lib/domain/inventory';

const initialState: SalesOrderFormState = { error: null, success: null };

export function SalesOrderForm({
  customers,
  warehouses,
  products,
  initialBarcode,
}: {
  customers: Customer[];
  warehouses: Warehouse[];
  products: Product[];
  initialBarcode?: string;
}) {
  const [state, formAction, pending] = useActionState(createSalesOrderAction, initialState);
  const [scanMessage, setScanMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const scanFormRef = useRef<HTMLFormElement>(null);
  const scanBarcodeRef = useRef<HTMLInputElement>(null);

  /*
    Store, Product, Quantity and Unit value are controlled rather than left
    to the DOM. React resets every field in a <form action={...}> once the
    action call completes - success or failure - so an uncontrolled version
    of this form wiped Product/Quantity/Unit value back to their defaults
    the moment Store was wrong, on top of the wrong-store error itself. The
    operator had to retype the whole requisition just to fix one dropdown.
    Controlled state survives that reset; only a genuinely successful create
    clears it (see the effect below).
  */
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');

  /*
    React 19 resets a <form action={fn}>'s fields via the browser's native
    HTMLFormElement.reset() after every action call, success or failure -
    and that native reset wins the race against a controlled <select>'s own
    value here: text inputs get re-asserted correctly on the same commit,
    but the Product dropdown was observed snapping visually back to its
    first option after a failed create, even though `productId` state still
    held the right id underneath. Remounting the select (via `key`) forces
    React to render it fresh from `productId` every time the action
    completes, which reliably wins that race instead of hoping an
    incremental DOM update does.
  */
  const [selectInstance, setSelectInstance] = useState(0);
  const lastState = useRef(state);
  useEffect(() => {
    if (state !== lastState.current) {
      lastState.current = state;
      setSelectInstance((n) => n + 1);
    }
  }, [state]);

  function matchBarcode(barcode: string) {
    const match = products.find((p) => p.barcode === barcode);
    if (match) {
      setProductId(match.id);
      setScanMessage({ text: `Matched ${match.sku} - ${match.name}.`, ok: true });
      quantityRef.current?.focus();
    } else {
      setScanMessage({ text: `No product with barcode "${barcode}".`, ok: false });
    }
  }

  // Cleared only on a confirmed success, not merely because the action
  // returned - a failed create is exactly when the operator needs the
  // fields left alone so they can fix the one thing that was wrong. Keyed
  // on the message text itself (not just truthiness) so this fires once per
  // successful create, not on every re-render while state.success is set.
  const lastHandledSuccess = useRef<string | null>(null);
  useEffect(() => {
    if (state.success && state.success !== lastHandledSuccess.current) {
      lastHandledSuccess.current = state.success;
      setQuantity('');
      setUnitPrice('');
    }
  }, [state.success]);

  function handleBarcodeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const barcodeInput = e.currentTarget.elements.namedItem('scanBarcode') as HTMLInputElement;
    const barcode = barcodeInput.value.trim();
    if (!barcode) return;
    matchBarcode(barcode);
    barcodeInput.value = '';
    barcodeInput.focus();
  }

  // Coming here via "Requisition this product" from the Barcode / QR scan
  // page — carry that product straight into the form instead of making the
  // user scan/search again. Runs the exact same match the manual scan box uses.
  // Deliberately mount-time-only (guarded by a ref, not just the `if` above):
  // this is a one-time sync of state from a URL param on arrival, which the
  // lint rule below can't distinguish from an effect that would re-fire on
  // every render - it only ever runs once per navigation here because the ref
  // makes the second run a no-op.
  const barcodeHandled = useRef(false);
  useEffect(() => {
    if (initialBarcode && !barcodeHandled.current) {
      barcodeHandled.current = true;
      matchBarcode(initialBarcode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBarcode]);

  return (
    <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
      <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">New requisition</h2>
      <p className="mb-4 text-[0.83rem] text-text-muted">
        Created as a draft - it reserves nothing until approved, and nothing leaves the ledger until
        issued.
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
            className="h-9 flex-1 rounded-lg border border-accent/30 bg-surface-2 px-3 py-1.5 text-[0.82rem] font-semibold text-accent-strong hover:bg-accent/10 sm:flex-none"
          >
            Match
          </button>
          <CameraScanner
            buttonLabel="Scan with camera"
            className="h-9 flex-1 rounded-lg border border-accent/30 bg-surface-2 px-3 py-1.5 text-[0.82rem] font-semibold text-accent-strong hover:bg-accent/10 sm:flex-none"
            onScan={(value) => {
              if (scanBarcodeRef.current) scanBarcodeRef.current.value = value;
              scanFormRef.current?.requestSubmit();
            }}
          />
        </div>
      </form>
      {scanMessage && (
        <p className={`mb-4 text-[0.78rem] ${scanMessage.ok ? 'text-accent-strong' : 'text-danger'}`}>{scanMessage.text}</p>
      )}

      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="flex flex-col gap-1.5 lg:col-span-2">
          <span className="text-[0.75rem] font-semibold text-text-muted">Requesting department</span>
          <select name="customerId" required className={selectClass}>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Store</span>
          <select
            key={selectInstance}
            name="warehouseId"
            required
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className={selectClass}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 lg:col-span-2">
          <span className="text-[0.75rem] font-semibold text-text-muted">Product</span>
          <select
            key={selectInstance}
            name="productId"
            required
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className={selectClass}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} - {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Quantity</span>
          <input
            ref={quantityRef}
            type="number"
            name="quantity"
            min="0.001"
            step="0.001"
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Unit value (R)</span>
          <input
            type="number"
            name="unitPrice"
            min="0"
            step="0.01"
            required
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            placeholder="0.00"
            className={inputClass}
          />
        </label>

        <div className="flex items-end lg:col-span-6">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
          >
            {pending ? 'Creating…' : 'Create requisition'}
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
