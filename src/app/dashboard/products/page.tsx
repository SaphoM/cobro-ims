import { productRepository } from '@/lib/data';
import { NewProductForm } from '@/app/dashboard/products/new-product-form';

export default async function ProductsPage() {
  const products = await productRepository.list();
  const sorted = [...products].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Product catalogue</h1>
        <p className="text-[0.86rem] text-text-muted">
          SKUs, units of measure, barcodes and reorder thresholds. Flat parent → component{' '}
          <a href="/dashboard/bom" className="text-accent hover:underline">
            bills of materials
          </a>{' '}
          are built; whether Cobro needs nested/multi-level BOM is still a{' '}
          <span className="text-accent">BUSINESS DECISION REQUIRED</span> item — see docs/ARCHITECTURE.md.
        </p>
      </div>

      <NewProductForm />

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
                  <td className="px-5 py-3 text-right tabular-nums text-text-muted">
                    {p.reorderPoint?.toLocaleString() ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <a href={`/dashboard/bom?productId=${p.id}`} className="text-[0.78rem] font-semibold text-accent hover:underline">
                        BOM
                      </a>
                      {p.barcode && (
                        <a href={`/dashboard/labels?productId=${p.id}`} className="text-[0.78rem] font-semibold text-accent hover:underline">
                          Print labels
                        </a>
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
