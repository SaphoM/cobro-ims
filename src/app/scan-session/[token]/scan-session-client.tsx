'use client';

import { useState } from 'react';
import { CameraScanner } from '@/components/scanner/camera-scanner';
import { resolveScanHandoffAction } from '@/lib/scan-handoff-actions';

/**
 * The phone side of the desktop camera handoff, once the server page has
 * confirmed the token is a real, still-pending session (see that page for
 * every state that stops before this point: not found, expired, already
 * used). No login here - see scan-handoff-actions.ts's "ATTRIBUTION"
 * comment for why the phone never signs in and what that trades away.
 *
 * Reuses `<CameraScanner>` exactly as every other scan point in the app
 * does - same permission handling, same denied/unavailable/error states,
 * same retry - so this page isn't a second scanning implementation, just a
 * new place the existing one is mounted. The only thing added here is what
 * happens after a successful decode: instead of filling in a form field,
 * the code is handed to `resolveScanHandoffAction`, which is what the
 * desktop is polling for.
 */
export function ScanSessionClient({ token }: { token: string }) {
  const [outcome, setOutcome] = useState<'scanning' | 'success' | 'error'>('scanning');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleScan(value: string) {
    const result = await resolveScanHandoffAction(token, value);
    if (result.ok) {
      setOutcome('success');
    } else {
      setErrorMessage(result.error);
      setOutcome('error');
    }
  }

  if (outcome === 'success') {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent-strong">
          <CheckIcon />
        </div>
        <h1 className="font-display text-[1.15rem] font-medium text-text">Scanned</h1>
        <p className="text-[0.88rem] text-text-muted">
          Your desktop has the result - you can put your phone down and go back to it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-3 text-center">
      <h1 className="font-display text-[1.15rem] font-medium text-text">Scan the item</h1>
      <p className="text-[0.88rem] text-text-muted">
        Point your phone at the product&apos;s barcode or QR code. The result goes straight back to your
        desktop.
      </p>
      {outcome === 'error' && errorMessage && (
        <p role="alert" className="w-full rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[0.82rem] text-danger-text">
          {errorMessage}
        </p>
      )}
      {/*
        Full-width, larger than the app's usual 36px control height -
        this is the one thing on the whole screen, on a device this session
        is only ever opened on once, so it gets the same oversized touch
        target the app's other scan-first surfaces use (see README §5.1's
        documented exceptions).
      */}
      <CameraScanner
        onScan={handleScan}
        buttonLabel="Scan now"
        className="flex h-14 w-full items-center justify-center rounded-xl bg-accent text-[1rem] font-bold text-ink transition-colors hover:bg-accent-hover"
      />
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
