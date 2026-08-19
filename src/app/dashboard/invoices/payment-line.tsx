'use client';

import { useActionState } from 'react';
import { recordPaymentAction, type RecordPaymentFormState } from '@/app/dashboard/invoices/actions';

const initialState: RecordPaymentFormState = { error: null, success: null };

export function PaymentLine({ invoiceId, outstanding }: { invoiceId: string; outstanding: number }) {
  const [state, formAction, pending] = useActionState(recordPaymentAction, initialState);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <input
          type="number"
          name="amount"
          min="0.01"
          max={outstanding}
          step="0.01"
          required
          placeholder={`up to R${outstanding.toFixed(2)}`}
          className="h-9 w-32 rounded-lg border border-accent/[0.14] bg-surface-2 px-2.5 py-1.5 text-right text-[0.82rem] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg bg-accent px-3 py-1.5 text-[0.78rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
        >
          {pending ? 'Recording…' : 'Record payment'}
        </button>
      </form>
      {state.error && <p className="text-[0.72rem] text-[#f3a99a]">{state.error}</p>}
      {state.success && <p className="text-[0.72rem] text-accent">{state.success}</p>}
    </div>
  );
}
