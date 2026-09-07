'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { receiveStockAction, type ReceiveFormState } from '@/app/dashboard/receiving/actions';
import { CameraScanner } from '@/components/scanner/camera-scanner';
import { inputClass, selectClass } from '@/lib/ui/form-control-classes';
import { HIDDEN_COST } from '@/lib/ui/cost-display';
import { parseScanPayload } from '@/lib/scan-payload';
import type { Product, Supplier, Warehouse } from '@/lib/domain/inventory';

const initialState: ReceiveFormState = { error: null, success: null };

export function ReceiveForm({
  suppliers,
  warehouses,
  products,
  initialBarcode,
  canEditPrice,
  showCosts,
  centerSubmit = false,
}: {
  suppliers: Supplier[];
  warehouses: Warehouse[];
  products: Product[];
  initialBarcode?: string;
  /** `manage_pricing` - Admin only. Everyone else sees the cost as read-only
   *  bold text (the catalogue price), and the server discards whatever unit
   *  cost their form submits - see receiveStockAction. Same rule the
   *  Overview's stock-movement form follows. */
  canEditPrice: boolean;
  /** Stores profiles get the submit centred and sized like the Overview's
   *  Scan button - same height, same width (it takes the middle grid column,
   *  exactly as Scan does), full width once the grid collapses. Admin keeps
   *  the standard left-aligned submit. The role decision is made by the
   *  pages, not here - see dashboard/page.tsx and receiving/page.tsx. */
  centerSubmit?: boolean;
  /** The separate, Admin-controlled "show costs to all roles" setting. Off
   *  means money is withheld entirely, so the read-only display shows the
   *  withheld marker instead of a figure. */
  showCosts: boolean;
}) {
  const [state, formAction, pending] = useActionState(receiveStockAction, initialState);
  const [scanMessage, setScanMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const productSelectRef = useRef<HTMLSelectElement>(null);
  /*
    Mirrors the (uncontrolled) Product select purely so the read-only unit
    cost below can show the right catalogue price. The DOM select stays the
    source of truth for what's submitted - and the server re-derives the cost
    from the submitted product anyway - so this only ever drives the display.
  */
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id ?? '');
  const selectedProduct = products.find((p) => p.id === selectedProductId);

  /*
    Supplier comes from the scan when the label carries one (see
    src/lib/scan-payload.ts) - a Cobro delivery label encodes who it came
    from, so receiving scans once instead of scanning and then picking the
    supplier by hand. Null means "nothing scanned it in", and the picker is
    shown as before: a plain manufacturer barcode says nothing about who
    delivered it, and a supplier must never be guessed.
  */
  const [scannedSupplierId, setScannedSupplierId] = useState<string | null>(null);
  const scannedSupplier = scannedSupplierId ? suppliers.find((s) => s.id === scannedSupplierId) ?? null : null;

  // One store means there is nothing to choose - it is shown as a fact
  // rather than as a dropdown with a single option. More than one and the
  // picker comes back on its own.
  const onlyStore = warehouses.length === 1 ? warehouses[0] : null;
  const quantityRef = useRef<HTMLInputElement>(null);
  const scanFormRef = useRef<HTMLFormElement>(null);
  const scanBarcodeRef = useRef<HTMLInputElement>(null);

  function matchBarcode(scanned: string) {
    const { barcode, supplierId } = parseScanPayload(scanned);
    const match = products.find((p) => p.barcode === barcode);
    if (match && productSelectRef.current) {
      productSelectRef.current.value = match.id;
      setSelectedProductId(match.id);
      // Only trust a supplier the scan actually carried, and only one this
      // instance knows about - a label printed against a supplier since
      // removed shouldn't silently select something else.
      const known = supplierId ? suppliers.some((s) => s.id === supplierId) : false;
      setScannedSupplierId(known ? supplierId : null);
      setScanMessage({ text: `Matched ${match.sku} - ${match.name}.`, ok: true });
      quantityRef.current?.focus();
    } else {
      setScannedSupplierId(null);
      setScanMessage({ text: `No product with barcode "${barcode}".`, ok: false });
    }
  }

  function handleBarcodeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const barcodeInput = e.currentTarget.elements.namedItem('scanBarcode') as HTMLInputElement;
    const barcode = barcodeInput.value.trim();
    if (!barcode) return;
    matchBarcode(barcode);
    barcodeInput.value = '';
    barcodeInput.focus();
  }

  // Coming here via "Receive this product" from the Barcode / QR scan page —
  // carry that product straight into the form instead of making the user
  // scan/search again. Runs the exact same match the manual scan box uses.
  useEffect(() => {
    if (initialBarcode) matchBarcode(initialBarcode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBarcode]);

  return (
    <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
      <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">Receive stock (GRN)</h2>
      <p className="mb-4 text-[0.83rem] text-text-muted">
        Creates the purchase order, the goods receipt, and posts the receipt movement in one step - a
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
        <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className={`text-[0.78rem] ${scanMessage.ok ? 'text-accent-strong' : 'text-danger'}`}>
            {scanMessage.text}
          </p>
          {/*
            What the scan established, stated rather than re-asked. Supplier
            only appears when the label actually carried one; Store only when
            there is a single store, since then there was never a choice to
            make.
          */}
          {scanMessage.ok && scannedSupplier && (
            <p className="text-[0.78rem] text-text-muted">
              Supplier <span className="font-bold text-accent-strong">{scannedSupplier.name}</span>
            </p>
          )}
          {scanMessage.ok && onlyStore && (
            <p className="text-[0.78rem] text-text-muted">
              Store <span className="font-bold text-accent-strong">{onlyStore.code}</span>
            </p>
          )}
        </div>
      )}

      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex flex-col gap-1.5 lg:col-span-2">
          <span className="text-[0.75rem] font-semibold text-text-muted">
            Supplier
            {scannedSupplier && <span className="ml-1 font-normal text-text-faint">from the label</span>}
          </span>
          {scannedSupplier ? (
            <>
              <div className="flex h-9 items-center text-[0.95rem] font-bold text-accent-strong">
                {scannedSupplier.name}
              </div>
              <input type="hidden" name="supplierId" value={scannedSupplier.id} />
            </>
          ) : (
            <select name="supplierId" required className={selectClass}>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Store</span>
          {onlyStore ? (
            <>
              <div className="flex h-9 items-center text-[0.95rem] font-bold text-accent-strong">
                {onlyStore.code}
              </div>
              <input type="hidden" name="warehouseId" value={onlyStore.id} />
            </>
          ) : (
            <select name="warehouseId" required className={selectClass}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="flex flex-col gap-1.5 lg:col-span-2">
          <span className="text-[0.75rem] font-semibold text-text-muted">Product</span>
          <select
            name="productId"
            required
            ref={productSelectRef}
            onChange={(e) => setSelectedProductId(e.target.value)}
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
          <span className="text-[0.75rem] font-semibold text-text-muted">
            Unit cost (R)
            {!canEditPrice && showCosts && (
              <span className="ml-1 font-normal text-text-faint">from the catalogue</span>
            )}
          </span>
          {canEditPrice ? (
            <input type="number" name="unitCost" min="0" step="0.01" required placeholder="0.00" className={inputClass} />
          ) : (
            <>
              {/* Display-only for every role except Admin - plain bold text,
                  not an input drawn to look unavailable. The figure is the
                  selected product's catalogue price, which is what
                  receiveStockAction will post for this user regardless of
                  what the form sends. */}
              <div className="flex h-9 items-center text-[0.95rem] font-bold text-accent-strong">
                {!showCosts
                  ? HIDDEN_COST
                  : selectedProduct?.unitPrice != null
                    ? `R ${selectedProduct.unitPrice.toFixed(2)}`
                    : 'No price set'}
              </div>
              <input type="hidden" name="unitCost" value={selectedProduct?.unitPrice ?? 0} />
            </>
          )}
        </label>

        <div
          className={
            centerSubmit
              ? // Middle column of the five - which is both centred under the
                // form and exactly the width the Overview's Scan button
                // occupies, since that button is placed the same way.
                'flex items-end lg:col-start-3'
              : 'flex items-end lg:col-span-5'
          }
        >
          <button
            type="submit"
            disabled={pending}
            className={
              centerSubmit
                ? 'flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 text-[0.85rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90'
                : 'rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90'
            }
          >
            {pending ? 'Posting…' : 'Post receipt'}
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
