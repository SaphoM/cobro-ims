'use client';

import { useEffect, useRef, useState } from 'react';
import { CameraScanner } from '@/components/scanner/camera-scanner';
import { parseScanPayload } from '@/lib/scan-payload';
import { completeTransferAction } from '@/app/dashboard/transfers/actions';
import { inputClass } from '@/lib/ui/form-control-classes';

/**
 * "Scan to receive" - replaces the plain "Mark received" button for an
 * in-transit transfer whose SOURCE is an Engineer's station (a return to
 * Stores - see transfers/page.tsx for that check). Stores must scan the
 * physical item before the transfer completes, the same "confirm you're
 * looking at the right thing before the inventory action fires" shape
 * ReserveButton's "Scan to reserve" already uses: a decoded code is read
 * back to a barcode with the same `parseScanPayload` every scan point in
 * this app uses, compared against THIS transfer's product, and only a match
 * calls `completeTransferAction` - the exact same completion a plain
 * "Mark received" click would have triggered, just gated on a scan first.
 * A mismatch refuses and completes nothing, same as every other "wrong item
 * scanned" moment in the app (GRN's matchBarcode, ReserveButton).
 *
 * A plain store-to-store transfer (both ends `type: 'store'`) keeps the
 * simple, ungated "Mark received" button - see transfers/page.tsx. Only a
 * RETURN is scan-gated, because only a return is this feature's concern.
 */
export function ScanToReceiveButton({
  transferId,
  productSku,
  productName,
  productBarcode,
  quantity,
  unitOfMeasure,
  fromLabel,
}: {
  transferId: string;
  productSku: string;
  productName: string;
  /** Null when the product has no barcode on file - scanning can never
   *  confirm an item with nothing to scan, so that case falls back to a
   *  plain, ungated completion (same reasoning as ReserveButton's identical
   *  fallback). */
  productBarcode: string | null;
  quantity: number;
  unitOfMeasure: string;
  fromLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  async function receive() {
    setPending(true);
    setError(null);
    try {
      await completeTransferAction(transferId);
      setDone(true);
      // The action's own revalidatePath refreshes the table underneath -
      // this just closes the modal a beat later so "Received" is visible.
      setTimeout(() => setOpen(false), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete the return.');
    } finally {
      setPending(false);
    }
  }

  function tryMatch(scanned: string) {
    const { barcode: scannedBarcode } = parseScanPayload(scanned);
    if (!productBarcode || scannedBarcode !== productBarcode) {
      setError(
        productBarcode
          ? `That's not ${productSku} - expected barcode ${productBarcode}, scanned ${scannedBarcode}.`
          : `${productName} has no barcode on file, so a scan can never confirm it.`
      );
      return;
    }
    setError(null);
    void receive();
  }

  function handleManualSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!barcode.trim()) return;
    tryMatch(barcode.trim());
    setBarcode('');
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[0.8rem] font-semibold text-accent-strong hover:text-accent-hover"
      >
        Scan to receive
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Scan to receive"
          onClick={() => setOpen(false)}
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-accent/[0.14] bg-surface"
          >
            <div className="flex items-start justify-between gap-4 border-b border-accent/[0.14] px-5 py-4">
              <div>
                <h2 className="font-display text-[1.05rem] font-medium text-text">Scan to receive</h2>
                <p className="text-[0.83rem] text-text-muted">
                  {productSku} - {productName}
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close scan to receive"
                className="rounded-lg px-2 py-1 text-text-faint transition-colors hover:bg-neutral-soft hover:text-accent-strong"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3 px-5 py-4">
              <p className="text-[0.82rem] font-bold text-accent-strong">
                {quantity.toLocaleString()} {unitOfMeasure} returning from {fromLabel}
              </p>
              <p className="text-[0.78rem] text-text-faint">
                Scan (or type) the item&apos;s barcode to confirm it before completing the return.
              </p>

              {done ? (
                <p className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[0.85rem] font-semibold text-accent-strong">
                  Received - stock is back in Stores.
                </p>
              ) : (
                <>
                  <form onSubmit={handleManualSubmit} className="flex items-end gap-2">
                    <label className="flex flex-1 flex-col gap-1.5">
                      <span className="text-[0.75rem] font-semibold text-text-muted">Barcode</span>
                      <input
                        type="text"
                        autoComplete="off"
                        autoFocus
                        placeholder="Scan or type, then Enter"
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                        disabled={pending}
                        className={`${inputClass} font-mono-brand`}
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={pending}
                      className="h-9 rounded-lg border border-accent/30 bg-surface-2 px-3 py-1.5 text-[0.82rem] font-semibold text-accent-strong hover:bg-accent/10 disabled:opacity-60"
                    >
                      Match
                    </button>
                  </form>

                  <button
                    type="button"
                    onClick={() => setCameraOpen(true)}
                    disabled={pending}
                    className="flex h-11 w-full items-center justify-center rounded-lg bg-accent px-4 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
                  >
                    {pending ? 'Receiving…' : 'Scan with camera'}
                  </button>
                </>
              )}

              {error && (
                <p role="alert" className="text-[0.78rem] text-danger-text">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <CameraScanner open={cameraOpen} onOpenChange={setCameraOpen} hideTrigger onScan={tryMatch} />
    </>
  );
}
