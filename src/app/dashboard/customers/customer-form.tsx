'use client';

import { useActionState } from 'react';
import { createCustomerAction, type CustomerFormState } from '@/app/dashboard/customers/actions';

const initialState: CustomerFormState = { error: null, success: null };
const inputClass =
  'rounded-lg border border-accent/[0.14] bg-surface-2 px-3 py-2.5 text-[0.88rem] text-text placeholder:text-text-faint focus:border-accent focus:outline-none';

export function CustomerForm() {
  const [state, formAction, pending] = useActionState(createCustomerAction, initialState);

  return (
    <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
      <h2 className="mb-4 font-display text-[1.05rem] font-medium text-text">Add a customer</h2>
      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1.5 lg:col-span-2">
          <span className="text-[0.75rem] font-semibold text-text-muted">Name</span>
          <input name="name" required placeholder="Thabo Construction" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Contact email</span>
          <input type="email" name="contactEmail" placeholder="Optional" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Contact phone</span>
          <input name="contactPhone" placeholder="Optional" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 lg:col-span-4">
          <span className="text-[0.75rem] font-semibold text-text-muted">Address</span>
          <input name="address" placeholder="Optional" className={inputClass} />
        </label>
        <div className="flex items-end lg:col-span-4">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
          >
            {pending ? 'Adding…' : 'Add customer'}
          </button>
        </div>
      </form>
      {state.error && (
        <p role="alert" className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[0.82rem] text-[#f3a99a]">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="mt-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[0.82rem] text-accent">
          {state.success}
        </p>
      )}
    </div>
  );
}
