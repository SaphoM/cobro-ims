'use client';

import { useEffect, useRef, useState } from 'react';
import { CameraScanner } from '@/components/scanner/camera-scanner';
import { parseScanPayload } from '@/lib/scan-payload';
import {
  getPendingReservationsAction,
  type PendingReservationsResult,
} from '@/app/dashboard/pending-reservation-actions';
import { confirmSalesOrderAction } from '@/app/dashboard/sales/actions';

/**
 * "Reserve" on a Stock by location row - only rendered when the row actually
 * has at least one pending (draft) requisition against it (see
 * `pendingCount` in stock-by-location-card.tsx, computed server-side in
 * dashboard/page.tsx). Opens a panel listing every requisition waiting on
 * this product/store - same "list of holders" shape as the existing
 * ReservedCell, just for requisitions not yet approved rather than ones
 * already reserved - each with its own "Scan to reserve".
 *
 * The scan exists to confirm Stores is actually looking at the right item
 * before reserving it, not to identify WHICH item (the row already fixed
 * that): a decoded code is read back to its barcode with the same
 * `parseScanPayload` every other scan point uses, then compared to this
 * product's own barcode. A match calls the existing `confirmSalesOrderAction`
 * - the SAME action /dashboard/sales's own Approve button uses, so there is
 * one reservation code path, not two. A mismatch refuses with an error and
 * reserves nothing, same as every other "wrong item scanned" moment in this
 * app (e.g. GRN's matchBarcode) - it does not fall back to reserving anyway.
 */
export function ReserveButton({ productId, warehouseId }: { productId: string; warehouseId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PendingReservationsResult | null>(null);
  const [scanningOrderId, setScanningOrderId] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, { error: string | null; pending: boolean }>>({});
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

  async function openPanel() {
    setOpen(true);
    setLoading(true);
    try {
      setData(await getPendingReservationsAction(productId, warehouseId));
    } finally {
      setLoading(false);
    }
  }

  async function handleScan(value: string) {
    const orderId = scanningOrderId;
    setScanningOrderId(null);
    if (!orderId || !data) return;

    const { barcode: scannedBarcode } = parseScanPayload(value);
    if (!data.productBarcode || scannedBarcode !== data.productBarcode) {
      setRowState((s) => ({
        ...s,
        [orderId]: {
          pending: false,
          error: data.productBarcode
            ? `That's not ${data.productName} - expected barcode ${data.productBarcode}, scanned ${scannedBarcode}.`
            : `${data.productName} has no barcode on file, so a scan can never confirm it - reserve from Requisitions instead.`,
        },
      }));
      return;
    }

    setRowState((s) => ({ ...s, [orderId]: { pending: true, error: null } }));
    const result = await confirmSalesOrderAction(orderId, { error: null, success: null }, new FormData());
    if (result.error) {
      setRowState((s) => ({ ...s, [orderId]: { pending: false, error: result.error } }));
      return;
    }
    // Reserved - this order no longer belongs in a PENDING list.
    setData((d) => (d ? { ...d, requisitions: d.requisitions.filter((r) => r.orderId !== orderId) } : d));
  }

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className="rounded-lg border border-accent/30 bg-surface-2 px-2.5 py-1 text-[0.74rem] font-semibold text-accent-strong transition-colors hover:bg-accent/10"
      >
        Reserve
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Reserve stock"
          onClick={() => setOpen(false)}
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 text-left"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-accent/[0.14] bg-surface"
          >
            <div className="flex items-start justify-between gap-4 border-b border-accent/[0.14] px-5 py-4">
              <div>
                <h2 className="font-display text-[1.05rem] font-medium text-text">Reserve stock</h2>
                <p className="text-[0.83rem] text-text-muted">
                  {loading || !data?.ok ? 'Requisitions waiting on this item.' : `${data.productName}`}
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close reserve stock"
                className="rounded-lg px-2 py-1 text-text-faint transition-colors hover:bg-neutral-soft hover:text-accent-strong"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4">
              {loading && <p className="text-[0.85rem] text-text-muted">Loading…</p>}
              {!loading && data && !data.ok && (
                <p className="text-[0.85rem] text-danger-text">{data.message}</p>
              )}
              {!loading && data?.ok && data.requisitions.length === 0 && (
                <p className="text-[0.85rem] text-text-faint">
                  Nothing left pending on this item - every requisition that was waiting has been reserved.
                </p>
              )}
              {!loading && data?.ok && data.requisitions.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {data.requisitions.map((r) => {
                    const row = rowState[r.orderId];
                    return (
                      <li key={r.orderId} className="rounded-xl border border-accent/[0.14] bg-surface-2 px-4 py-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-mono-brand text-[0.85rem] font-semibold text-accent-strong">
                            {r.orderNumber}
                          </span>
                          <span className="text-[0.85rem] font-semibold text-text">
                            {r.quantity.toLocaleString()} {data.unitOfMeasure}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-col gap-0.5 text-[0.8rem] text-text-muted">
                          <span>
                            Requested by <span className="text-text">{r.departmentName}</span>
                          </span>
                          <span>
                            Raised by <span className="text-text">{r.requestedByName}</span>
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setScanningOrderId(r.orderId)}
                          disabled={row?.pending}
                          className="mt-2.5 flex h-11 w-full items-center justify-center rounded-lg bg-accent px-4 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
                        >
                          {row?.pending ? 'Reserving…' : 'Scan to reserve'}
                        </button>
                        {row?.error && (
                          <p role="alert" className="mt-1.5 text-[0.76rem] text-danger-text">
                            {row.error}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* One shared, controlled scanner for whichever row's "Scan to
          reserve" was clicked - never more than one live camera stream at
          once, same reasoning as the Overview's own single controlled
          CameraScanner (scan-movement.tsx). */}
      <CameraScanner
        open={scanningOrderId !== null}
        onOpenChange={(next) => {
          if (!next) setScanningOrderId(null);
        }}
        hideTrigger
        onScan={handleScan}
      />
    </>
  );
}
