'use client';

import { useActionState } from 'react';
import { receivePurchaseOrderAction, type ReceiveLineFormState } from '@/app/dashboard/purchase-orders/actions';

const initialState: ReceiveLineFormState = { error: null, success: null };

export function ReceiveLine({ poId, remaining, unit }: { poId: string; remaining: number; unit: string }) {
  const [state, formAction, pending] = useActionState(receivePurchaseOrderAction, initialState);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="poId" value={poId} />
        <input
          type="number"
          name="quantity"
          min="0.001"
          max={remaining}
          step="0.001"
          required
          placeholder={`up to ${remaining}`}
          className="w-28 rounded-lg border border-accent/[0.14] bg-surface-2 px-2.5 py-1.5 text-right text-[0.82rem] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-3 py-1.5 text-[0.78rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
        >
          {pending ? 'Posting…' : `Receive (${unit})`}
        </button>
      </form>
      {state.error && <p className="text-[0.72rem] text-[#f3a99a]">{state.error}</p>}
      {state.success && <p className="text-[0.72rem] text-accent">{state.success}</p>}
    </div>
  );
}
