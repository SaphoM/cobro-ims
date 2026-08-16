'use client';

import { useActionState, useRef, useState } from 'react';
import { signInAction, type SignInFormState } from '@/app/login/actions';
import { DEMO_ACCOUNTS } from '@/lib/demo-credentials';

const initialState: SignInFormState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function autofillDemo(index: number) {
    const account = DEMO_ACCOUNTS[index];
    setSelectedAccount(index);
    if (emailRef.current) emailRef.current.value = account.email;
    if (passwordRef.current) passwordRef.current.value = account.password;
    emailRef.current?.focus();
  }

  return (
    <main className="relative w-full max-w-[404px] rounded-[22px] border border-accent/[0.14] bg-gradient-to-b from-surface to-bg-2 px-9 pt-11 pb-8 shadow-[0_40px_80px_-32px_rgba(0,0,0,0.7)]">
      <div className="mb-1 flex flex-col items-center gap-3">
        <svg viewBox="-36 -20 72 40" className="h-11 w-11 overflow-visible" aria-hidden="true">
          <rect x="-30" y="1" width="28" height="14" rx="2" fill="none" stroke="var(--accent)" strokeOpacity="0.4" strokeWidth="2" />
          <rect x="-14" y="-15" width="28" height="14" rx="2" fill="var(--accent)" stroke="var(--ink)" strokeOpacity="0.25" strokeWidth="1" />
          <rect x="2" y="1" width="28" height="14" rx="2" fill="none" stroke="var(--accent)" strokeOpacity="0.7" strokeWidth="2" />
        </svg>
        <h1 className="flex items-center gap-2 font-display leading-none">
          <span className="text-[2.1rem] font-extrabold tracking-tight text-text">COBRO</span>
          <span className="translate-y-[-1px] rounded-full border border-accent/40 bg-surface-2 px-2.5 py-1 font-body text-[0.7rem] font-bold tracking-[0.14em] text-accent">
            IMS
          </span>
        </h1>
      </div>
      <p className="mb-6 text-center text-[0.92rem] text-text-muted">Sign in to manage your inventory.</p>

      <div className="mb-5 flex flex-col gap-2.5 rounded-xl border border-accent/[0.14] bg-surface-2 px-3.5 py-3">
        <span className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-text-faint">
          Demo accounts — pick a role to test RBAC
        </span>
        <div className="flex flex-wrap gap-1.5">
          {DEMO_ACCOUNTS.map((account, i) => (
            <button
              key={account.email}
              type="button"
              onClick={() => autofillDemo(i)}
              className={`rounded-full border px-2.5 py-1 text-[0.74rem] font-semibold transition-colors ${
                selectedAccount === i
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-accent/20 text-text-muted hover:border-accent/40 hover:text-text'
              }`}
            >
              {account.roleLabel}
            </button>
          ))}
        </div>
        <div className="flex items-baseline justify-between gap-3 text-[0.82rem] text-text-muted">
          <span>Email</span>
          <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono-brand text-[0.76rem] text-text">
            {DEMO_ACCOUNTS[selectedAccount].email}
          </code>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-[0.82rem] text-text-muted">
          <span>Password</span>
          <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono-brand text-[0.76rem] text-text">
            {DEMO_ACCOUNTS[selectedAccount].password}
          </code>
        </div>
      </div>

      {state.error && (
        <div
          role="alert"
          className="mb-4 rounded-[10px] border border-danger/40 bg-danger/10 px-3 py-2.5 text-[0.84rem] text-[#f3a99a]"
        >
          {state.error}
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-[17px]">
        <label className="flex flex-col gap-2">
          <span className="text-[0.8rem] font-semibold text-text-muted">Email address</span>
          <input
            ref={emailRef}
            type="email"
            name="email"
            placeholder="you@cobroconcrete.co.za"
            autoComplete="email"
            required
            className="w-full rounded-xl border border-accent/[0.14] bg-surface-2 px-3.5 py-3 text-[0.95rem] text-text placeholder:text-text-faint focus:border-accent focus:bg-surface-3 focus:outline-none focus:ring-[3px] focus:ring-accent/[0.18]"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-[0.8rem] font-semibold text-text-muted">Password</span>
            <a href="#" className="text-[0.8rem] text-text-faint hover:text-accent">
              Forgot password?
            </a>
          </span>
          <span className="relative flex">
            <input
              ref={passwordRef}
              type={showPassword ? 'text' : 'password'}
              name="password"
              placeholder="Enter your password"
              autoComplete="current-password"
              required
              className="w-full rounded-xl border border-accent/[0.14] bg-surface-2 px-3.5 py-3 pr-11 text-[0.95rem] text-text placeholder:text-text-faint focus:border-accent focus:bg-surface-3 focus:outline-none focus:ring-[3px] focus:ring-accent/[0.18]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute top-1/2 right-1.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-text-faint hover:bg-white/5 hover:text-text-muted"
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </span>
        </label>

        <label className="mt-0.5 flex items-center gap-2.5 text-[0.85rem] text-text-muted">
          <input type="checkbox" name="remember" className="h-4 w-4 accent-accent" />
          <span>Keep me signed in</span>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="mt-1 flex items-center justify-center gap-2 rounded-[13px] bg-accent px-5 py-3.5 font-body text-[0.95rem] font-bold text-ink transition-colors hover:bg-accent-hover active:bg-accent-active disabled:opacity-90"
        >
          {pending ? 'Signing in…' : 'Sign In'}
        </button>
      </form>

      <p className="mt-6 text-center text-[0.86rem] text-text-faint">
        Need access? <a href="#" className="font-semibold text-accent hover:underline">Contact your administrator</a>
      </p>
    </main>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A10.9 10.9 0 0 1 12 5c7 0 10.5 7 10.5 7a13.6 13.6 0 0 1-3.1 3.9M6.6 6.6C3.4 8.7 1.5 12 1.5 12s3.5 7 10.5 7a10.4 10.4 0 0 0 4.4-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}
