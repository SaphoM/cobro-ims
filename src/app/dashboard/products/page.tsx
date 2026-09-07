import { productRepository } from '@/lib/data';
import { NewProductForm } from '@/app/dashboard/products/new-product-form';
import { BulkImportForm } from '@/app/dashboard/products/bulk-import-form';
import { ImportInstructionsModal } from '@/app/dashboard/products/import-instructions-modal';
import { PriceCell } from '@/app/dashboard/products/price-cell';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { canSeeCosts } from '@/lib/costs';

export default async function ProductsPage() {
  const products = await productRepository.list();
  const session = await getSession();
  const canEditPrice = session ? await hasPermission(session, 'manage_pricing') : false;
  const costsVisible = await canSeeCosts(session);
  // Engineer / Requester (and any signed-out visitor) gets view/search only -
  // no add-product form, no bulk-import section, no link into Product
  // labels (a page they can't open anyway - see /dashboard/labels).
  const canManageCatalogue = session ? await hasPermission(session, 'manage_catalogue') : false;
  const canPrintLabels = session ? await hasPermission(session, 'manage_receiving') : false;
  const sorted = [...products].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Product catalogue</h1>
        <p className="text-[0.86rem] text-text-muted">
          SKUs, units of measure, barcodes and reorder thresholds. Flat parent → component{' '}
          <a href="/dashboard/bom" className="text-accent-strong hover:underline">
            bills of materials
          </a>{' '}
          are built; whether Cobro needs nested/multi-level BOM is still a{' '}
          <span className="text-accent-strong">BUSINESS DECISION REQUIRED</span> item - see docs/ARCHITECTURE.md.
        </p>
      </div>

      {canManageCatalogue && (
      <section className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
        <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">Bulk data import</h2>
        <p className="mb-4 text-[0.83rem] text-text-muted">
          For loading Cobro&apos;s real inventory in one batch rather than adding items one at a time below.
          Download a template, fill it in (see the instructions for exactly what each column means), and
          upload it below - every row is checked before anything is imported, so a mistake fails the whole
          file with a list of exactly what to fix, rather than partially loading bad data.
        </p>
        <div className="mb-4 flex flex-wrap gap-3">
          <a
            href="/templates/product-import-template.csv"
            download
            className="rounded-lg border border-accent/30 bg-surface-2 px-4 py-2.5 text-[0.85rem] font-semibold text-accent-strong hover:bg-accent/10"
          >
            Download product template (CSV)
          </a>
          <a
            href="/templates/opening-stock-import-template.csv"
            download
            className="rounded-lg border border-accent/30 bg-surface-2 px-4 py-2.5 text-[0.85rem] font-semibold text-accent-strong hover:bg-accent/10"
          >
            Download opening stock template (CSV)
          </a>
          <ImportInstructionsModal />
        </div>
        <BulkImportForm />
      </section>
      )}

      {canManageCatalogue && <NewProductForm />}

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
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Price</th>
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
                  <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text-muted">{p.barcode ?? '-'}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    <PriceCell
                      productId={p.id}
                      sku={p.sku}
                      unitPrice={p.unitPrice}
                      canEdit={canEditPrice}
                      costsVisible={costsVisible}
                    />
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-text-muted">
                    {p.reorderPoint?.toLocaleString() ?? '-'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <a href={`/dashboard/bom?productId=${p.id}`} className="text-[0.78rem] font-semibold text-accent-strong hover:underline">
                        BOM
                      </a>
                      {p.barcode && canPrintLabels && (
                        <a href={`/dashboard/labels?productId=${p.id}`} className="text-[0.78rem] font-semibold text-accent-strong hover:underline">
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
