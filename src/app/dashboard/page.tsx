import { customerRepository, productRepository, stockLedgerRepository, warehouseRepository } from '@/lib/data';
import { getSession } from '@/lib/auth';
import { canSeeCosts } from '@/lib/costs';
import { hasPermission } from '@/lib/permissions';
import { HIDDEN_COST } from '@/lib/ui/cost-display';
import { stockValue } from '@/lib/services/inventory-engine';
import { RecordMovementForm } from '@/app/dashboard/record-movement-form';
import { ReservedCell } from '@/app/dashboard/reserved-cell';
import { QuickRequisitionButton } from '@/app/dashboard/quick-requisition-button';
import type { StockLedgerView } from '@/lib/domain/inventory';

export default async function DashboardOverviewPage() {
  const [products, warehouses, ledgerEntries, customers, session] = await Promise.all([
    productRepository.list(),
    warehouseRepository.list(),
    stockLedgerRepository.listAll(),
    customerRepository.list(),
    getSession(),
  ]);
  const showCosts = await canSeeCosts(session);
  // Same permission the full Requisitions form requires - Stores Manager,
  // Stores Clerk and Engineer / Requester all hold it, Admin has it via
  // '*'. Gates the quick-requisition icon on the table below; the action
  // itself re-checks this independently either way.
  const canRequest = session ? await hasPermission(session, 'create_requisitions') : false;
  // Same permission the Product catalogue's price field requires - Admin
  // only. Everyone else gets the quick requisition's Unit value as a
  // read-only display of the catalogue price, not an editable field.
  const canEditPrice = session ? await hasPermission(session, 'manage_pricing') : false;

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

  // Every location holding this product, by product - lets the Quick
  // requisition modal show "also on hand at" across every store AND every
  // Engineer's station, not just the one row it was opened from. A
  // requester deciding where to source from needs that full picture
  // without leaving the modal to go check the table underneath it.
  const locationsByProduct = new Map<
    string,
    { warehouseId: string; label: string; qty: number }[]
  >();
  for (const row of ledgerView) {
    if (row.quantityOnHand <= 0) continue;
    const label = row.warehouse.type === 'engineer_station' ? row.warehouse.name : row.warehouse.code;
    const list = locationsByProduct.get(row.productId) ?? [];
    list.push({ warehouseId: row.warehouseId, label, qty: row.quantityOnHand });
    locationsByProduct.set(row.productId, list);
  }
  for (const list of locationsByProduct.values()) {
    list.sort((a, b) => b.qty - a.qty);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="SKUs tracked" value={products.length.toLocaleString()} />
        <StatTile
          label="Stock on hand (value)"
          value={
            showCosts
              ? `R ${totalStockValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : HIDDEN_COST
          }
        />
        <StatTile
          label="Below reorder point"
          value={lowStockCount.toString()}
          tone={lowStockCount > 0 ? 'warning' : 'default'}
        />
      </section>

      <RecordMovementForm products={products} warehouses={warehouses} ledger={ledgerEntries} />

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">Stock by location</h2>
          <p className="text-[0.83rem] text-text-muted">
            What is on the shelf right now, at every store and every Engineer&apos;s own station, at
            weighted-average cost. Tap a Reserved figure to see which requisition is holding it.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[0.86rem]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="px-5 py-2.5 font-medium">Product</th>
                <th className="px-5 py-2.5 font-medium">Store</th>
                {canRequest && <th className="w-10 px-2 py-2.5"><span className="sr-only">Requisition</span></th>}
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">On hand</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Reserved</th>
                {showCosts && (
                  <>
                    <th className="px-5 py-2.5 text-right font-medium tabular-nums">WAC</th>
                    <th className="px-5 py-2.5 text-right font-medium tabular-nums">Stock value</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {ledgerView.map((row) => (
                <tr key={`${row.productId}::${row.warehouseId}`} className="border-t border-accent/[0.08]">
                  <td className="px-5 py-3">
                    <div className="text-text">{row.product.name}</div>
                    <div className="font-mono-brand text-[0.72rem] text-text-faint">{row.product.sku}</div>
                  </td>
                  <td className="px-5 py-3 text-text-muted">
                    {row.warehouse.type === 'engineer_station' ? (
                      <>
                        {row.warehouse.name}
                        <span className="ml-1.5 rounded-full bg-neutral-soft px-1.5 py-0.5 text-[0.66rem] font-semibold text-text-faint">
                          station
                        </span>
                      </>
                    ) : (
                      row.warehouse.code
                    )}
                  </td>
                  {canRequest && (
                    <td className="px-2 py-3">
                      {row.warehouse.ownerUserId !== session?.id && (
                        <QuickRequisitionButton
                          productId={row.productId}
                          productSku={row.product.sku}
                          productName={row.product.name}
                          unitOfMeasure={row.product.unitOfMeasure}
                          availableQty={row.quantityOnHand}
                          elsewhere={(locationsByProduct.get(row.productId) ?? []).filter(
                            (l) => l.warehouseId !== row.warehouseId
                          )}
                          unitPrice={showCosts ? row.product.unitPrice : null}
                          canEditPrice={canEditPrice}
                          warehouseId={row.warehouseId}
                          warehouseLabel={
                            row.warehouse.type === 'engineer_station' ? row.warehouse.name : row.warehouse.code
                          }
                          customers={customers}
                        />
                      )}
                    </td>
                  )}
                  <td className="px-5 py-3 text-right tabular-nums text-text">
                    {row.quantityOnHand.toLocaleString()} {row.product.unitOfMeasure}
                    {row.isBelowReorderPoint && (
                      <span className="ml-2 rounded-full bg-danger/15 px-2 py-0.5 text-[0.68rem] font-semibold text-danger-text">
                        Low
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    <ReservedCell
                      productId={row.productId}
                      warehouseId={row.warehouseId}
                      quantityReserved={row.quantityReserved}
                    />
                  </td>
                  {showCosts && (
                    <>
                      <td className="px-5 py-3 text-right tabular-nums text-text-muted">
                        R {row.weightedAverageCost.toFixed(2)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-text">
                        R {row.stockValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </>
                  )}
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
