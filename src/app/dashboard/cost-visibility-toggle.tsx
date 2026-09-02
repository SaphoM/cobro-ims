'use client';

import { useState, useTransition } from 'react';
import { setCostVisibilityAction } from '@/app/dashboard/pricing-actions';

/**
 * Admin control for whether roles other than Admin can see money anywhere in
 * the app - prices, unit costs, weighted-average cost and stock values.
 *
 * Rendered only for users holding `manage_pricing`; the server action
 * re-checks that permission itself rather than trusting this, so hiding the
 * control is presentation, not the security boundary.
 */
export function CostVisibilityToggle({ initialShowToAll }: { initialShowToAll: boolean }) {
  const [showToAll, setShowToAll] = useState(initialShowToAll);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    // Optimistic, then reconciled: the switch is the kind of control that
    // feels broken if it lags, and the action reverts it on failure.
    setShowToAll(next);
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const res = await setCostVisibilityAction(next);
      if (res.error) {
        setShowToAll(!next);
        setError(res.error);
        return;
      }
      setMessage(res.success);
    });
  }

  return (
    <section className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
      <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">Price visibility</h2>
      <p className="mb-4 text-[0.83rem] text-text-muted">
        Controls whether every other role can see money in the app: product prices, unit costs,
        weighted-average cost and stock values. Administrators always see them.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/[0.14] bg-surface-2 px-4 py-3">
        <div>
          <div className="text-[0.88rem] font-semibold text-text">
            {showToAll ? 'Visible to every role' : 'Administrators only'}
          </div>
          <div className="text-[0.8rem] text-text-muted">
            {showToAll
              ? 'Clerks, procurement and viewers can see prices and costs.'
              : 'Everyone except administrators sees a placeholder instead of a figure.'}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={showToAll}
          aria-label="Show prices and costs to every role"
          disabled={pending}
          onClick={() => toggle(!showToAll)}
          className={`relative h-7 w-12 flex-none rounded-full border transition-colors disabled:opacity-60 ${
            showToAll ? 'border-accent bg-accent' : 'border-accent/30 bg-surface-3'
          }`}
        >
          <span
            className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition-all ${
              showToAll ? 'left-[26px] bg-ink' : 'left-[3px] bg-text-faint'
            }`}
          />
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[0.82rem] text-danger-text">
          {error}
        </p>
      )}
      {message && !error && (
        <p role="status" className="mt-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[0.82rem] text-accent-strong">
          {message}
        </p>
      )}
    </section>
  );
}
