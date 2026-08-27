import { useEffect, useRef, useState } from 'react';
import { CameraScanner } from '@/ui/CameraScanner';
import { inputClass } from '@/ui/form-control-classes';
import { ScanMessage } from '@/ui/Feedback';
import type { Product } from '@/store/types';

/**
 * The "scan barcode to select product" row that appears identically on
 * Receiving, Requisitions, Transfers and Adjustments in the original (the
 * first three had it; Adjustments gained it in the same pass that fixed the
 * scan-page context passing). Markup, classes and behaviour are unchanged —
 * this just holds the one copy instead of four.
 *
 * `initialBarcode` is what makes the scan-page hand-off work: arriving at
 * /dashboard/receiving?barcode=… runs the SAME match the manual box runs,
 * so the destination opens with that exact product already selected.
 */
export function useScanRow(products: Product[], initialBarcode: string | null) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const productSelectRef = useRef<HTMLSelectElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);

  function matchBarcode(barcode: string) {
    const match = products.find((p) => p.barcode === barcode);
    if (match && productSelectRef.current) {
      productSelectRef.current.value = match.id;
      setMessage({ text: `Matched ${match.sku} — ${match.name}.`, ok: true });
      quantityRef.current?.focus();
    } else {
      setMessage({ text: `No product with barcode "${barcode}".`, ok: false });
    }
  }

  // Arriving from the Barcode / QR scan page with ?barcode=… — carry that
  // product straight into the form instead of making the user scan again.
  useEffect(() => {
    if (initialBarcode) matchBarcode(initialBarcode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBarcode, products]);

  return { message, matchBarcode, productSelectRef, quantityRef };
}

export function ScanRow({ onMatch, message }: { onMatch: (barcode: string) => void; message: { text: string; ok: boolean } | null }) {
  const scanFormRef = useRef<HTMLFormElement>(null);
  const scanBarcodeRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem('scanBarcode') as HTMLInputElement;
    const barcode = input.value.trim();
    if (!barcode) return;
    onMatch(barcode);
    input.value = '';
    input.focus();
  }

  return (
    <>
      <form
        ref={scanFormRef}
        onSubmit={handleSubmit}
        className="mb-4 flex flex-col items-stretch gap-2 border-b border-accent/[0.08] pb-4 sm:flex-row sm:items-end"
      >
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Scan barcode to select product</span>
          <input
            ref={scanBarcodeRef}
            name="scanBarcode"
            type="text"
            autoComplete="off"
            placeholder="Scan or type, then Enter"
            className={`${inputClass} font-mono-brand`}
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className="h-9 flex-1 rounded-lg border border-accent/30 bg-surface-2 px-3 py-1.5 text-[0.82rem] font-semibold text-accent hover:bg-accent/10 sm:flex-none"
          >
            Match
          </button>
          <CameraScanner
            buttonLabel="Scan with camera"
            className="h-9 flex-1 rounded-lg border border-accent/30 bg-surface-2 px-3 py-1.5 text-[0.82rem] font-semibold text-accent hover:bg-accent/10 sm:flex-none"
            onScan={(value) => {
              if (scanBarcodeRef.current) scanBarcodeRef.current.value = value;
              scanFormRef.current?.requestSubmit();
            }}
          />
        </div>
      </form>
      <ScanMessage message={message} />
    </>
  );
}
