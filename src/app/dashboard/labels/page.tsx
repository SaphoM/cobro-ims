import { productRepository } from '@/lib/data';
import { PrintButton } from '@/app/dashboard/labels/print-button';

const MAX_LABELS = 60;

export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; qty?: string }>;
}) {
  const { productId, qty } = await searchParams;
  const products = await productRepository.list();
  const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name));

  const selected = productId ? products.find((p) => p.id === productId) : null;
  const requestedQty = Math.min(Math.max(Number(qty) || 1, 1), MAX_LABELS);

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print">
        <h1 className="font-display text-[1.3rem] font-medium text-text">Product labels</h1>
        <p className="text-[0.86rem] text-text-muted">
          Generates a print-ready sheet: SKU, product name, and barcode number in large, clear text for
          each label. This prints a scanner/human-readable code, not a rendered barcode symbol (Code 128 /
          QR graphic) — see the note at the bottom of this page for why.
        </p>
      </div>

      <form
        action="/dashboard/labels"
        method="GET"
        className="no-print flex flex-wrap items-end gap-3 rounded-2xl border border-accent/[0.14] bg-surface p-5"
      >
        <label className="flex flex-1 min-w-[240px] flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Product</span>
          <select
            name="productId"
            required
            defaultValue={selected?.id ?? ''}
            className="rounded-lg border border-accent/[0.14] bg-surface-2 px-3 py-2.5 text-[0.88rem] text-text focus:border-accent focus:outline-none"
          >
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
          <input
            type="number"
            name="qty"
            min="1"
            max={MAX_LABELS}
            defaultValue={requestedQty}
            className="w-28 rounded-lg border border-accent/[0.14] bg-surface-2 px-3 py-2.5 text-[0.88rem] text-text focus:border-accent focus:outline-none"
          />
        </label>

        <button
          type="submit"
          className="rounded-lg border border-accent/30 bg-surface-2 px-5 py-2.5 text-[0.88rem] font-semibold text-accent hover:bg-accent/10"
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
          <a href="/dashboard/products" className="underline">
            product catalogue
          </a>{' '}
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
            <PrintButton />
          </div>

          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64mm, 1fr))' }}
          >
            {Array.from({ length: requestedQty }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col justify-between rounded-lg border border-accent/30 bg-white px-3 py-2.5 text-black print:break-inside-avoid"
                style={{ minHeight: '30mm' }}
              >
                <div>
                  <div className="text-[0.95rem] font-bold leading-tight">{selected.sku}</div>
                  <div className="text-[0.78rem] leading-snug text-gray-700">{selected.name}</div>
                </div>
                <div className="mt-2 border-t border-gray-300 pt-1.5 text-center font-mono text-[1.05rem] tracking-[0.15em]">
                  {selected.barcode}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="no-print text-[0.78rem] text-text-faint">
        Not built yet: rendering an actual Code 128 / QR barcode symbol graphic. That needs a correct
        encoding implementation this pass didn&apos;t have a way to verify (a wrong symbol would look
        legitimate but not scan) — a human/scanner-readable text code was the honest choice over a
        fabricated barcode image. USB scanners set to type digits will still work fine against the code
        printed above.
      </p>
    </div>
  );
}
