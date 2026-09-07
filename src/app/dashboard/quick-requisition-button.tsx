'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { createSalesOrderAction, type SalesOrderFormState } from '@/app/dashboard/sales/actions';
import { inputClass, selectClass } from '@/lib/ui/form-control-classes';
import type { Customer } from '@/lib/domain/inventory';

const initialState: SalesOrderFormState = { error: null, success: null };

/**
 * A quick-requisition shortcut for one Store-by-location row.
 *
 * The full form on /dashboard/sales makes the requester pick Product and
 * Store from scratch every time, which is the right default there (you
 * might be requesting anything, from anywhere) but pure friction here,
 * where the row you're looking at already tells you both. This reuses the
 * exact same `createSalesOrderAction` - same validation, same "no stock
 * record here" guard, same server-side `create_requisitions` check - just
 * with Product/Store fixed to the row and only Department/Quantity/Unit
 * value left to fill in.
 *
 * Same fixed-overlay + flex-centered panel every other modal in this app
 * uses (see ReservedCell, ScanHelp) rather than the native <dialog>
 * element - <dialog>'s own centering relies on it being positioned against
 * the viewport, which breaks silently (renders pinned to a corner instead
 * of centered) the moment any ancestor establishes its own containing
 * block, which a dense table full of positioned/overflow wrappers like
 * this one easily does. This pattern has no such dependency.
 *
 * Rendered only for a session that holds `create_requisitions` (checked by
 * the server page, not here) and never for a row that's the viewer's own
 * station - see dashboard/page.tsx.
 */
export function QuickRequisitionButton({
  productId,
  productSku,
  productName,
  unitOfMeasure,
  availableQty,
  elsewhere,
  unitPrice,
  canEditPrice,
  warehouseId,
  warehouseLabel,
  customers,
}: {
  productId: string;
  productSku: string;
  productName: string;
  unitOfMeasure: string;
  /** This row's current on-hand quantity at the source location - shown
   *  next to Quantity so the requester sees the ceiling before typing a
   *  number, without needing to close the modal and go check the table
   *  underneath it. Purely informational: the actual guard against
   *  over-requesting happens where it always has, at Approve (reserving
   *  more than is on hand is refused there, not here). */
  availableQty: number;
  /** Every OTHER store and Engineer's station currently holding this
   *  product, sorted by quantity descending - a requester deciding where
   *  to source from needs the full picture (a store might be empty while
   *  a peer's station has plenty), not just this one row's number. Empty
   *  when nowhere else has any. */
  elsewhere: { warehouseId: string; label: string; qty: number }[];
  /** The catalogue's standing price for this product. Null when the
   *  product has no price set, or when this viewer isn't allowed to see
   *  costs at all (withheld at the source, not just hidden - see
   *  dashboard/page.tsx). */
  unitPrice: number | null;
  /** Only Admin (`manage_pricing`) can override this quick requisition's
   *  Unit value - everyone else gets the catalogue price as read-only
   *  display, submitted as-is. Setting requisition value is a pricing
   *  decision, the same authority that sets it on the catalogue itself. */
  canEditPrice: boolean;
  warehouseId: string;
  warehouseLabel: string;
  customers: Customer[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createSalesOrderAction, initialState);
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Requisition ${productSku} from ${warehouseLabel}`}
        aria-label={`Requisition ${productSku} from ${warehouseLabel}`}
        className="rounded-lg border border-accent/30 bg-surface-2 px-2.5 py-1 text-[0.74rem] font-semibold text-accent-strong transition-colors hover:bg-accent/10"
      >
        Requisition
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Quick requisition"
          onClick={() => setOpen(false)}
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          {/* Stop backdrop clicks from closing when they land inside the panel. */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-accent/[0.14] bg-surface"
          >
            <div className="flex items-start justify-between gap-4 border-b border-accent/[0.14] px-5 py-4">
              <div>
                <h2 className="font-display text-[1.05rem] font-medium text-text">Quick requisition</h2>
                <p className="text-[0.83rem] text-text-muted">
                  {productSku} - {productName} from {warehouseLabel}
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close quick requisition"
                className="rounded-lg px-2 py-1 text-text-faint transition-colors hover:bg-neutral-soft hover:text-accent-strong"
              >
                ✕
              </button>
            </div>

            <form ref={formRef} action={formAction} className="flex flex-col gap-3 px-5 py-4">
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="warehouseId" value={warehouseId} />

              <label className="flex flex-col gap-1.5">
                <span className="text-[0.75rem] font-semibold text-text-muted">Requesting department</span>
                <select name="customerId" required defaultValue="" className={selectClass}>
                  <option value="" disabled>
                    Choose a department…
                  </option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <p className={`text-[0.82rem] font-bold ${availableQty === 0 ? 'text-danger' : 'text-accent-strong'}`}>
                  {availableQty.toLocaleString()} {unitOfMeasure} available at {warehouseLabel}
                  {availableQty === 0 && ' - none on hand here'}
                </p>
                {elsewhere.length > 0 && (
                  <p className="mt-1 text-[0.78rem] text-text-faint">
                    Also on hand at{' '}
                    {elsewhere
                      .map((l) => `${l.label} (${l.qty.toLocaleString()} ${unitOfMeasure})`)
                      .join(', ')}
                    .
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[0.75rem] font-semibold text-text-muted">
                    Quantity ({unitOfMeasure})
                  </span>
                  <input
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
                    Unit value (R)
                    {unitPrice != null && (
                      <span className="ml-1 font-normal text-text-faint">from the catalogue</span>
                    )}
                  </span>
                  {canEditPrice ? (
                    <input
                      type="number"
                      name="unitPrice"
                      min="0"
                      step="0.01"
                      required
                      defaultValue={unitPrice != null ? unitPrice : undefined}
                      placeholder="0.00"
                      className={inputClass}
                    />
                  ) : (
                    <>
                      {/* Display-only for every role except Admin - setting
                          a requisition's value is a pricing decision, the
                          same authority `manage_pricing` already gates on
                          the catalogue itself. Still submitted with the
                          form via the hidden input below. Plain text, not
                          styled as a control, since there's nothing here to
                          interact with. */}
                      <div className="flex h-9 items-center text-[0.95rem] font-bold text-accent-strong">
                        {unitPrice != null ? `R ${unitPrice.toFixed(2)}` : 'No price set'}
                      </div>
                      <input type="hidden" name="unitPrice" value={unitPrice ?? 0} />
                    </>
                  )}
                </label>
              </div>

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
                  {pending ? 'Creating…' : 'Create requisition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
