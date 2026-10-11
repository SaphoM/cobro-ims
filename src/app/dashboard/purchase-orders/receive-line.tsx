'use client';

import { useActionState } from 'react';
import { receivePurchaseOrderAction, type ReceiveLineFormState } from '@/app/dashboard/purchase-orders/actions';
import { PACKAGING_UOM_LABELS } from '@/lib/uom';

const initialState: ReceiveLineFormState = { error: null, success: null };

export function ReceiveLine({
  poId,
  remaining,
  unit,
  packagingUom,
  qtyPerPackage,
}: {
  poId: string;
  remaining: number;
  unit: string;
  packagingUom: string | null;
  qtyPerPackage: number | null;
}) {
  const [state, formAction, pending] = useActionState(receivePurchaseOrderAction, initialState);
  const hasPackaging = !!(packagingUom && qtyPerPackage);
  const pkgLabel = packagingUom ? (PACKAGING_UOM_LABELS[packagingUom] ?? packagingUom) : '';

  return (
    <div className="flex flex-col items-end gap-1.5">
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="poId" value={poId} />
        <label className="flex flex-col items-end gap-0.5">
          <span className="text-[0.7rem] font-semibold text-text-muted">Qty ({unit})</span>
          <input
            type="number"
            name="quantity"
            min="0.001"
            max={remaining}
            step="0.001"
            required
            placeholder={`up to ${remaining}`}
            className="h-9 w-28 rounded-lg border border-accent/[0.14] bg-surface-2 px-2.5 py-1.5 text-right text-[0.82rem] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg bg-accent px-3 py-1.5 text-[0.78rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
        >
          {pending ? 'Posting…' : 'Receive'}
        </button>
      </form>
      {hasPackaging && (
        <p className="text-[0.7rem] text-text-faint">
          Individual {unit}s — {qtyPerPackage} = 1 {pkgLabel}
        </p>
      )}
      {state.error && <p className="text-[0.72rem] text-danger-text">{state.error}</p>}
      {state.success && <p className="text-[0.72rem] text-accent-strong">{state.success}</p>}
    </div>
  );
}
