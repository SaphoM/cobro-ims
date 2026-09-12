'use client';

import Image from 'next/image';
import { useActionState, useRef, useState } from 'react';
import { signInAction, verifyLoginMfaAction, type SignInFormState } from '@/app/login/actions';

const initialState: SignInFormState = { error: null, mfaRequired: false, next: null };

export function LoginForm({
  next,
  startInMfaStep = false,
}: {
  next?: string | null;
  /** True when the page already holds a password-verified session that still
   *  needs the second factor — the form opens straight on the code step. */
  startInMfaStep?: boolean;
}) {
  const [state, formAction, pending] = useActionState(signInAction, initialState);
  const [mfaState, mfaAction, mfaPending] = useActionState(verifyLoginMfaAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Swap the whole form over to the TOTP challenge once the password step
  // reports MFA is required, or when we arrived already mid-step-up.
  const inMfaStep = state.mfaRequired || startInMfaStep;
  const activeError = inMfaStep ? mfaState.error : state.error;

  return (
    <main className="relative w-full max-w-[404px] rounded-[22px] border border-accent/[0.14] bg-gradient-to-b from-surface to-bg-2 px-9 pt-11 pb-8 card-shadow">
      <div className="mb-1 flex flex-col items-center">
        {/* Cobro's supplied lockup. `brand-logo` inverts it on dark only. */}
        <h1 className="flex justify-center">
          {/* Dark-mode logo — change h-[...] w-[...] here only; does not affect light mode */}
          <span className="logo-dark relative block h-[128px] w-[160px]">
            <Image
              src="/brc-logo.png"
              alt="BRC"
              fill
              sizes="160px"
              priority
              className="object-contain"
            />
          </span>
          {/* Light-mode logo — change h-[...] w-[...] here only; does not affect dark mode */}
          <span className="logo-light relative block h-[168px] w-[220px]">
            <Image
              src="/brc-logo-light.png"
              alt="BRC"
              fill
              sizes="190px"
              priority
              className="object-contain"
            />
          </span>
        </h1>
      </div>
      <p className="mb-6 text-center text-[0.92rem] text-text-muted">
        {inMfaStep ? 'Enter the 6-digit code from your authenticator app.' : 'Sign in to manage your inventory.'}
      </p>

      {activeError && (
        <div
          role="alert"
          className="mb-4 rounded-[10px] border border-danger/40 bg-danger/10 px-3 py-2.5 text-[0.84rem] text-danger-text"
        >
          {activeError}
        </div>
      )}

      {inMfaStep ? (
        <form action={mfaAction} className="flex flex-col gap-[17px]">
          {next && <input type="hidden" name="next" value={next} />}
          <label className="flex flex-col gap-2">
            <span className="text-[0.8rem] font-semibold text-text-muted">Two-factor code</span>
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="123456"
              required
              autoFocus
              className="w-full rounded-xl border border-accent/[0.14] bg-surface-2 px-3.5 py-3 text-center text-[1.2rem] tracking-[0.4em] text-text placeholder:text-text-faint placeholder:tracking-normal focus:border-accent focus:bg-surface-3 focus:outline-none focus:ring-[3px] focus:ring-accent/[0.18]"
            />
          </label>
          <button
            type="submit"
            disabled={mfaPending}
            className="mt-1 flex items-center justify-center gap-2 rounded-[13px] bg-accent px-5 py-3.5 font-body text-[0.95rem] font-bold text-ink transition-colors hover:bg-accent-hover active:bg-accent-active disabled:opacity-90"
          >
            {mfaPending ? 'Verifying…' : 'Verify & continue'}
          </button>
        </form>
      ) : (
        <form action={formAction} className="flex flex-col gap-[17px]">
          {next && <input type="hidden" name="next" value={next} />}
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
              <a href="#" className="text-[0.8rem] text-text-faint hover:text-accent-strong">
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
                className="absolute top-1/2 right-1.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-text-faint hover:bg-neutral-soft hover:text-text-muted"
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
      )}

      <p className="mt-6 text-center text-[0.86rem] text-text-faint">
        Need access? <a href="#" className="font-semibold text-accent-strong hover:underline">Contact your administrator</a>
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
