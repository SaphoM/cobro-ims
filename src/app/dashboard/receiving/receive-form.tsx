'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { receiveStockAction, type ReceiveFormState } from '@/app/dashboard/receiving/actions';
import { CameraScanner } from '@/components/scanner/camera-scanner';
import { inputClass, selectClass } from '@/lib/ui/form-control-classes';
import { HIDDEN_COST } from '@/lib/ui/cost-display';
import { parseScanPayload } from '@/lib/scan-payload';
import type { Product, ProductCategory, Supplier, Warehouse } from '@/lib/domain/inventory';
import { formatCurrency } from '@/lib/ui/currency';
import { formatWarehouseLabel } from '@/lib/warehouse-label';
import { PACKAGING_UOM_LABELS } from '@/lib/uom';

const initialState: ReceiveFormState = { error: null, success: null };

export function ReceiveForm({
  suppliers,
  warehouses,
  products,
  categories,
  initialBarcode,
  showCosts,
  centerSubmit = false,
}: {
  suppliers: Supplier[];
  warehouses: Warehouse[];
  products: Product[];
  categories: ProductCategory[];
  initialBarcode?: string;
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
  /*
    Mirrors the (uncontrolled) Product select purely so the read-only unit
    cost below can show the right catalogue price. The DOM select stays the
    source of truth for what's submitted - and the server re-derives the cost
    from the submitted product anyway - so this only ever drives the display.
  */
  // Empty until a scan sets it - Product has no manual picker any more, so
  // there is genuinely nothing selected until then.
  const [selectedProductId, setSelectedProductId] = useState('');
  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const selectedCategory = selectedProduct?.categoryId ? categoryById.get(selectedProduct.categoryId) : undefined;

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

  /*
    Quantity received is a live scan tally now, not a typed number - the same
    counting pattern the Overview's Scan dialog uses. The barcode that
    identifies the item is itself the first one counted; every further scan
    of the SAME barcode adds one more. `expectedQuantity` comes from a
    COBRO2+ label (see src/lib/scan-payload.ts) and is shown alongside the
    tally as e.g. "90/100" - it is display only, never enforced, since a
    delivery legitimately can arrive short or over.
  */
  /*
    receiveByPackages: when the matched product has a packagingUom+qtyPerPackage,
    each scan (or manual entry) counts one PACKAGE, not one individual unit. The
    hidden `quantity` field always carries the individual-unit total so the server
    action and the WAC engine never see a package-level number.
  */
  const [receiveByPackages, setReceiveByPackages] = useState(false);
  const [receivedCount, setReceivedCount] = useState(0);
  const [expectedQuantity, setExpectedQuantity] = useState<number | null>(null);

  // Posting requires a matched product and at least one unit counted.
  // Supplier is optional — set via a Cobro delivery label scan when available,
  // but ad-hoc receipts without a label are permitted.
  // Store isn't gated here: it's either the one real store (shown as a fact)
  // or, if a second store ever exists, an ordinary picker with a valid
  // default.
  const canPost = Boolean(selectedProductId) && receivedCount > 0;
  const scanFormRef = useRef<HTMLFormElement>(null);
  const scanBarcodeRef = useRef<HTMLInputElement>(null);

  /*
    The camera stays open across multiple scans now, same as the Overview's
    Scan dialog (`continuous` on <CameraScanner>) - an operator working
    through a stack of the same delivery shouldn't have to reopen the camera
    for every single unit. It closes itself two ways:
      - automatically, the instant the tally reaches a known expected
        quantity (a GRN specifically has one to reach, unlike a generic
        stock movement - see the effect below)
      - manually, via the camera overlay's own "Done scanning" / ✕ / Escape,
        for a delivery with no expected quantity on the label, or one that's
        arriving short
    The manual barcode box + Match button below are untouched - this only
    changes what happens when the camera is used.
  */
  const [cameraOpen, setCameraOpen] = useState(false);

  function matchBarcode(scanned: string) {
    const {
      barcode,
      supplierId,
      expectedQuantity: scannedExpectedQuantity,
      setId,
      seq,
      setSize,
    } = parseScanPayload(scanned);
    const match = products.find((p) => p.barcode === barcode);
    if (!match) {
      setScanMessage({ text: `No product with barcode "${barcode}".`, ok: false });
      return;
    }

    // Re-scanning the SAME product just tallies one more (this is the
    // counting gesture); scanning a DIFFERENT product starts a fresh receipt
    // - new tally, new expected quantity, new supplier - rather than mixing
    // two deliveries into one count.
    const isSameProduct = match.id === selectedProductId;
    setSelectedProductId(match.id);

    // When switching to a packaged product, default to "receive by packages"
    // mode so operators scan/enter box-counts rather than bolt-counts.
    const hasPackaging = !!(match.packagingUom && match.qtyPerPackage);
    if (!isSameProduct) setReceiveByPackages(hasPackaging);
    const currentReceiveByPackages = isSameProduct ? receiveByPackages : hasPackaging;
    const increment = currentReceiveByPackages && match.qtyPerPackage ? match.qtyPerPackage : 1;
    const newCount = isSameProduct ? receivedCount + increment : increment;
    setReceivedCount(newCount);

    // Only trust a supplier the scan actually carried, and only one this
    // instance knows about - a label printed against a supplier since
    // removed shouldn't silently select something else. A re-scan of the
    // same item that happens not to carry one (unlikely, but the label is
    // read fresh every time) doesn't clobber a supplier already established.
    const known = supplierId ? suppliers.some((s) => s.id === supplierId) : false;
    if (known) setScannedSupplierId(supplierId);
    else if (!isSameProduct) setScannedSupplierId(null);

    const newExpectedQuantity =
      scannedExpectedQuantity != null ? scannedExpectedQuantity : isSameProduct ? expectedQuantity : null;
    if (scannedExpectedQuantity != null) setExpectedQuantity(scannedExpectedQuantity);
    else if (!isSameProduct) setExpectedQuantity(null);

    // If the label was printed as part of a numbered run, say which run and
    // which label of it - lets a clerk tie a delivery back to the set it was
    // labelled from. Purely informational; it doesn't drive the tally.
    const setNote = setId && seq != null && setSize != null ? ` (set ${setId}, label ${seq} of ${setSize})` : '';
    setScanMessage({ text: `Matched ${match.sku} - ${match.name}.${setNote}`, ok: true });

    // Auto-close the camera the instant this scan brings the tally up to a
    // known expected quantity - set synchronously here (the event handler
    // every scan already runs through), not in an effect, since a delivery
    // with no expected quantity on the label never reaches this and the
    // operator closes the camera themselves once the box is empty. Harmless
    // no-op when the camera isn't open (e.g. a manual "Match" click).
    if (newExpectedQuantity != null && newCount >= newExpectedQuantity) {
      setCameraOpen(false);
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

  // Derived packaging info for the currently selected product
  const pkgUom = selectedProduct?.packagingUom ?? null;
  const qtyPerPkg = selectedProduct?.qtyPerPackage ?? null;
  const hasPackaging = !!(pkgUom && qtyPerPkg);
  const pkgLabel = pkgUom ? (PACKAGING_UOM_LABELS[pkgUom] ?? pkgUom) : '';
  // In package mode: receivedCount is already in individual units (each scan adds qtyPerPkg)
  const packageCount = hasPackaging && receiveByPackages && qtyPerPkg ? receivedCount / qtyPerPkg : null;
  const removeAmount = receiveByPackages && qtyPerPkg ? qtyPerPkg : 1;

  /*
    What the operator sees INSIDE the camera overlay while it stays open
    across scans - same reasoning as the Overview's Scan dialog: the overlay
    covers the form completely, so the match result and running tally have to
    be drawn here or they're invisible for the entire duration of scanning.
  */
  const cameraStatus = (
    <div className="flex flex-col gap-2">
      {scanMessage && !scanMessage.ok && (
        <p
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[0.78rem] leading-snug text-danger-text"
        >
          {scanMessage.text}
        </p>
      )}
      {selectedProduct && (
        <div className="rounded-xl border-2 border-accent/50 bg-surface-3 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[0.92rem] font-bold leading-snug text-accent-strong">
                {selectedProduct.name}
                {selectedCategory && (
                  <span className="ml-1.5 rounded-full bg-accent/15 px-2 py-0.5 align-middle text-[0.62rem] font-semibold">
                    {selectedCategory.name}
                  </span>
                )}
              </div>
              <div className="truncate font-mono-brand text-[0.68rem] text-text-faint">{selectedProduct.sku}</div>
              <div
                aria-live="polite"
                aria-label={`Received: ${receivedCount} ${selectedProduct.unitOfMeasure}${expectedQuantity != null ? ` of ${expectedQuantity}` : ''}`}
                className="mt-0.5 font-display text-[1.7rem] font-bold leading-tight tabular-nums text-text"
              >
                {packageCount != null ? packageCount : receivedCount}
                <span className="ml-1 text-[0.95rem] font-semibold text-text-muted">
                  {packageCount != null ? pkgLabel + (packageCount !== 1 ? 's' : '') : selectedProduct.unitOfMeasure}
                </span>
                {expectedQuantity != null && (
                  <span className="ml-1 text-[0.95rem] font-semibold text-text-faint">/ {expectedQuantity}</span>
                )}
              </div>
              {packageCount != null && (
                <div className="text-[0.72rem] text-text-faint">
                  = {receivedCount.toLocaleString()} {selectedProduct.unitOfMeasure}s
                </div>
              )}
            </div>
            {receivedCount > 0 && (
              <button
                type="button"
                onClick={() => setReceivedCount((count) => Math.max(0, count - removeAmount))}
                className="flex-none rounded-md border border-accent/30 px-2 py-1 text-[0.72rem] font-semibold text-text-muted transition-colors hover:border-accent/50 hover:text-accent-strong"
              >
                {receiveByPackages && hasPackaging ? `Remove 1 ${pkgLabel}` : 'Remove 1'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // Coming here via "Receive this product" from the Barcode / QR scan page —
  // carry that product straight into the form instead of making the user
  // scan/search again. Runs the exact same match the manual scan box uses.
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
      <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">Receive stock (GRN)</h2>
      <p className="mb-4 text-[0.83rem] text-text-muted">
        Creates the purchase order, the goods receipt, and posts the receipt movement into stock in one step.
      </p>

      <form
        ref={scanFormRef}
        onSubmit={handleBarcodeSubmit}
        className="mb-4 flex flex-col items-stretch gap-2 border-b border-accent/[0.08] pb-4"
      >
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
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
          <button
            type="submit"
            className="h-9 rounded-lg border border-accent/30 bg-surface-2 px-3 py-1.5 text-[0.82rem] font-semibold text-accent-strong hover:bg-accent/10"
          >
            Match
          </button>
        </div>
        {/*
          Same grid math as the "Post receipt" column below (grid-cols-1 /
          sm:grid-cols-2 / lg:grid-cols-5 over this same card), same
          lg:col-start-3 placement too, so this button sits in exactly the
          same column - same width, same horizontal position - as Post
          receipt instead of just matching its width off to the left.
        */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/*
            Plain button, not <CameraScanner>'s own trigger - the actual
            scanner is mounted once below, controlled (open/onOpenChange),
            because `continuous` needs ONE instance that survives across
            scans rather than remounting per open (see scan-movement.tsx's
            identical reasoning for its single controlled camera).
          */}
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            className="flex h-11 w-full items-center justify-center rounded-lg bg-accent px-4 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover lg:col-start-3"
          >
            Scan with camera
          </button>
        </div>
      </form>

      <CameraScanner
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        hideTrigger
        continuous
        statusSlot={cameraStatus}
        onScan={matchBarcode}
      />
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
              From <span className="font-bold text-accent-strong">{scannedSupplier.name}</span>
            </p>
          )}
          {scanMessage.ok && onlyStore && (
            <p className="text-[0.78rem] text-text-muted">
              To <span className="font-bold text-accent-strong">{formatWarehouseLabel(onlyStore)}</span>
            </p>
          )}
        </div>
      )}

      {/*
        Collapsed to a single hint line until a scan actually has something
        to say - before that, every field here is either a static fact
        (Location) or an empty placeholder, which is a lot of visual weight
        for "nothing yet". Expands back to the full grid the instant a
        product is matched (see matchBarcode) - collapsing again once posted
        would just make the immediate "next item" scan re-expand it, so it
        stays open for the rest of this receipt once it's shown itself.
      */}
      {selectedProductId ? (
        <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1.5 lg:col-span-2">
            <span className="text-[0.75rem] font-semibold text-text-muted">
              From Supplier
              {scannedSupplier && <span className="ml-1 font-normal text-text-faint">from the label</span>}
            </span>
            {/*
              Scan-only, no manual picker - the delivery label's code carries
              the supplier, so there is nothing to choose by hand any more (see
              src/lib/scan-payload.ts). A plain manufacturer barcode carries no
              supplier at all, so that case is a real "not yet known" rather
              than a default to fall back to - Post receipt stays disabled
              until a Cobro label has actually supplied one (see `canPost`
              below).
            */}
            {scannedSupplier ? (
              <div className="flex h-9 items-center text-[0.95rem] font-bold text-accent-strong">
                {scannedSupplier.name}
              </div>
            ) : (
              <div className="flex h-9 items-center text-[0.9rem] text-text-faint">
                Scan a Cobro delivery label to set the supplier
              </div>
            )}
            <input type="hidden" name="supplierId" value={scannedSupplier?.id ?? ''} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">To Location</span>
            {onlyStore ? (
              <>
                <div className="flex h-9 items-center text-[0.95rem] font-bold text-accent-strong">
                  {formatWarehouseLabel(onlyStore)}
                </div>
                <input type="hidden" name="warehouseId" value={onlyStore.id} />
              </>
            ) : (
              <select name="warehouseId" required className={selectClass}>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {formatWarehouseLabel(w)}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="flex flex-col gap-1.5 lg:col-span-2">
            <span className="text-[0.75rem] font-semibold text-text-muted">
              Product
              {selectedProduct && <span className="ml-1 font-normal text-text-faint">from the scan</span>}
            </span>
            {selectedProduct ? (
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5 text-[0.95rem] font-bold text-accent-strong">
                  {selectedProduct.sku} - {selectedProduct.name}
                  {selectedCategory && (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[0.68rem] font-semibold">
                      {selectedCategory.name}
                    </span>
                  )}
                </div>
                {selectedProduct.packagingUom && selectedProduct.qtyPerPackage != null && (
                  <div className="text-[0.72rem] text-text-faint">
                    Packaged: {selectedProduct.qtyPerPackage} {selectedProduct.unitOfMeasure} per {PACKAGING_UOM_LABELS[selectedProduct.packagingUom] ?? selectedProduct.packagingUom}.
                    {' '}Count received as individual {selectedProduct.unitOfMeasure}s.
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-9 items-center text-[0.9rem] text-text-faint">
                Scan or type a barcode above to select a product
              </div>
            )}
            <input type="hidden" name="productId" value={selectedProductId} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">
              {hasPackaging && receiveByPackages
                ? `${pkgLabel}s received`
                : `Quantity received (${selectedProduct?.unitOfMeasure ?? 'units'})`}
            </span>
            {/*
              Text, not an input — the count comes from scanning (re-scan the
              same barcode to add one). In package mode each scan counts as one
              package (= qtyPerPackage individual units); in individual mode each
              scan counts as one unit. "Remove 1" removes one package/unit.
            */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[0.95rem] font-bold tabular-nums text-accent-strong">
                {packageCount != null ? packageCount : receivedCount}
                <span className="ml-1 text-[0.78rem] font-normal text-text-muted">
                  {packageCount != null ? pkgLabel + (packageCount !== 1 ? 's' : '') : selectedProduct?.unitOfMeasure}
                </span>
                {expectedQuantity != null && <span className="text-text-faint"> / {expectedQuantity}</span>}
              </span>
              {packageCount != null && (
                <span className="text-[0.72rem] text-text-faint">= {receivedCount.toLocaleString()} {selectedProduct?.unitOfMeasure}s</span>
              )}
              {receivedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setReceivedCount((count) => Math.max(0, count - removeAmount))}
                  className="rounded-md border border-accent/30 px-2 py-0.5 text-[0.72rem] font-semibold text-text-muted transition-colors hover:border-accent/50 hover:text-accent-strong"
                >
                  {receiveByPackages && hasPackaging ? `Remove 1 ${pkgLabel}` : 'Remove 1'}
                </button>
              )}
            </div>
            {hasPackaging && (
              <button
                type="button"
                onClick={() => {
                  setReceiveByPackages((v) => !v);
                  setReceivedCount(0);
                }}
                className="w-fit text-[0.68rem] font-semibold text-accent-strong hover:underline"
              >
                Switch to {receiveByPackages ? `individual ${selectedProduct?.unitOfMeasure}s` : `${pkgLabel} count`}
              </button>
            )}
            {/* Always submit in individual units — the WAC engine never sees package counts */}
            <input type="hidden" name="quantity" value={receivedCount} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">
              Unit cost (R)
              {showCosts && <span className="ml-1 font-normal text-text-faint">from the catalogue</span>}
            </span>
            {/*
              Always read-only, for every role including Admin - the Product
              Catalogue's Price column is the only place a product's cost can
              be changed (see products/price-cell.tsx). This figure is the
              selected product's catalogue price, which is exactly what
              receiveStockAction posts the receipt at regardless of what, if
              anything, this form submits - there is no unitCost field to
              submit any more.
            */}
            <div className="flex flex-col gap-0.5">
              <div className="flex h-9 items-center text-[0.95rem] font-bold text-accent-strong">
                {!showCosts
                  ? HIDDEN_COST
                  : selectedProduct?.unitPrice != null
                    ? `${formatCurrency(selectedProduct.unitPrice)} / ${selectedProduct.unitOfMeasure}`
                    : selectedProduct?.defaultUnitCost != null
                      ? `${formatCurrency(selectedProduct.defaultUnitCost)} / ${selectedProduct.unitOfMeasure} (default)`
                      : 'No price set'}
              </div>
              {showCosts && selectedProduct?.packagingUom && selectedProduct.qtyPerPackage != null && (
                <div className="text-[0.72rem] text-text-faint">
                  Cost is per individual {selectedProduct.unitOfMeasure}, not per {PACKAGING_UOM_LABELS[selectedProduct.packagingUom] ?? selectedProduct.packagingUom}.
                </div>
              )}
            </div>
          </label>

          <div
            className={
              centerSubmit
                ? // Middle column of the five - which is both centred under the
                  // form and exactly the width the Overview's Scan button
                  // occupies, since that button is placed the same way.
                  'flex flex-col items-end gap-1.5 lg:col-start-3 lg:flex-row lg:items-center lg:gap-3'
                : 'flex flex-col items-start gap-1.5 lg:col-span-5 lg:flex-row lg:items-center lg:gap-3'
            }
          >
            <button
              type="submit"
              disabled={pending || !canPost}
              title={canPost ? undefined : 'Scan a product barcode to select a product first'}
              className={
                centerSubmit
                  ? 'flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 text-[0.85rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50'
                  : 'rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50'
              }
            >
              {pending ? 'Posting…' : 'Post receipt'}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-[0.85rem] text-text-faint">
          Scan a barcode above to see supplier, location, quantity and cost.
        </p>
      )}

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
