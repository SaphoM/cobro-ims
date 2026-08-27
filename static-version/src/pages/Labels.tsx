import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { useStore } from '@/store/useStore';
import { inputClass, selectClass } from '@/ui/form-control-classes';

const MAX_LABELS = 60;

/**
 * PORTED from src/app/dashboard/labels/page.tsx + print-button.tsx.
 *
 * The only mechanical change: the original generated the QR server-side via
 * src/lib/services/qrcode.ts. The `qrcode` package works identically in the
 * browser, so generation moves into an effect here and produces the same
 * PNG data URL with the same options (errorCorrectionLevel 'M', margin 1,
 * width 240) — a real, spec-compliant, scannable symbol.
 *
 * Code 128 is still deliberately NOT rendered, for the original's reason:
 * its checksum/subset rules are easy to get subtly wrong and a bad symbol
 * looks legitimate while silently failing to scan.
 */
export function LabelsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const productId = searchParams.get('productId') ?? '';
  const qty = searchParams.get('qty');

  const products = useStore((s) => s.products);
  const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name));
  const selected = productId ? products.find((p) => p.id === productId) ?? null : null;
  const requestedQty = Math.min(Math.max(Number(qty) || 1, 1), MAX_LABELS);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!selected?.barcode) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(selected.barcode, { errorCorrectionLevel: 'M', margin: 1, width: 240 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.barcode]);

  function handleGenerate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const id = String(data.get('productId') ?? '');
    const q = String(data.get('qty') ?? '1');
    if (id) setSearchParams({ productId: id, qty: q });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print">
        <h1 className="font-display text-[1.3rem] font-medium text-text">Product labels</h1>
        <p className="text-[0.86rem] text-text-muted">
          Generates a print-ready sheet: SKU, product name, barcode number in large clear text, and a real
          scannable QR code, for each label. A Code 128 barcode symbol graphic still isn&apos;t rendered —
          see the note at the bottom of this page for why.
        </p>
      </div>

      <form
        onSubmit={handleGenerate}
        className="no-print flex flex-wrap items-end gap-3 rounded-2xl border border-accent/[0.14] bg-surface p-5"
      >
        <label className="flex flex-1 min-w-[240px] flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Product</span>
          <select name="productId" required defaultValue={selected?.id ?? ''} key={selected?.id ?? 'none'} className={selectClass}>
            <option value="" disabled>
              Choose a product…
            </option>
            {sortedProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
                {!p.barcode ? ' (no barcode set)' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Copies (max {MAX_LABELS})</span>
          <input type="number" name="qty" min="1" max={MAX_LABELS} defaultValue={requestedQty} key={requestedQty} className={`${inputClass} w-28`} />
        </label>

        <button
          type="submit"
          className="h-9 rounded-lg border border-accent/30 bg-surface-2 px-5 py-1.5 text-[0.88rem] font-semibold text-accent hover:bg-accent/10"
        >
          Generate sheet
        </button>
      </form>

      {productId && !selected && (
        <p className="no-print rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-[0.85rem] text-[#f3a99a]">
          That product couldn&apos;t be found.
        </p>
      )}

      {selected && !selected.barcode && (
        <p className="no-print rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-[0.85rem] text-[#f3a99a]">
          {selected.sku} has no barcode set — add one on the{' '}
          <Link to="/dashboard/products" className="underline">
            product catalogue
          </Link>{' '}
          first.
        </p>
      )}

      {selected && selected.barcode && (
        <>
          <div className="no-print flex items-center justify-between rounded-2xl border border-accent/[0.14] bg-surface px-5 py-4">
            <div>
              <h2 className="font-display text-[1.05rem] font-medium text-text">
                {requestedQty} label{requestedQty === 1 ? '' : 's'} — {selected.sku}
              </h2>
              <p className="text-[0.82rem] text-text-muted">{selected.name}</p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="no-print rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover"
            >
              Print this sheet
            </button>
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64mm, 1fr))' }}>
            {Array.from({ length: requestedQty }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-accent/30 bg-white px-3 py-2.5 text-black print:break-inside-avoid"
                style={{ minHeight: '30mm' }}
              >
                {qrDataUrl && <img src={qrDataUrl} alt={`QR code for ${selected.barcode}`} width={72} height={72} className="shrink-0" />}
                <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch">
                  <div>
                    <div className="text-[0.95rem] font-bold leading-tight">{selected.sku}</div>
                    <div className="text-[0.78rem] leading-snug text-gray-700">{selected.name}</div>
                  </div>
                  <div className="mt-2 border-t border-gray-300 pt-1.5 text-center font-mono text-[1.05rem] tracking-[0.15em]">
                    {selected.barcode}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="no-print text-[0.78rem] text-text-faint">
        QR codes are generated with the <code className="font-mono-brand">qrcode</code> npm package — a
        widely-used, deterministic encoder, not a hand-rolled implementation — so the symbol is a real,
        spec-compliant QR that any phone camera or QR-capable scanner can read. Still not built: a rendered
        Code 128 linear barcode symbol. Code 128 has multiple checksum/subset rules that are easy to get
        subtly wrong, and a wrong symbol would look legitimate but silently fail to scan. USB scanners set
        to type digits will still work fine against the human-readable code printed above.
      </p>
    </div>
  );
}
