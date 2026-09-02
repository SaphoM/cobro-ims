'use client';

import { useActionState } from 'react';
import { addBomLineAction, type AddBomLineFormState } from '@/app/dashboard/bom/actions';
import { inputClass, selectClass } from '@/lib/ui/form-control-classes';
import type { Product } from '@/lib/domain/inventory';

const initialState: AddBomLineFormState = { error: null, success: null };

export function AddComponentForm({ parentProductId, componentOptions }: { parentProductId: string; componentOptions: Product[] }) {
  const [state, formAction, pending] = useActionState(addBomLineAction, initialState);

  return (
    <div>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="parentProductId" value={parentProductId} />
        <label className="flex flex-1 min-w-[220px] flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Component product</span>
          <select name="componentProductId" required className={selectClass}>
            {componentOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} - {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Quantity per unit</span>
          <input type="number" name="quantity" min="0.001" step="0.001" required placeholder="0" className={`${inputClass} w-32`} />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg bg-accent px-5 py-1.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
        >
          {pending ? 'Adding…' : 'Add component'}
        </button>
      </form>
      {state.error && (
        <p role="alert" className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[0.82rem] text-danger-text">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="mt-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[0.82rem] text-accent-strong">
          {state.success}
        </p>
      )}
    </div>
  );
}
