import { productRepository, stockLedgerRepository, warehouseRepository } from '@/lib/data';
import { stockValue } from '@/lib/services/inventory-engine';
import { RecordMovementForm } from '@/app/dashboard/record-movement-form';
import type { StockLedgerView } from '@/lib/domain/inventory';

export default async function DashboardOverviewPage() {
  const [products, warehouses, ledgerEntries] = await Promise.all([
    productRepository.list(),
    warehouseRepository.list(),
    stockLedgerRepository.listAll(),
  ]);

  const productById = new Map(products.map((p) => [p.id, p]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

  const ledgerView: StockLedgerView[] = ledgerEntries
    .map((entry) => {
      const product = productById.get(entry.productId);
      const warehouse = warehouseById.get(entry.warehouseId);
      if (!product || !warehouse) return null;
      return {
        ...entry,
        product,
        warehouse,
        stockValue: stockValue(entry),
        isBelowReorderPoint:
          product.reorderPoint != null && entry.quantityOnHand < product.reorderPoint,
      };
    })
    .filter((v): v is StockLedgerView => v !== null)
    .sort((a, b) => a.product.name.localeCompare(b.product.name));

  const totalStockValue = ledgerView.reduce((sum, row) => sum + row.stockValue, 0);
  const lowStockCount = ledgerView.filter((row) => row.isBelowReorderPoint).length;

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="SKUs tracked" value={products.length.toLocaleString()} />
        <StatTile
          label="Stock on hand (value)"
          value={`R ${totalStockValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <StatTile
          label="Below reorder point"
          value={lowStockCount.toString()}
          tone={lowStockCount > 0 ? 'warning' : 'default'}
        />
      </section>

      <RecordMovementForm products={products} warehouses={warehouses} />

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">Multi-warehouse stock ledger</h2>
          <p className="text-[0.83rem] text-text-muted">Weighted-average cost, live across every location.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[0.86rem]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="px-5 py-2.5 font-medium">Product</th>
                <th className="px-5 py-2.5 font-medium">Warehouse</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">On hand</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Reserved</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">WAC</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Stock value</th>
              </tr>
            </thead>
            <tbody>
              {ledgerView.map((row) => (
                <tr key={`${row.productId}::${row.warehouseId}`} className="border-t border-accent/[0.08]">
                  <td className="px-5 py-3">
                    <div className="text-text">{row.product.name}</div>
                    <div className="font-mono-brand text-[0.72rem] text-text-faint">{row.product.sku}</div>
                  </td>
                  <td className="px-5 py-3 text-text-muted">{row.warehouse.code}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text">
                    {row.quantityOnHand.toLocaleString()} {row.product.unitOfMeasure}
                    {row.isBelowReorderPoint && (
                      <span className="ml-2 rounded-full bg-danger/15 px-2 py-0.5 text-[0.68rem] font-semibold text-[#f3a99a]">
                        Low
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-text-muted">
                    {row.quantityReserved.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-text-muted">
                    R {row.weightedAverageCost.toFixed(2)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-text">
                    R {row.stockValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

function StatTile({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warning' }) {
  return (
    <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
      <div className="text-[0.78rem] font-semibold text-text-muted">{label}</div>
      <div className={`mt-1.5 font-display text-[1.6rem] font-medium tabular-nums ${tone === 'warning' && value !== '0' ? 'text-danger' : 'text-text'}`}>
        {value}
      </div>
    </div>
  );
}
