import { productRepository, stockLedgerRepository, warehouseRepository } from '@/lib/data';
import { stockValue } from '@/lib/services/inventory-engine';
import { ScanInput } from '@/app/dashboard/scan/scan-input';

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ barcode?: string }>;
}) {
  const { barcode } = await searchParams;
  const trimmed = barcode?.trim();

  const [warehouses, product] = await Promise.all([
    warehouseRepository.list(),
    trimmed ? productRepository.getByBarcode(trimmed) : Promise.resolve(null),
  ]);

  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  const ledgerRows = product
    ? (await stockLedgerRepository.listAll()).filter((e) => e.productId === product.id)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Barcode / QR scan</h1>
        <p className="text-[0.86rem] text-text-muted">
          Scan (USB scanner — acts as keyboard input, submits on Enter) or type a barcode to look up a
          product and its stock across every warehouse. Camera-based scanning isn&apos;t built yet — see
          the note below.
        </p>
      </div>

      <ScanInput initialValue={trimmed ?? ''} />

      {trimmed && !product && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 px-5 py-4 text-[0.9rem] text-[#f3a99a]">
          No product found with barcode <code className="font-mono-brand">{trimmed}</code>.
        </div>
      )}

      {product && (
        <section className="rounded-2xl border border-accent/[0.14] bg-surface">
          <div className="border-b border-accent/[0.14] px-5 py-4">
            <h2 className="font-display text-[1.05rem] font-medium text-text">
              {product.sku} — {product.name}
            </h2>
            <p className="font-mono-brand text-[0.78rem] text-text-faint">Barcode: {product.barcode}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[0.86rem]">
              <thead>
                <tr className="text-left text-text-faint">
                  <th className="px-5 py-2.5 font-medium">Warehouse</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">On hand</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Reserved</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">WAC</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Value</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-[0.85rem] text-text-faint">
                      No stock ledger entries for this product in any warehouse yet.
                    </td>
                  </tr>
                ) : (
                  ledgerRows.map((entry) => (
                    <tr key={entry.warehouseId} className="border-t border-accent/[0.08]">
                      <td className="px-5 py-3 text-text-muted">{warehouseById.get(entry.warehouseId)?.code}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-text">
                        {entry.quantityOnHand.toLocaleString()} {product.unitOfMeasure}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-text-muted">
                        {entry.quantityReserved.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-text-muted">
                        R {entry.weightedAverageCost.toFixed(2)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-text">
                        R {stockValue(entry).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-4 border-t border-accent/[0.08] px-5 py-3 text-[0.82rem]">
            <a href="/dashboard/receiving" className="text-accent hover:underline">
              Receive this product →
            </a>
            <a href="/dashboard/sales" className="text-accent hover:underline">
              Sell this product →
            </a>
            <a href="/dashboard/adjustments" className="text-accent hover:underline">
              Adjust this product →
            </a>
          </div>
        </section>
      )}

      <p className="text-[0.78rem] text-text-faint">
        Barcodes are seeded on the product catalogue for the demo dataset — try{' '}
        <code className="font-mono-brand">6001240912345</code> (Cement 42.5N, 50kg bag).
      </p>
    </div>
  );
}
