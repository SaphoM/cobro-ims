import type { ActionResult } from '@/store/useStore';

/**
 * The app's inline feedback pattern, extracted so all ~12 forms share it.
 * These are the EXACT markup and classes the original used for
 * `state.error` / `state.success` under every form. There is deliberately no
 * toast library — the original has none, and adding one would be a new
 * notification system the design never had.
 */
export function Feedback({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  if (result.ok) {
    return (
      <p role="status" className="mt-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[0.82rem] text-accent">
        {result.message}
      </p>
    );
  }
  return (
    <p role="alert" className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[0.82rem] text-[#f3a99a]">
      {result.error}
    </p>
  );
}

/** The compact scan-match line used above the product select on scan-enabled forms. */
export function ScanMessage({ message }: { message: { text: string; ok: boolean } | null }) {
  if (!message) return null;
  return <p className={`mb-4 text-[0.78rem] ${message.ok ? 'text-accent' : 'text-danger'}`}>{message.text}</p>;
}
