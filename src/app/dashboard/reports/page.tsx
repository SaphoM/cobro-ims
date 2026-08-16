import {
  customerRepository,
  invoiceRepository,
  productRepository,
  purchaseOrderRepository,
  salesOrderRepository,
  stockLedgerRepository,
  stockMovementRepository,
  supplierRepository,
  warehouseRepository,
} from '@/lib/data';
import {
  buildInvoiceAgeing,
  buildLowStockReport,
  buildMovementHistory,
  buildPurchaseOrderSummary,
  buildSalesSummary,
  buildStockValuationReport,
} from '@/lib/services/reports';
import { getNowMs } from '@/lib/now';
import { ExportCsvButton } from '@/components/export-csv-button';

export default async function ReportsPage() {
  const [
    products,
    warehouses,
    ledger,
    suppliers,
    customers,
    salesOrders,
    purchaseOrders,
    invoices,
    movements,
  ] = await Promise.all([
    productRepository.list(),
    warehouseRepository.list(),
    stockLedgerRepository.listAll(),
    supplierRepository.list(),
    customerRepository.list(),
    salesOrderRepository.list(),
    purchaseOrderRepository.list(),
    invoiceRepository.list(),
    stockMovementRepository.listRecent(200),
  ]);

  const valuation = buildStockValuationReport(ledger, products, warehouses);
  const lowStock = buildLowStockReport(ledger, products, warehouses);
  const salesSummary = buildSalesSummary(salesOrders, products, customers);
  const poSummary = buildPurchaseOrderSummary(purchaseOrders, products, suppliers);
  const ageing = buildInvoiceAgeing(invoices, customers, getNowMs());
  const movementHistory = buildMovementHistory(movements, products, warehouses);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Dashboards & reports</h1>
        <p className="text-[0.86rem] text-text-muted">
          Six of the RFQ&apos;s 15+ standard reports so far — stock valuation, low stock, sales, purchase
          orders, invoice ageing, and movement history. Every table exports to CSV (opens in Excel), per
          the RFQ&apos;s data-export requirement.
        </p>
      </div>

      <ReportSection
        title="Stock valuation"
        subtitle={`Grand total: R ${valuation.grandTotal.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} across ${valuation.byWarehouse.length} warehouses`}
        exportFilename="stock-valuation"
        rows={valuation.rows}
      >
        <table className="w-full min-w-[720px] border-collapse text-[0.86rem]">
          <thead>
            <tr className="text-left text-text-faint">
              <th className="px-5 py-2.5 font-medium">Warehouse</th>
              <th className="px-5 py-2.5 font-medium">SKU</th>
              <th className="px-5 py-2.5 font-medium">Product</th>
              <th className="px-5 py-2.5 text-right font-medium tabular-nums">On hand</th>
              <th className="px-5 py-2.5 text-right font-medium tabular-nums">WAC</th>
              <th className="px-5 py-2.5 text-right font-medium tabular-nums">Value</th>
            </tr>
          </thead>
          <tbody>
            {valuation.rows.map((r, i) => (
              <tr key={i} className="border-t border-accent/[0.08]">
                <td className="px-5 py-3 text-text-muted">{r.warehouseCode}</td>
                <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text">{r.sku}</td>
                <td className="px-5 py-3 text-text-muted">{r.productName}</td>
                <td className="px-5 py-3 text-right tabular-nums text-text">
                  {r.quantityOnHand.toLocaleString()} {r.unitOfMeasure}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-text-muted">R {r.weightedAverageCost.toFixed(2)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-text">
                  R {r.value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportSection>

      <ReportSection
        title="Low stock / reorder suggestions"
        subtitle={`${lowStock.length} product-warehouse combinations below reorder point`}
        exportFilename="low-stock"
        rows={lowStock}
      >
        {lowStock.length === 0 ? (
          <EmptyState text="Nothing below its reorder point right now." />
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-[0.86rem]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="px-5 py-2.5 font-medium">Warehouse</th>
                <th className="px-5 py-2.5 font-medium">SKU</th>
                <th className="px-5 py-2.5 font-medium">Product</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">On hand</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Reorder point</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Suggested qty</th>
              </tr>
            </thead>
            <tbody>
              {lowStock.map((r, i) => (
                <tr key={i} className="border-t border-accent/[0.08]">
                  <td className="px-5 py-3 text-text-muted">{r.warehouseCode}</td>
                  <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text">{r.sku}</td>
                  <td className="px-5 py-3 text-text-muted">{r.productName}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-danger">
                    {r.quantityOnHand.toLocaleString()} {r.unitOfMeasure}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-text-muted">{r.reorderPoint.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text">
                    {r.suggestedReorderQuantity?.toLocaleString() ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection
        title="Sales order summary"
        subtitle={`${salesSummary.length} orders`}
        exportFilename="sales-orders"
        rows={salesSummary}
      >
        <table className="w-full min-w-[640px] border-collapse text-[0.86rem]">
          <thead>
            <tr className="text-left text-text-faint">
              <th className="px-5 py-2.5 font-medium">Order</th>
              <th className="px-5 py-2.5 font-medium">Customer</th>
              <th className="px-5 py-2.5 font-medium">SKU</th>
              <th className="px-5 py-2.5 text-right font-medium tabular-nums">Qty</th>
              <th className="px-5 py-2.5 text-right font-medium tabular-nums">Value</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {salesSummary.map((r, i) => (
              <tr key={i} className="border-t border-accent/[0.08]">
                <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text">{r.orderNumber}</td>
                <td className="px-5 py-3 text-text-muted">{r.customerName}</td>
                <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text-muted">{r.sku}</td>
                <td className="px-5 py-3 text-right tabular-nums text-text">{r.quantity.toLocaleString()}</td>
                <td className="px-5 py-3 text-right tabular-nums text-text">
                  R {r.value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-5 py-3 text-text-muted capitalize">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportSection>

      <ReportSection
        title="Purchase order summary"
        subtitle={`${poSummary.length} orders`}
        exportFilename="purchase-orders"
        rows={poSummary}
      >
        <table className="w-full min-w-[720px] border-collapse text-[0.86rem]">
          <thead>
            <tr className="text-left text-text-faint">
              <th className="px-5 py-2.5 font-medium">PO</th>
              <th className="px-5 py-2.5 font-medium">Supplier</th>
              <th className="px-5 py-2.5 font-medium">SKU</th>
              <th className="px-5 py-2.5 text-right font-medium tabular-nums">Ordered</th>
              <th className="px-5 py-2.5 text-right font-medium tabular-nums">Received</th>
              <th className="px-5 py-2.5 text-right font-medium tabular-nums">Outstanding</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {poSummary.map((r, i) => (
              <tr key={i} className="border-t border-accent/[0.08]">
                <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text">{r.poNumber}</td>
                <td className="px-5 py-3 text-text-muted">{r.supplierName}</td>
                <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text-muted">{r.sku}</td>
                <td className="px-5 py-3 text-right tabular-nums text-text">{r.quantityOrdered.toLocaleString()}</td>
                <td className="px-5 py-3 text-right tabular-nums text-text-muted">{r.quantityReceived.toLocaleString()}</td>
                <td className="px-5 py-3 text-right tabular-nums text-text">
                  {r.quantityOutstanding > 0 ? r.quantityOutstanding.toLocaleString() : '—'}
                </td>
                <td className="px-5 py-3 text-text-muted capitalize">{r.status.replace('_', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportSection>

      <ReportSection
        title="Invoice ageing"
        subtitle="Outstanding amounts bucketed by days past due"
        exportFilename="invoice-ageing"
        rows={ageing.rows}
      >
        <div className="grid grid-cols-2 gap-3 border-b border-accent/[0.08] px-5 py-4 sm:grid-cols-5">
          {(['current', '1-30', '31-60', '61-90', '90+'] as const).map((bucket) => (
            <div key={bucket}>
              <div className="text-[0.72rem] font-semibold uppercase tracking-wide text-text-faint">
                {bucket === 'current' ? 'Current' : `${bucket} days`}
              </div>
              <div className={`mt-1 font-display text-[1.1rem] tabular-nums ${bucket !== 'current' && ageing.byBucket[bucket] > 0 ? 'text-danger' : 'text-text'}`}>
                R {ageing.byBucket[bucket].toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          ))}
        </div>
        {ageing.rows.length === 0 ? (
          <EmptyState text="No outstanding invoices." />
        ) : (
          <table className="w-full min-w-[640px] border-collapse text-[0.86rem]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="px-5 py-2.5 font-medium">Invoice</th>
                <th className="px-5 py-2.5 font-medium">Customer</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Outstanding</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Due</th>
                <th className="px-5 py-2.5 font-medium">Bucket</th>
              </tr>
            </thead>
            <tbody>
              {ageing.rows.map((r, i) => (
                <tr key={i} className="border-t border-accent/[0.08]">
                  <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text">{r.invoiceNumber}</td>
                  <td className="px-5 py-3 text-text-muted">{r.customerName}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text">
                    R {r.outstanding.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-text-muted">
                    {new Date(r.dueAt).toLocaleDateString('en-ZA')}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[0.72rem] font-semibold ${r.bucket === 'current' ? 'bg-white/5 text-text-muted' : 'bg-danger/15 text-[#f3a99a]'}`}>
                      {r.bucket === 'current' ? 'Current' : `${r.bucket} days`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection
        title="Stock movement history"
        subtitle={`Last ${movementHistory.length} movements — the append-only audit trail`}
        exportFilename="stock-movements"
        rows={movementHistory}
      >
        {movementHistory.length === 0 ? (
          <EmptyState text="No stock movements posted yet." />
        ) : (
          <table className="w-full min-w-[760px] border-collapse text-[0.86rem]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="px-5 py-2.5 font-medium">When</th>
                <th className="px-5 py-2.5 font-medium">SKU</th>
                <th className="px-5 py-2.5 font-medium">Warehouse</th>
                <th className="px-5 py-2.5 font-medium">Type</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Qty</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Unit cost</th>
                <th className="px-5 py-2.5 font-medium">Reference</th>
              </tr>
            </thead>
            <tbody>
              {movementHistory.map((r, i) => (
                <tr key={i} className="border-t border-accent/[0.08]">
                  <td className="px-5 py-3 text-text-muted">{new Date(r.createdAt).toLocaleString('en-ZA')}</td>
                  <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text">{r.sku}</td>
                  <td className="px-5 py-3 text-text-muted">{r.warehouseCode}</td>
                  <td className="px-5 py-3 text-text-muted capitalize">{r.movementType.replace('_', ' ')}</td>
                  <td className={`px-5 py-3 text-right tabular-nums ${r.quantity < 0 ? 'text-danger' : 'text-text'}`}>
                    {r.quantity > 0 ? '+' : ''}
                    {r.quantity.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-text-muted">R {r.unitCost.toFixed(2)}</td>
                  <td className="px-5 py-3 text-text-faint">{r.referenceType?.replace(/_/g, ' ') ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>
    </div>
  );
}

function ReportSection<T extends object>({
  title,
  subtitle,
  exportFilename,
  rows,
  children,
}: {
  title: string;
  subtitle: string;
  exportFilename: string;
  rows: T[];
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-accent/[0.14] bg-surface">
      <div className="flex items-start justify-between gap-4 border-b border-accent/[0.14] px-5 py-4">
        <div>
          <h2 className="font-display text-[1.05rem] font-medium text-text">{title}</h2>
          <p className="text-[0.83rem] text-text-muted">{subtitle}</p>
        </div>
        <ExportCsvButton filename={exportFilename} rows={rows} />
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="px-5 py-6 text-[0.85rem] text-text-faint">{text}</p>;
}
