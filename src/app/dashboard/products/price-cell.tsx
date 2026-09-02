'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { setProductPriceAction, type PricingFormState } from '@/app/dashboard/pricing-actions';
import { HIDDEN_COST } from '@/lib/ui/cost-display';

const initialState: PricingFormState = { error: null, success: null };

/**
 * A product's price in the catalogue table: read-only text for everyone, and
 * an inline editor for anyone holding `manage_pricing`.
 *
 * `canEdit` only decides whether the editor renders. The server action
 * re-checks the permission on every submit, so this is presentation and not
 * the security boundary - a non-admin who forged the request still gets
 * refused.
 */
export function PriceCell({
  productId,
  sku,
  unitPrice,
  canEdit,
  costsVisible,
}: {
  productId: string;
  sku: string;
  unitPrice: number | null;
  canEdit: boolean;
  costsVisible: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(setProductPriceAction, initialState);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastHandled = useRef<string | null>(null);

  // Close only once the server confirms the save. Doing it optimistically at
  // submit time is what broke this before: unmounting the form cancels the
  // action it was dispatching.
  useEffect(() => {
    if (state.success && state.success !== lastHandled.current) {
      lastHandled.current = state.success;
      setEditing(false);
    }
  }, [state.success]);

  if (!costsVisible) {
    return (
      <span className="text-text-faint" title="Hidden by your administrator">
        {HIDDEN_COST}
      </span>
    );
  }

  const display =
    unitPrice === null ? <span className="text-text-faint">Not priced</span> : <>R {unitPrice.toFixed(2)}</>;

  if (!canEdit) return <span className="text-text-muted">{display}</span>;

  if (!editing) {
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="text-text">{display}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded px-1.5 py-0.5 text-[0.74rem] font-semibold text-accent-strong underline decoration-dotted underline-offset-4 hover:bg-accent/10"
        >
          Edit
        </button>
        {state.success && !state.error && (
          <span className="sr-only" role="status">
            {state.success}
          </span>
        )}
      </div>
    );
  }

  return (
    /*
      `action={formAction}` directly, not wrapped. An earlier version closed
      the editor inside the action callback, which unmounted this form in the
      same tick the action was dispatched and cancelled it - the price never
      saved. Closing is driven by the result instead (see the effect above).
    */
    <form action={formAction} className="flex items-center justify-end gap-1.5">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="_sku" value={sku} />
      <input
        ref={inputRef}
        name="unitPrice"
        type="number"
        min="0"
        step="0.01"
        autoFocus
        defaultValue={unitPrice ?? ''}
        placeholder="blank clears"
        disabled={pending}
        className="w-28 rounded-lg border border-accent/40 bg-surface-2 px-2 py-1 text-right text-[0.82rem] tabular-nums text-text focus:border-accent focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-2.5 py-1 text-[0.76rem] font-bold text-ink hover:bg-accent-hover disabled:opacity-60"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="rounded-lg border border-accent/30 px-2 py-1 text-[0.76rem] font-semibold text-text-muted hover:bg-neutral-soft"
      >
        ✕
      </button>
    </form>
  );
}
