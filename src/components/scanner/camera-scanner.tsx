'use client';

import { useEffect, useRef, useState } from 'react';
import { isMobileCapableDevice } from '@/lib/device';
import { generateQrDataUrl } from '@/lib/services/qrcode';
import { createScanHandoffSessionAction, getScanHandoffStatusAction } from '@/lib/scan-handoff-actions';

type ScanState = 'starting' | 'scanning' | 'denied' | 'unavailable' | 'error';
type HandoffPhase = 'creating' | 'pending' | 'expired' | 'error';

/**
 * Reusable "Scan with camera" control. What it opens depends on the device
 * it's clicked on — see `isMobileCapableDevice`:
 *
 *   - Phone/tablet (a real rear camera worth pointing at a barcode): opens
 *     THIS browser's camera directly, exactly as this component always has.
 *   - Desktop/laptop: a desktop camera is the wrong tool (front-facing,
 *     awkward angle, usually worse resolution) — instead shows a
 *     "Scan QR with your phone" handoff. The desktop generates a short-lived,
 *     single-use session (`src/lib/scan-handoff-actions.ts`) and displays it
 *     as a QR; scanning that with a phone opens `/scan-session/[token]`,
 *     which re-mounts THIS SAME component in its normal camera mode there.
 *     The desktop polls until the phone resolves it, then hands the result
 *     to `onScan` exactly as if its own camera had decoded it — every
 *     caller of `<CameraScanner>` gets this for free, with no changes.
 *
 * Decodes with `jsqr` (a small, well-established, pure-JS decoder — not a
 * hand-rolled encoder/decoder we'd have no way to verify, and it round-trips
 * reliably against the QR codes this app generates on `/dashboard/labels`),
 * and hands the decoded string back to the caller via `onScan`. The caller
 * decides what happens next — this component only identifies a code, it
 * never posts data or calls a mutating action itself, on either device.
 *
 * The camera stream is only requested when the overlay opens and is always
 * stopped — on a successful scan, on cancel, and on unmount — so nothing
 * runs in the background once the user leaves.
 *
 * In `continuous` mode the overlay stays open after a hit and keeps decoding,
 * which is what a scan-in/scan-out station needs: the operator works through a
 * stack of items without reopening the camera for each one. The cooldown
 * below is keyed to the specific code just accepted, not to "any code" -
 * it exists only to stop one physical label sitting in frame from firing the
 * same scan on every animation frame (jsQR runs at up to 60fps). An earlier
 * version blocked every code for the cooldown window regardless of which one
 * it was, which silently dropped a second, different item presented within
 * 1.4s of the first - exactly the kind of scan a fast operator produces.
 * Keying it to the code means the very next frame accepts a different item
 * immediately, while a repeat of the same code still needs the window to
 * pass (by which point it's a deliberate rescan, not a decoder re-reading
 * the same still-visible label). On desktop, `continuous` opens a fresh
 * handoff session after each resolved scan, so the same phone can keep
 * scanning the next item without the desktop operator clicking again.
 */
const SAME_CODE_COOLDOWN_MS = 1400;
const HANDOFF_POLL_MS = 1800;

export function CameraScanner({
  onScan,
  buttonLabel = 'Scan with camera',
  className,
  continuous = false,
  statusSlot,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: {
  onScan: (value: string) => void;
  buttonLabel?: string;
  className?: string;
  continuous?: boolean;
  /**
   * Rendered under the video feed. The overlay sits on top of whatever
   * opened it, so a running count, a success tick or a correction button
   * are invisible unless they are drawn in here. Supplying this also
   * replaces the raw "Read: <code>" line, which is debug output next to a
   * caller that can say something more useful.
   */
  statusSlot?: React.ReactNode;
  /**
   * Optional controlled open state. Omit both this and `onOpenChange` and
   * the component manages its own open/closed state exactly as before -
   * every existing caller keeps working unchanged. Pass both when a caller
   * needs a SECOND way to open the same camera (e.g. an inline "switch to
   * camera" icon next to a text field): there can only be one live
   * MediaStream for one physical camera, so two independent
   * `<CameraScanner>` instances would fight each other for it rather than
   * sharing one. Controlling the open state from outside lets several
   * triggers share this one instance instead.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Skip rendering the built-in trigger button - the caller supplies its own and drives `open` directly. */
  hideTrigger?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  function setOpen(next: boolean) {
    if (isControlled) onOpenChange?.(next);
    else setInternalOpen(next);
  }
  const [state, setState] = useState<ScanState>('starting');
  const [lastHit, setLastHit] = useState<string | null>(null);
  // Decided once, at the moment this opens - which device clicked "Scan with
  // camera" doesn't change mid-session, so there's no reason to re-check it
  // on every render. Null only very briefly before the open-transition below
  // sets it.
  const [mode, setMode] = useState<'camera' | 'handoff' | null>(null);
  // Bumped by the "Try again" button to re-run the effect below without
  // closing and reopening the whole dialog - denied/unavailable/error was a
  // dead end before this: the only way out was Cancel, even though the most
  // common cause (permission dismissed by mistake, camera busy in another
  // tab, phone just unlocked and hadn't granted the site access yet) is
  // exactly the kind of thing a second attempt fixes.
  const [retryToken, setRetryToken] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const scannedRef = useRef(false);
  const lastCodeRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  // Held in a ref so the decode loop always calls the caller's latest handler
  // without the effect having to tear the camera down and restart it.
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  // --- Desktop handoff state ---------------------------------------------
  const [handoffPhase, setHandoffPhase] = useState<HandoffPhase>('creating');
  const [handoffToken, setHandoffToken] = useState<string | null>(null);
  const [handoffQrDataUrl, setHandoffQrDataUrl] = useState<string | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [handoffAttempt, setHandoffAttempt] = useState(0);

  function stopCamera() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function close() {
    stopCamera();
    setOpen(false);
  }

  // Resets state on every open, same as the built-in trigger's onClick used
  // to do unconditionally - but that only fires for the built-in button. A
  // controlled caller can open this via its own trigger (see
  // `open`/`onOpenChange` above), which never runs that onClick, so the
  // reset has to happen here too. This is React's own "adjusting state when
  // a prop changes" pattern (comparing against a snapshot held in state, not
  // a ref - refs can't be read during render): it only fires on the actual
  // false->true transition, not on every render, and doing it here rather
  // than in a useEffect avoids an extra commit that would otherwise flash
  // the previous state/lastHit for one frame before the reset lands.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      if (state !== 'starting') setState('starting');
      if (lastHit !== null) setLastHit(null);
      setMode(isMobileCapableDevice() ? 'camera' : 'handoff');
      setHandoffPhase('creating');
      setHandoffToken(null);
      setHandoffQrDataUrl(null);
      setHandoffError(null);
    } else {
      setMode(null);
    }
  }

  useEffect(() => {
    if (!open || mode !== 'camera') return;
    let cancelled = false;
    scannedRef.current = false;
    lastCodeRef.current = { code: '', at: 0 };

    async function start() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) setState('unavailable');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        setState('scanning');

        const { default: jsQR } = await import('jsqr');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const tick = () => {
          if (cancelled || scannedRef.current) return;
          if (video && video.readyState === video.HAVE_ENOUGH_DATA && ctx && video.videoWidth > 0) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const result = jsQR(imageData.data, imageData.width, imageData.height);
            if (result && result.data) {
              const now = performance.now();
              const isRepeat =
                result.data === lastCodeRef.current.code && now - lastCodeRef.current.at < SAME_CODE_COOLDOWN_MS;
              if (!isRepeat) {
                lastCodeRef.current = { code: result.data, at: now };
                if (continuous) {
                  /*
                    Deliberately no close() here. A continuous caller is a
                    counting station: the operator scans an item, then the
                    next, then the next, and tearing the camera down after
                    the first hit would mean reopening it - and re-granting
                    the camera - for every single item. Only the operator
                    closes this, via Done scanning / ✕ / Escape.
                  */
                  setLastHit(result.data);
                  onScanRef.current(result.data);
                } else {
                  // One-shot callers (the pick-a-product forms) DO want the
                  // overlay to get out of the way once it has answered.
                  scannedRef.current = true;
                  onScanRef.current(result.data);
                  close();
                  return;
                }
              }
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          setState('denied');
        } else if (err instanceof DOMException && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError')) {
          setState('unavailable');
        } else {
          setState('error');
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the overlay opens/closes, or "Try again" bumps retryToken
  }, [open, mode, retryToken]);

  // --- Desktop handoff: create the session and generate its QR -----------
  useEffect(() => {
    if (!open || mode !== 'handoff') return;
    let cancelled = false;

    async function createSession() {
      const created = await createScanHandoffSessionAction();
      if (cancelled) return;
      if (!created.ok || !created.token) {
        setHandoffError(created.error ?? 'Could not start a scanning session.');
        setHandoffPhase('error');
        return;
      }
      // The QR carries only this app's own origin plus an opaque token in
      // the path - never a barcode, a credential, or any inventory data
      // (see ScanHandoffSession's doc comment in repositories.ts).
      const url = `${window.location.origin}/scan-session/${created.token}`;
      const dataUrl = await generateQrDataUrl(url);
      if (cancelled) return;
      setHandoffToken(created.token);
      setHandoffQrDataUrl(dataUrl);
      setHandoffPhase('pending');
    }

    createSession();
    return () => {
      cancelled = true;
    };
  }, [open, mode, handoffAttempt]);

  // --- Desktop handoff: poll until the phone resolves it ------------------
  useEffect(() => {
    if (!open || mode !== 'handoff' || handoffPhase !== 'pending' || !handoffToken) return;
    let cancelled = false;

    const interval = setInterval(async () => {
      const status = await getScanHandoffStatusAction(handoffToken);
      if (cancelled) return;
      if (status.status === 'resolved' && status.result) {
        onScanRef.current(status.result);
        if (continuous) {
          // Same "keep the operator scanning" behaviour as the direct-camera
          // path: hand back the result, then immediately open a fresh
          // session so the same phone can scan the next item without the
          // desktop clicking "Scan with camera" again.
          setHandoffPhase('creating');
          setHandoffAttempt((n) => n + 1);
        } else {
          close();
        }
      } else if (status.status === 'expired' || status.status === 'not_found') {
        setHandoffPhase('expired');
      }
    }, HANDOFF_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- polls this one token until it resolves/expires or the dialog closes
  }, [open, mode, handoffPhase, handoffToken, continuous]);

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          onClick={() => {
            setState('starting');
            setLastHit(null);
            setOpen(true);
          }}
          className={
            className ??
            'h-9 rounded-lg border border-accent/30 bg-surface-2 px-3 py-1.5 text-[0.82rem] font-semibold text-accent-strong hover:bg-accent/10'
          }
        >
          {buttonLabel}
        </button>
      )}

      {open && mode === 'camera' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Camera QR scanner"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-accent/[0.14] bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-[1rem] font-medium text-text">Scan QR code</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close scanner"
                className="rounded-lg px-2 py-1 text-text-faint hover:bg-neutral-soft hover:text-accent-strong"
              >
                ✕
              </button>
            </div>

            {(state === 'starting' || state === 'scanning') && (
              <div className="relative overflow-hidden rounded-xl bg-black">
                <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" />
                <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-accent/70" />
              </div>
            )}

            {state === 'starting' && (
              <p className="mt-3 text-[0.8rem] text-text-muted">Requesting camera access…</p>
            )}
            {state === 'scanning' && (
              <p className="mt-3 text-[0.8rem] text-text-muted">
                {continuous
                  ? 'Point the camera at a QR code - keep scanning, this stays open.'
                  : 'Point the camera at a QR code.'}
              </p>
            )}
            {statusSlot ? (
              <div className="mt-3">{statusSlot}</div>
            ) : (
              continuous &&
              lastHit && (
                <p role="status" className="mt-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 font-mono-brand text-[0.8rem] text-accent-strong">
                  Read: {lastHit}
                </p>
              )
            )}
            {state === 'denied' && (
              <p role="alert" className="mt-3 text-[0.82rem] text-danger-text">
                Camera access was denied. Allow camera permission for this site in your browser settings, or
                use the manual/USB scanner field instead.
              </p>
            )}
            {state === 'unavailable' && (
              <p role="alert" className="mt-3 text-[0.82rem] text-danger-text">
                No camera is available on this device or browser. Use the manual/USB scanner field instead.
              </p>
            )}
            {state === 'error' && (
              <p role="alert" className="mt-3 text-[0.82rem] text-danger-text">
                Couldn&apos;t start the camera. Use the manual/USB scanner field instead.
              </p>
            )}

            <div className="mt-4 flex gap-2">
              {(state === 'denied' || state === 'unavailable' || state === 'error') && (
                <button
                  type="button"
                  onClick={() => {
                    // Set here, synchronously in the click handler, rather
                    // than at the top of the effect above - the effect only
                    // re-runs because retryToken changed, and updating state
                    // from inside an effect body (rather than in response to
                    // the actual event that triggered it) is what the
                    // exhaustive-deps/set-state-in-effect lint rule flags,
                    // for good reason: it can cascade into an extra render.
                    setState('starting');
                    setRetryToken((t) => t + 1);
                  }}
                  className="flex-1 rounded-lg bg-accent px-3 py-2.5 text-[0.85rem] font-bold text-ink transition-colors hover:bg-accent-hover"
                >
                  Try again
                </button>
              )}
              <button
                type="button"
                onClick={close}
                className="flex-1 rounded-lg border border-accent/30 bg-surface-2 px-3 py-2.5 text-[0.85rem] font-semibold text-accent-strong hover:bg-accent/10"
              >
                {continuous && state === 'scanning' ? 'Done scanning' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {open && mode === 'handoff' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Scan QR with your phone"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-accent/[0.14] bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-[1rem] font-medium text-text">Scan QR with your phone</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close scanner"
                className="rounded-lg px-2 py-1 text-text-faint hover:bg-neutral-soft hover:text-accent-strong"
              >
                ✕
              </button>
            </div>

            {handoffPhase === 'creating' && (
              <p className="py-6 text-center text-[0.85rem] text-text-muted">Preparing your scanning session…</p>
            )}

            {handoffPhase === 'pending' && handoffQrDataUrl && (
              <>
                <div className="flex justify-center rounded-xl bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- ephemeral client-generated data: URL, not a static asset next/image can optimise */}
                  <img src={handoffQrDataUrl} alt="Scan with your phone to continue scanning" width={200} height={200} />
                </div>
                <p className="mt-3 text-[0.82rem] text-text-muted">
                  Point your phone&apos;s camera at this code. It opens Cobro IMS on your phone - log in if
                  asked - and whatever you scan there comes straight back here.
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-[0.78rem] text-text-faint">
                  <span className="h-1.5 w-1.5 flex-none animate-pulse rounded-full bg-accent" aria-hidden="true" />
                  Waiting for your phone…
                </p>
              </>
            )}

            {handoffPhase === 'expired' && (
              <>
                <p role="alert" className="py-4 text-center text-[0.85rem] text-danger-text">
                  This scanning session has expired. Please generate a new QR code.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setHandoffPhase('creating');
                    setHandoffAttempt((n) => n + 1);
                  }}
                  className="w-full rounded-lg bg-accent px-3 py-2.5 text-[0.85rem] font-bold text-ink transition-colors hover:bg-accent-hover"
                >
                  Generate new QR
                </button>
              </>
            )}

            {handoffPhase === 'error' && (
              <>
                <p role="alert" className="py-4 text-center text-[0.85rem] text-danger-text">
                  {handoffError ?? 'Could not start a scanning session.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setHandoffPhase('creating');
                    setHandoffAttempt((n) => n + 1);
                  }}
                  className="w-full rounded-lg bg-accent px-3 py-2.5 text-[0.85rem] font-bold text-ink transition-colors hover:bg-accent-hover"
                >
                  Try again
                </button>
              </>
            )}

            <div className="mt-4">
              <button
                type="button"
                onClick={close}
                className="w-full rounded-lg border border-accent/30 bg-surface-2 px-3 py-2.5 text-[0.85rem] font-semibold text-accent-strong hover:bg-accent/10"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
