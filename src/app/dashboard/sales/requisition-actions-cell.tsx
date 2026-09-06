'use client';

import { useActionState } from 'react';
import {
  cancelSalesOrderAction,
  confirmSalesOrderAction,
  dispatchSalesOrderAction,
  type RequisitionActionState,
} from '@/app/dashboard/sales/actions';
import type { SalesOrderStatus } from '@/lib/domain/inventory';

const initialState: RequisitionActionState = { error: null, success: null };

/**
 * Approve / Issue / Cancel for one requisition row.
 *
 * These were plain `<form action={boundServerAction}>` buttons that returned
 * void. Anything the repository threw - most obviously "Not enough available
 * stock to reserve that quantity" when approving more than is on hand - went
 * unhandled and replaced the entire page with a server-error screen. Since
 * approving more than you have is a normal mistake rather than an
 * exceptional one, the message needs to land next to the row that caused it.
 *
 * Each action gets its own `useActionState` so a failure on Approve cannot
 * show up as though it came from Cancel.
 */
export function RequisitionActionsCell({
  orderId,
  status,
  canApprove,
  canAccept,
  acceptLabel = 'Issue',
  canCancel,
}: {
  orderId: string;
  status: SalesOrderStatus;
  /** Stores/Admin (any store-sourced requisition), or the owning Engineer
   *  when this one is sourced from their own station (a peer pickup). */
  canApprove: boolean;
  /** Stores/Admin, or this requisition's own requester accepting/picking
   *  up their own approved stock. */
  canAccept: boolean;
  /** "Accept" for the requester's own row, "Issue" for everyone else - same
   *  underlying action, different label depending on who's looking. */
  acceptLabel?: 'Issue' | 'Accept';
  /** Stores/Admin any time, or the requester themselves while still draft. */
  canCancel: boolean;
}) {
  const [approveState, approve, approving] = useActionState(
    confirmSalesOrderAction.bind(null, orderId),
    initialState
  );
  const [issueState, issue, issuing] = useActionState(
    dispatchSalesOrderAction.bind(null, orderId),
    initialState
  );
  const [cancelState, cancel, cancelling] = useActionState(
    cancelSalesOrderAction.bind(null, orderId),
    initialState
  );

  const error = approveState.error ?? issueState.error ?? cancelState.error;
  const busy = approving || issuing || cancelling;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex justify-end gap-3">
        {status === 'draft' && canApprove && (
          <form action={approve}>
            <button
              type="submit"
              disabled={busy}
              className="text-[0.8rem] font-semibold text-accent-strong hover:text-accent-hover disabled:opacity-60"
            >
              {approving ? 'Approving…' : 'Approve'}
            </button>
          </form>
        )}
        {status === 'confirmed' && canAccept && (
          <form action={issue}>
            <button
              type="submit"
              disabled={busy}
              className="text-[0.8rem] font-semibold text-accent-strong hover:text-accent-hover disabled:opacity-60"
            >
              {issuing ? `${acceptLabel === 'Accept' ? 'Accepting' : 'Issuing'}…` : acceptLabel}
            </button>
          </form>
        )}
        {(status === 'draft' || status === 'confirmed') && canCancel && (
          <form action={cancel}>
            <button
              type="submit"
              disabled={busy}
              className="text-[0.8rem] font-semibold text-text-faint hover:text-danger disabled:opacity-60"
            >
              Cancel
            </button>
          </form>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="max-w-[22rem] rounded-lg border border-danger/40 bg-danger/10 px-2.5 py-1.5 text-left text-[0.76rem] leading-snug text-danger-text"
        >
          {error}
        </p>
      )}
    </div>
  );
}
