'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { requestReturnToStoresAction, type RequestReturnFormState } from '@/app/dashboard/actions';
import { inputClass } from '@/lib/ui/form-control-classes';

const initialState: RequestReturnFormState = { error: null, success: null };

/**
 * "Return to Stores" on a Station-view row that is the VIEWER'S OWN
 * station (see stock-by-location-card.tsx - never rendered for a peer's
 * station or a Store row). Puts the chosen quantity in transit toward
 * Stores via `requestReturnToStoresAction` - the same underlying
 * inter-warehouse transfer Stores itself would raise, just originated by
 * the Engineer for their own stock. This is a REQUEST, not a return: the
 * stock leaves this station's on-hand immediately but does not become
 * available anywhere until Stores completes the transfer from
 * /dashboard/transfers - see that action's own doc comment.
 *
 * Same fixed-overlay modal every other quick action on this card uses (see
 * QuickRequisitionButton, ReserveButton) for the same reason: no dependency
 * on a native <dialog>'s viewport-relative centering inside this table's
 * positioned/overflow ancestors.
 */
export function ReturnToStoresButton({
  productId,
  productSku,
  productName,
  unitOfMeasure,
  returnableQty,
}: {
  productId: string;
  productSku: string;
  productName: string;
  unitOfMeasure: string;
  /** on-hand minus reserved at this station - reserved stock is already
   *  committed to a pending peer pickup and is not offered here (see the
   *  server action's own guard). Not rendered at all when this is 0. */
  returnableQty: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(requestReturnToStoresAction, initialState);
  const closeRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

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

  const lastHandledSuccess = useRef<string | null>(null);
  useEffect(() => {
    if (state.success && state.success !== lastHandledSuccess.current) {
      lastHandledSuccess.current = state.success;
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.success]);

  if (returnableQty <= 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Return ${productSku} to Stores`}
        aria-label={`Return ${productSku} to Stores`}
        className="rounded-lg border border-accent/30 bg-surface-2 px-2.5 py-1 text-[0.74rem] font-semibold text-accent-strong transition-colors hover:bg-accent/10"
      >
        Return to Stores
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Return to Stores"
          onClick={() => setOpen(false)}
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-accent/[0.14] bg-surface"
          >
            <div className="flex items-start justify-between gap-4 border-b border-accent/[0.14] px-5 py-4">
              <div>
                <h2 className="font-display text-[1.05rem] font-medium text-text">Return to Stores</h2>
                <p className="text-[0.83rem] text-text-muted">
                  {productSku} - {productName}
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close return to Stores"
                className="rounded-lg px-2 py-1 text-text-faint transition-colors hover:bg-neutral-soft hover:text-accent-strong"
              >
                ✕
              </button>
            </div>

            <form ref={formRef} action={formAction} className="flex flex-col gap-3 px-5 py-4">
              <input type="hidden" name="productId" value={productId} />

              <p className="text-[0.82rem] font-bold text-accent-strong">
                {returnableQty.toLocaleString()} {unitOfMeasure} returnable from your station
              </p>
              <p className="text-[0.78rem] text-text-faint">
                This puts the stock in transit toward Stores. It stops counting as stock you hold, but it only
                becomes available again once Stores confirms the physical return.
              </p>

              <label className="flex flex-col gap-1.5">
                <span className="text-[0.75rem] font-semibold text-text-muted">Quantity ({unitOfMeasure})</span>
                <input
                  type="number"
                  name="quantity"
                  min="0.001"
                  max={returnableQty}
                  step="0.001"
                  required
                  defaultValue={returnableQty}
                  className={inputClass}
                />
              </label>

              {state.error && (
                <p
                  role="alert"
                  className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[0.82rem] text-danger-text"
                >
                  {state.error}
                </p>
              )}

              <div className="mt-1 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-4 py-2 text-[0.85rem] font-semibold text-text-faint hover:text-text"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
                >
                  {pending ? 'Sending…' : 'Send to Stores'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
