import { useRef, useState } from 'react';
import { CameraScanner } from '@/ui/CameraScanner';

/**
 * Two ways to arrive at a received quantity, feeding ONE number:
 *
 *  1. SCAN — a USB scanner (types the barcode then Enter) or the camera.
 *     Each scan of the matching barcode increments the count by one, so
 *     goods can be counted in one at a time as they're handled. Scanning a
 *     different product's barcode is rejected rather than silently counted.
 *  2. TYPE — the same field is a normal number input, so a known quantity
 *     can be entered directly without scanning anything.
 *
 * The number is always the source of truth and always editable, whichever
 * way it got there — which is what the caller posts. That keeps a scanned
 * count correctable by hand if someone miscounts.
 *
 * Visual language is the existing one: the same `h-9` control height, the
 * bordered surface-2 secondary button, and the accent primary — the same
 * pairing used by the PO receive line this sits alongside.
 */
export function ScanToCount({
  expectedBarcode,
  max,
  unit,
  pending,
  submitLabel,
  onSubmit,
}: {
  /** Barcode of the product on this line — scans must match it. */
  expectedBarcode: string | null;
  /** Outstanding quantity; the count can't exceed it. */
  max: number;
  unit: string;
  pending: boolean;
  submitLabel: string;
  onSubmit: (quantity: number) => void;
}) {
  const [count, setCount] = useState('');
  const [scanMessage, setScanMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const scanFormRef = useRef<HTMLFormElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  /** One scan = +1, provided it's the right product and there's room left. */
  function registerScan(raw: string) {
    const barcode = raw.trim();
    if (!barcode) return;
    if (expectedBarcode && barcode !== expectedBarcode) {
      setScanMessage({ text: `That barcode isn't this product.`, ok: false });
      return;
    }
    const next = Math.round(((Number(count) || 0) + 1) * 1000) / 1000;
    if (next > max + 1e-9) {
      setScanMessage({ text: `Already at the ${max.toLocaleString()} outstanding.`, ok: false });
      return;
    }
    setCount(String(next));
    setScanMessage({ text: `Scanned — ${next.toLocaleString()} of ${max.toLocaleString()}.`, ok: true });
  }

  function handleScanSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem('scanCount') as HTMLInputElement;
    registerScan(input.value);
    input.value = '';
    input.focus();
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {/*
        Scan row. A USB scanner types into this field and hits Enter, which
        submits this inner form — no client JS needed for the scan itself,
        the same pattern the rest of the app uses.
      */}
      <form ref={scanFormRef} onSubmit={handleScanSubmit} className="flex items-center gap-2">
        <input
          ref={scanInputRef}
          name="scanCount"
          type="text"
          autoComplete="off"
          placeholder="Scan to count"
          className="h-9 w-32 rounded-lg border border-accent/[0.14] bg-surface-2 px-2.5 py-1.5 font-mono-brand text-[0.78rem] text-text placeholder:font-body placeholder:text-text-faint focus:border-accent focus:outline-none"
        />
        <CameraScanner
          buttonLabel="Camera"
          className="h-9 rounded-lg border border-accent/30 bg-surface-2 px-3 py-1.5 text-[0.78rem] font-semibold text-accent hover:bg-accent/10"
          onScan={(value) => registerScan(value)}
        />
      </form>

      {/* Quantity row — typed directly, or filled by the scans above. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(Number(count));
        }}
        className="flex items-center gap-2"
      >
        <input
          type="number"
          name="receivedQuantity"
          value={count}
          onChange={(e) => setCount(e.target.value)}
          min="0.001"
          max={max}
          step="0.001"
          required
          placeholder={`up to ${max}`}
          className="h-9 w-28 rounded-lg border border-accent/[0.14] bg-surface-2 px-2.5 py-1.5 text-right text-[0.82rem] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg bg-accent px-3 py-1.5 text-[0.78rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
        >
          {pending ? 'Posting…' : `${submitLabel} (${unit})`}
        </button>
      </form>

      {scanMessage && (
        <p className={`text-[0.72rem] ${scanMessage.ok ? 'text-accent' : 'text-[#f3a99a]'}`}>{scanMessage.text}</p>
      )}
    </div>
  );
}
