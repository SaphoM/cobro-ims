'use client';

import { useState, useTransition } from 'react';
import {
  enrollMfaAction,
  verifyMfaEnrollmentAction,
  unenrollMfaAction,
} from '@/app/dashboard/security/actions';

type Props = {
  enrolled: boolean;
  factorId: string | null;
  isAal2: boolean;
};

export function MfaSetup({ enrolled, factorId, isAal2 }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState('');

  function beginEnrol() {
    setError(null);
    startTransition(async () => {
      const res = await enrollMfaAction();
      if (!res.ok) return setError(res.error);
      setSetup({ factorId: res.factorId, qrCode: res.qrCode, secret: res.secret });
    });
  }

  function verify() {
    if (!setup) return;
    setError(null);
    startTransition(async () => {
      const res = await verifyMfaEnrollmentAction(setup.factorId, code);
      if (!res.ok) return setError(res.error);
      setSetup(null);
      setCode('');
      // Refresh so the server component re-reads factor status (now verified).
      window.location.reload();
    });
  }

  function remove() {
    if (!factorId) return;
    setError(null);
    startTransition(async () => {
      const res = await unenrollMfaAction(factorId);
      if (!res.ok) return setError(res.error);
      window.location.reload();
    });
  }

  // ── Already enrolled ──────────────────────────────────────────────────────
  if (enrolled) {
    return (
      <div className="rounded-xl border border-accent/40 bg-accent/[0.08] p-4">
        <p className="mb-3 text-[0.85rem] text-accent-strong">
          Two-factor authentication is <strong>active</strong> on this account (real TOTP).
          {isAal2
            ? ' Your current session is verified — you can perform privileged actions your role allows.'
            : ' Sign in again and enter a code to verify this session before approving adjustments.'}
        </p>
        {error && <p className="mb-3 text-[0.82rem] text-danger-text">{error}</p>}
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="rounded-lg border border-danger/40 px-5 py-2.5 text-[0.85rem] font-semibold text-danger-text transition-colors hover:bg-danger/10 disabled:opacity-60"
        >
          {pending ? 'Removing…' : 'Remove 2FA'}
        </button>
      </div>
    );
  }

  // ── Mid-enrolment: show QR + secret + code entry ──────────────────────────
  if (setup) {
    const isDataUrl = setup.qrCode.startsWith('data:');
    return (
      <div className="rounded-xl border border-accent/[0.14] bg-surface-2 p-4">
        <p className="mb-3 text-[0.85rem] text-text-muted">
          Scan this QR code with an authenticator app (Google Authenticator, 1Password, Authy…),
          then enter the 6-digit code it shows to finish.
        </p>
        <div className="mb-3 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          <div className="rounded-lg bg-white p-2">
            {isDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={setup.qrCode} alt="TOTP QR code" width={168} height={168} />
            ) : (
              <div
                className="h-[168px] w-[168px] [&_svg]:h-full [&_svg]:w-full"
                // Supabase returns the QR as an inline SVG string in some versions.
                dangerouslySetInnerHTML={{ __html: setup.qrCode }}
              />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-text-faint">
              Or enter this secret manually
            </span>
            <code className="break-all rounded bg-surface-3 px-2 py-1 font-mono-brand text-[0.78rem] text-text">
              {setup.secret}
            </code>
          </div>
        </div>
        {error && <p className="mb-3 text-[0.82rem] text-danger-text">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            placeholder="123456"
            className="w-full rounded-lg border border-accent/[0.14] bg-surface px-3 py-2.5 text-center text-[1.05rem] tracking-[0.3em] text-text placeholder:tracking-normal focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/[0.18] sm:w-40"
          />
          <button
            type="button"
            onClick={verify}
            disabled={pending || code.length !== 6}
            className="rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? 'Verifying…' : 'Verify & enable'}
          </button>
        </div>
      </div>
    );
  }

  // ── Not enrolled ──────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-accent/[0.14] bg-surface-2 p-4">
      <p className="mb-3 text-[0.85rem] text-text-muted">
        Approving or rejecting write-offs and adjustments requires real two-factor authentication —
        it&apos;s the one action in the system that posts a stock-value change with no second approver.
        Set it up with any TOTP authenticator app.
      </p>
      {error && <p className="mb-3 text-[0.82rem] text-danger-text">{error}</p>}
      <button
        type="button"
        onClick={beginEnrol}
        disabled={pending}
        className="rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? 'Starting…' : 'Set up 2FA'}
      </button>
    </div>
  );
}
