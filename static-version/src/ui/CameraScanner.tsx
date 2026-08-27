

import { useEffect, useRef, useState } from 'react';

type ScanState = 'starting' | 'scanning' | 'denied' | 'unavailable' | 'error';

/**
 * Reusable browser-based camera QR scanner. A button opens an overlay that
 * requests the camera, decodes frames with `jsqr` (a small, well-established,
 * pure-JS decoder — not a hand-rolled encoder/decoder we'd have no way to
 * verify, and it round-trips reliably against the QR codes this app
 * generates on `/dashboard/labels`), and hands the decoded string back to
 * the caller via `onScan`. The caller decides what happens next — this
 * component only identifies a code, it never posts data or calls a mutating
 * action itself.
 *
 * The camera stream is only requested when the overlay opens and is always
 * stopped — on a successful scan, on cancel, and on unmount — so nothing
 * runs in the background once the user leaves.
 */
export function CameraScanner({
  onScan,
  buttonLabel = 'Scan with camera',
  className,
}: {
  onScan: (value: string) => void;
  buttonLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ScanState>('starting');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const scannedRef = useRef(false);

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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    scannedRef.current = false;

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
              scannedRef.current = true;
              onScan(result.data);
              close();
              return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the overlay opens/closes
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setState('starting');
          setOpen(true);
        }}
        className={
          className ??
          'h-9 rounded-lg border border-accent/30 bg-surface-2 px-3 py-1.5 text-[0.82rem] font-semibold text-accent hover:bg-accent/10'
        }
      >
        {buttonLabel}
      </button>

      {open && (
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
                className="rounded-lg px-2 py-1 text-text-faint hover:bg-white/5 hover:text-accent"
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
              <p className="mt-3 text-[0.8rem] text-text-muted">Point the camera at a QR code.</p>
            )}
            {state === 'denied' && (
              <p role="alert" className="mt-3 text-[0.82rem] text-[#f3a99a]">
                Camera access was denied. Allow camera permission for this site in your browser settings, or
                use the manual/USB scanner field instead.
              </p>
            )}
            {state === 'unavailable' && (
              <p role="alert" className="mt-3 text-[0.82rem] text-[#f3a99a]">
                No camera is available on this device or browser. Use the manual/USB scanner field instead.
              </p>
            )}
            {state === 'error' && (
              <p role="alert" className="mt-3 text-[0.82rem] text-[#f3a99a]">
                Couldn&apos;t start the camera. Use the manual/USB scanner field instead.
              </p>
            )}

            <button
              type="button"
              onClick={close}
              className="mt-4 w-full rounded-lg border border-accent/30 bg-surface-2 px-3 py-2.5 text-[0.85rem] font-semibold text-accent hover:bg-accent/10"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
