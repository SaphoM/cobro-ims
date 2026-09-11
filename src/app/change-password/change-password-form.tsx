'use client';

import { useActionState } from 'react';
import { changePasswordAction, type ChangePasswordState } from '@/app/change-password/actions';

const initialState: ChangePasswordState = { error: null };

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);

  return (
    <main className="relative w-full max-w-[404px] rounded-[22px] border border-accent/[0.14] bg-gradient-to-b from-surface to-bg-2 px-9 pt-11 pb-8 card-shadow">
      <h1 className="mb-1 text-center font-display text-[1.3rem] font-medium text-text">Set your password</h1>
      <p className="mb-6 text-center text-[0.9rem] text-text-muted">
        You&apos;re signing in with a temporary password. Choose your own password to continue.
      </p>

      {state.error && (
        <div
          role="alert"
          className="mb-4 rounded-[10px] border border-danger/40 bg-danger/10 px-3 py-2.5 text-[0.84rem] text-danger-text"
        >
          {state.error}
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-[17px]">
        <label className="flex flex-col gap-2">
          <span className="text-[0.8rem] font-semibold text-text-muted">New password</span>
          <input
            type="password"
            name="newPassword"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="At least 8 characters"
            className="w-full rounded-xl border border-accent/[0.14] bg-surface-2 px-3.5 py-3 text-[0.95rem] text-text placeholder:text-text-faint focus:border-accent focus:bg-surface-3 focus:outline-none focus:ring-[3px] focus:ring-accent/[0.18]"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-[0.8rem] font-semibold text-text-muted">Confirm new password</span>
          <input
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="Re-enter your new password"
            className="w-full rounded-xl border border-accent/[0.14] bg-surface-2 px-3.5 py-3 text-[0.95rem] text-text placeholder:text-text-faint focus:border-accent focus:bg-surface-3 focus:outline-none focus:ring-[3px] focus:ring-accent/[0.18]"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="mt-1 flex items-center justify-center gap-2 rounded-[13px] bg-accent px-5 py-3.5 font-body text-[0.95rem] font-bold text-ink transition-colors hover:bg-accent-hover active:bg-accent-active disabled:opacity-90"
        >
          {pending ? 'Saving…' : 'Save password & continue'}
        </button>
      </form>
    </main>
  );
}
