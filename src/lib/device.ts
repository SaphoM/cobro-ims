/**
 * Is this a touch-primary device - a phone or tablet with a real rear
 * camera worth pointing at a barcode - rather than a desktop/laptop with a
 * mouse?
 *
 * Deliberately not a screen-width check (a maximized desktop window and a
 * phone in landscape can both be "wide", and a narrow desktop window is
 * still a desktop) and not User-Agent sniffing (spoofable, and drifts out
 * of date as new devices ship). `pointer: coarse` and `maxTouchPoints` are
 * the two signals the platform itself exposes for "what kind of pointing
 * device does this thing primarily have" - checking both catches the
 * occasional laptop that reports one without the other.
 */
export function isMobileCapableDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const hasTouch = (navigator.maxTouchPoints ?? 0) > 0;
  return coarsePointer && hasTouch;
}
