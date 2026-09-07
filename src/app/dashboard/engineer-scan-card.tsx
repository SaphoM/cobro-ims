'use client';

import { useState } from 'react';
import { CameraScanner } from '@/components/scanner/camera-scanner';
import { findMyCheckoutAction, type CheckoutMatch } from '@/app/dashboard/engineer-checkout-actions';
import { dispatchSalesOrderAction } from '@/app/dashboard/sales/actions';
import { postScanAction } from '@/app/dashboard/scan/actions';

/**
 * Replaces RecordMovementForm on an Engineer's Overview - that card's
 * Product/Store/Type/Quantity dropdowns let an Engineer pick ANY movement
 * type, but `recordMovementAction` gates every one of them behind a Stores
 * permission (`manage_receiving`/`manage_sales_orders`/`manage_transfers`/
 * `approve_adjustments`) an Engineer never holds - so in practice every
 * submission from that card was already being rejected. This is the two
 * things an Engineer can actually do, both already real, ownership-checked
 * write paths elsewhere in the app - just not previously reachable from a
 * single scan:
 *
 *   - "Scan out" - collect stock from an approved requisition (docs/
 *     ARCHITECTURE.md's "Engineer stations" section literally documents
 *     this as "engineer comes and scans to accept stock items", which the
 *     click-only "Accept" on /dashboard/sales never actually delivered).
 *     Resolves the scanned barcode to one of THIS Engineer's own confirmed
 *     requisitions (engineer-checkout-actions.ts), shows what it's about to
 *     do, then calls the existing `dispatchSalesOrderAction` on confirm -
 *     the same action /dashboard/sales's own Accept button calls.
 *   - "Scan to Use" - record stock already on this Engineer's own station
 *     as used. Calls the existing `postScanAction({direction: 'use'})` -
 *     the same ownership-checked, negative-stock-guarded action
 *     /dashboard/scan's "Use" mode already posts, just not previously wired
 *     to any reachable page. Posts immediately on a matching scan, same as
 *     that mode already does - no separate confirmation step, because none
 *     exists in the workflow this is reusing.
 *
 * Two different `<CameraScanner>` triggers, ONE shared controlled instance -
 * same reasoning as every other single-camera screen in this app
 * (scan-movement.tsx, ReserveButton): there is only ever one physical
 * camera stream to hold, so `mode` decides what the next scan means rather
 * than mounting two independent scanners that would fight over it.
 */
export function EngineerScanCard({
  myStationId,
  myStationLabel,
}: {
  myStationId: string;
  myStationLabel: string;
}) {
  const [mode, setMode] = useState<'checkout' | 'use' | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [pendingCheckout, setPendingCheckout] = useState<CheckoutMatch | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutDone, setCheckoutDone] = useState<string | null>(null);
  const [useBusy, setUseBusy] = useState(false);
  const [useResult, setUseResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleCheckoutScan(value: string) {
    setMode(null);
    setCheckoutError(null);
    setCheckoutDone(null);
    const match = await findMyCheckoutAction(value);
    if (!match.ok) {
      setCheckoutError(match.message);
      return;
    }
    setPendingCheckout(match);
  }

  async function confirmCheckout() {
    if (!pendingCheckout) return;
    setCheckoutBusy(true);
    try {
      const result = await dispatchSalesOrderAction(pendingCheckout.orderId, { error: null, success: null }, new FormData());
      if (result.error) {
        setCheckoutError(result.error);
        setPendingCheckout(null);
        return;
      }
      setCheckoutDone(
        `Checked out ${pendingCheckout.quantity.toLocaleString()} ${pendingCheckout.unitOfMeasure} of ${pendingCheckout.productSku} to ${myStationLabel}.`
      );
      setPendingCheckout(null);
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function handleUseScan(value: string) {
    setMode(null);
    setUseBusy(true);
    setUseResult(null);
    try {
      const result = await postScanAction({ barcode: value, direction: 'use', warehouseId: myStationId, quantity: 1 });
      setUseResult({ ok: result.ok, message: result.message });
    } finally {
      setUseBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
      <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">Stock at {myStationLabel}</h2>
      <p className="mb-4 text-[0.83rem] text-text-muted">
        Two different scans for two different things: <strong className="text-text">Scan out</strong> collects
        stock from an approved requisition into your station; <strong className="text-text">Scan to
        Use</strong> records stock already on your station as used.
      </p>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setMode('checkout')}
          className="flex h-11 w-full max-w-[200px] flex-1 items-center justify-center rounded-lg border border-accent/30 bg-surface-2 px-4 text-[0.88rem] font-bold text-accent-strong transition-colors hover:bg-accent/10"
        >
          Scan out
        </button>
        <button
          type="button"
          onClick={() => setMode('use')}
          className="flex h-11 w-full max-w-[200px] flex-1 items-center justify-center rounded-lg bg-accent px-4 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover"
        >
          Scan to Use
        </button>
      </div>

      {checkoutError && (
        <p role="alert" className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[0.82rem] text-danger-text">
          {checkoutError}
        </p>
      )}
      {checkoutDone && (
        <p role="status" className="mt-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[0.82rem] text-accent-strong">
          {checkoutDone}
        </p>
      )}
      {useResult && (
        <p
          role={useResult.ok ? 'status' : 'alert'}
          className={`mt-3 rounded-lg border px-3 py-2 text-[0.82rem] ${
            useResult.ok
              ? 'border-accent/40 bg-accent/10 text-accent-strong'
              : 'border-danger/40 bg-danger/10 text-danger-text'
          }`}
        >
          {useBusy ? 'Recording…' : useResult.message}
        </p>
      )}

      {/* "What you're about to do" - only Checkout needs this: a scan
          resolves to one of several possible requisitions (ambiguity Use
          doesn't have, since a Use scan only ever means "record this one
          product used here"), so this is the one place confirming before
          committing actually adds something. */}
      {pendingCheckout && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm checkout"
          onClick={() => setPendingCheckout(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-accent/[0.14] bg-surface p-5"
          >
            <h3 className="font-display text-[1.05rem] font-medium text-text">Check out stock</h3>
            <div className="mt-3 rounded-xl border border-accent/[0.14] bg-surface-2 px-4 py-3 text-[0.85rem]">
              <div className="font-semibold text-text">{pendingCheckout.productName}</div>
              <div className="font-mono-brand text-[0.75rem] text-text-faint">{pendingCheckout.productSku}</div>
              <div className="mt-2 flex flex-col gap-1 text-text-muted">
                <span>
                  Quantity:{' '}
                  <span className="font-semibold text-text">
                    {pendingCheckout.quantity.toLocaleString()} {pendingCheckout.unitOfMeasure}
                  </span>
                </span>
                <span>
                  From: <span className="font-semibold text-text">{pendingCheckout.fromLabel}</span>
                </span>
                <span>
                  To: <span className="font-semibold text-text">{myStationLabel}</span>
                </span>
                <span>
                  Requisition: <span className="font-mono-brand text-text">{pendingCheckout.orderNumber}</span>
                </span>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingCheckout(null)}
                className="rounded-lg px-4 py-2 text-[0.85rem] font-semibold text-text-faint hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmCheckout()}
                disabled={checkoutBusy}
                className="rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                {checkoutBusy ? 'Checking out…' : 'Confirm Checkout'}
              </button>
            </div>
          </div>
        </div>
      )}

      <CameraScanner
        open={mode !== null}
        onOpenChange={(next) => {
          if (!next) setMode(null);
        }}
        hideTrigger
        onScan={(value) => {
          if (mode === 'checkout') void handleCheckoutScan(value);
          else if (mode === 'use') void handleUseScan(value);
        }}
      />
    </div>
  );
}
