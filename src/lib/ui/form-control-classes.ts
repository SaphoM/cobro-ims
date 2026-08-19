/**
 * Shared Tailwind class strings for standard single-line form controls
 * (text/number inputs and selects) so every dashboard page's control height,
 * padding, border and typography stay in sync from one place instead of the
 * ~19 duplicated literal strings this replaced.
 *
 * Height standard: 36px, via Tailwind's `h-9` (2.25rem) — matches
 * `--control-height` in globals.css, which documents the number itself.
 * `select` additionally needs `appearance: none` (also in globals.css) for
 * this height to hold in every browser engine, not just the one it's
 * authored in — see the comment there for why.
 *
 * Deliberately NOT used by two intentionally larger, one-off controls:
 *   - `/dashboard/scan`'s barcode/QR hero input and its camera button — a
 *     single, prominent, oversized touch target by design (warehouse-floor
 *     scanning), not one of a dense row of side-by-side fields.
 *   - the login page's email/password fields — a single centered auth card,
 *     not a dashboard data-entry row.
 * Shrinking either to 36px would be a visual redesign nobody asked for, not
 * a consistency fix. See README.md's design-system note for the same.
 */
export const selectClass =
  'h-9 rounded-lg border border-accent/[0.14] bg-surface-2 px-3 py-1.5 text-[0.88rem] text-text focus:border-accent focus:outline-none';

export const inputClass =
  'h-9 rounded-lg border border-accent/[0.14] bg-surface-2 px-3 py-1.5 text-[0.88rem] text-text placeholder:text-text-faint focus:border-accent focus:outline-none';
