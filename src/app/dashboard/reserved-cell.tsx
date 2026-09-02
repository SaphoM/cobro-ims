'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getReservationDetailAction,
  type ReservationDetail,
} from '@/app/dashboard/reserved-actions';

/**
 * The "Reserved" figure in the Store ledger, as a click-through.
 *
 * A bare number here is the least useful cell on the page: it tells you
 * stock is spoken for but not by whom, so the follow-up is always a trip to
 * the Requisitions page to work it out by hand. Clicking resolves it to the
 * actual approved requisitions holding that stock, the department that asked
 * and who raised it.
 *
 * Rows with nothing reserved render as plain text - there is no panel worth
 * opening for a zero, and making them look clickable would be a lie.
 */
export function ReservedCell({
  productId,
  warehouseId,
  quantityReserved,
}: {
  productId: string;
  warehouseId: string;
  quantityReserved: number;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ReservationDetail | null>(null);
  const [loading, setLoading] = useState(false);
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
      setDetail(await getReservationDetailAction(productId, warehouseId, quantityReserved));
    } finally {
      setLoading(false);
    }
  }

  if (quantityReserved <= 0) {
    return <span className="text-text-muted">0</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        title="See which requisitions hold this stock"
        className="rounded px-1.5 py-0.5 font-semibold text-accent-strong underline decoration-dotted underline-offset-4 transition-colors hover:bg-accent/10"
      >
        {quantityReserved.toLocaleString()}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Reserved stock detail"
          onClick={() => setOpen(false)}
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 text-left"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-accent/[0.14] bg-surface"
          >
            <div className="flex items-start justify-between gap-4 border-b border-accent/[0.14] px-5 py-4">
              <div>
                <h2 className="font-display text-[1.05rem] font-medium text-text">Reserved stock</h2>
                <p className="text-[0.83rem] text-text-muted">
                  {loading || !detail?.ok
                    ? 'Who this stock is promised to.'
                    : `${detail.productSku} at ${detail.warehouseCode}`}
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close reserved stock detail"
                className="rounded-lg px-2 py-1 text-text-faint transition-colors hover:bg-neutral-soft hover:text-accent-strong"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4">
              {loading && <p className="text-[0.85rem] text-text-muted">Loading…</p>}

              {!loading && detail && !detail.ok && (
                <p className="text-[0.85rem] text-danger-text">{detail.message}</p>
              )}

              {!loading && detail?.ok && (
                <div className="flex flex-col gap-4">
                  <div className="rounded-xl border border-accent/[0.14] bg-surface-2 p-4">
                    <div className="text-[0.9rem] font-semibold text-text">
                      {detail.productName}
                    </div>
                    <div className="font-mono-brand text-[0.75rem] text-text-faint">
                      {detail.productSku}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-[0.83rem]">
                      <span className="text-text-muted">
                        Location:{' '}
                        <span className="text-text">
                          {detail.warehouseCode} - {detail.warehouseName}
                        </span>
                      </span>
                      <span className="text-text-muted">
                        Reserved:{' '}
                        <span className="font-semibold text-text">
                          {detail.totalReserved.toLocaleString()} {detail.unitOfMeasure}
                        </span>
                      </span>
                    </div>
                    <p className="mt-3 border-t border-accent/[0.08] pt-3 text-[0.8rem] leading-relaxed text-text-muted">
                      Reserved stock is still physically on the shelf and still counted in on-hand
                      and stock value. It is promised to an approved requisition, so it should not
                      be issued to anyone else.
                    </p>
                  </div>

                  {detail.holders.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-[0.78rem] font-semibold uppercase tracking-wide text-text-faint">
                        Held by {detail.holders.length} requisition
                        {detail.holders.length === 1 ? '' : 's'}
                      </h3>
                      <ul className="flex flex-col gap-2">
                        {detail.holders.map((h) => (
                          <li
                            key={h.orderNumber}
                            className="rounded-xl border border-accent/[0.14] bg-surface-2 px-4 py-3"
                          >
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <span className="font-mono-brand text-[0.85rem] font-semibold text-accent-strong">
                                {h.orderNumber}
                              </span>
                              <span className="text-[0.85rem] font-semibold text-text">
                                {h.quantity.toLocaleString()} {detail.unitOfMeasure}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-col gap-0.5 text-[0.8rem] text-text-muted">
                              <span>
                                Requested by <span className="text-text">{h.departmentName}</span>
                              </span>
                              <span>
                                Raised by <span className="text-text">{h.requestedByName}</span>
                                {h.confirmedAt
                                  ? `, approved ${new Date(h.confirmedAt).toLocaleString('en-ZA')}`
                                  : ''}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {detail.unattributed > 0 && (
                    <div className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-[0.82rem] leading-relaxed text-text-muted">
                      <span className="font-semibold text-text">
                        {detail.unattributed.toLocaleString()} {detail.unitOfMeasure}
                      </span>{' '}
                      {detail.holders.length > 0 ? 'of this reservation has' : 'is reserved but has'}{' '}
                      no requisition behind it. That is opening-balance data seeded onto the ledger
                      when the demo dataset was built, not a reservation raised through the app.
                      Anything reserved from here on carries its requisition with it and will be
                      listed above.
                    </div>
                  )}

                  <a
                    href="/dashboard/sales"
                    className="text-[0.83rem] text-accent-strong hover:underline"
                  >
                    Open Requisitions →
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
