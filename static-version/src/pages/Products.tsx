import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, type ActionResult } from '@/store/useStore';
import { inputClass } from '@/ui/form-control-classes';
import { Feedback } from '@/ui/Feedback';
import { CameraScanner } from '@/ui/CameraScanner';

/** PORTED from src/app/dashboard/products/page.tsx + new-product-form.tsx. */
export function ProductsPage() {
  const products = useStore((s) => s.products);
  const createProduct = useStore((s) => s.createProduct);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const sorted = [...products].sort((a, b) => a.name.localeCompare(b.name));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const reorderPoint = data.get('reorderPoint');
    const reorderQuantity = data.get('reorderQuantity');
    setPending(true);
    const r = createProduct({
      sku: String(data.get('sku')).trim(),
      name: String(data.get('name')).trim(),
      unitOfMeasure: String(data.get('unitOfMeasure')).trim(),
      barcode: String(data.get('barcode') ?? ''),
      reorderPoint: reorderPoint ? Number(reorderPoint) : null,
      reorderQuantity: reorderQuantity ? Number(reorderQuantity) : null,
    });
    setPending(false);
    setResult(r);
    if (r.ok) form.reset();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Product catalogue</h1>
        <p className="text-[0.86rem] text-text-muted">
          SKUs, units of measure, barcodes and reorder thresholds. Flat parent → component{' '}
          <Link to="/dashboard/bom" className="text-accent hover:underline">
            bills of materials
          </Link>{' '}
          are built; whether Cobro needs nested/multi-level BOM is still a{' '}
          <span className="text-accent">BUSINESS DECISION REQUIRED</span> item.
        </p>
      </div>

      <section className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
        <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">Bulk data import</h2>
        <p className="mb-4 text-[0.83rem] text-text-muted">
          For loading Cobro&apos;s real inventory in one batch rather than adding items one at a time below.
          Download both templates, fill them in (see the included instructions for exactly what each column
          means), and send the completed files to X Spark to load.{' '}
          <strong className="text-text-muted">Not yet automatic</strong> — there&apos;s no in-app upload
          screen yet, so a completed file is currently loaded by X Spark on Cobro&apos;s behalf.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="templates/product-import-template.csv"
            download
            className="rounded-lg border border-accent/30 bg-surface-2 px-4 py-2.5 text-[0.85rem] font-semibold text-accent hover:bg-accent/10"
          >
            Download product template (CSV)
          </a>
          <a
            href="templates/opening-stock-import-template.csv"
            download
            className="rounded-lg border border-accent/30 bg-surface-2 px-4 py-2.5 text-[0.85rem] font-semibold text-accent hover:bg-accent/10"
          >
            Download opening stock template (CSV)
          </a>
          <a
            href="templates/README.txt"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-accent/[0.14] px-4 py-2.5 text-[0.85rem] font-semibold text-text-muted hover:text-accent"
          >
            Read the instructions
          </a>
        </div>
      </section>

      <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
        <h2 className="mb-4 font-display text-[1.05rem] font-medium text-text">Add a product</h2>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="flex flex-col gap-1.5 lg:col-span-2">
            <span className="text-[0.75rem] font-semibold text-text-muted">SKU</span>
            <input name="sku" required placeholder="CEM-42.5-50KG" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5 lg:col-span-2">
            <span className="text-[0.75rem] font-semibold text-text-muted">Name</span>
            <input name="name" required placeholder="Cement 42.5N, 50kg bag" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">Unit of measure</span>
            <input name="unitOfMeasure" required placeholder="bag / ea / m2 / ton" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">Barcode</span>
            <div className="flex gap-2">
              <input ref={barcodeRef} name="barcode" placeholder="Optional" className={`${inputClass} flex-1`} />
              <CameraScanner
                buttonLabel="Scan"
                className="h-9 rounded-lg border border-accent/30 bg-surface-2 px-3 py-1.5 text-[0.82rem] font-semibold text-accent hover:bg-accent/10"
                onScan={(value) => {
                  if (barcodeRef.current) barcodeRef.current.value = value;
                }}
              />
            </div>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">Reorder point</span>
            <input type="number" name="reorderPoint" min="0" step="1" placeholder="Optional" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">Reorder quantity</span>
            <input type="number" name="reorderQuantity" min="0" step="1" placeholder="Optional" className={inputClass} />
          </label>

          <div className="flex items-end lg:col-span-6">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
            >
              {pending ? 'Adding…' : 'Add product'}
            </button>
          </div>
        </form>

        <Feedback result={result} />
      </div>

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">{sorted.length} products</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[0.86rem]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="px-5 py-2.5 font-medium">SKU</th>
                <th className="px-5 py-2.5 font-medium">Name</th>
                <th className="px-5 py-2.5 font-medium">UoM</th>
                <th className="px-5 py-2.5 font-medium">Barcode</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Reorder point</th>
                <th className="px-5 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.id} className="border-t border-accent/[0.08]">
                  <td className="px-5 py-3 font-mono-brand text-[0.78rem] text-text">{p.sku}</td>
                  <td className="px-5 py-3 text-text">{p.name}</td>
                  <td className="px-5 py-3 text-text-muted">{p.unitOfMeasure}</td>
                  <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text-muted">{p.barcode ?? '—'}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text-muted">{p.reorderPoint?.toLocaleString() ?? '—'}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <Link to={`/dashboard/bom?productId=${p.id}`} className="text-[0.78rem] font-semibold text-accent hover:underline">
                        BOM
                      </Link>
                      {p.barcode && (
                        <Link to={`/dashboard/labels?productId=${p.id}`} className="text-[0.78rem] font-semibold text-accent hover:underline">
                          Print labels
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
