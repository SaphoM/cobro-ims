import {adjustmentReasonCodes} from '@/store/seed';
import { useStore } from '@/store/useStore';
import { ExportCsvButton } from '@/ui/ExportCsvButton';
import {
  buildAdjustmentReasonSummary,
  buildCustomerSummary,
  buildDormantStock,
  buildLowStockReport,
  buildMovementHistory,
  buildMovementTypeTotals,
  buildOpenPurchaseOrders,
  buildPickList,
  buildPurchaseOrderSummary,
  buildReceivingHistory,
  buildSalesSummary,
  buildStockValuationReport,
  buildSupplierSummary,
  buildWarehouseSummary,
} from '@/store/reports';
import type { PurchaseOrder, PurchaseOrderLine } from '@/store/types';

/**
 * PORTED from src/app/dashboard/reports/page.tsx. All fourteen report
 * builders are the verbatim pure functions from src/lib/services/reports.ts —
 * they took already-fetched records and returned rows, so they port with no
 * changes at all. Every table still exports to CSV via the same button.
 */
export function ReportsPage() {
  const products = useStore((s) => s.products);
  // Locations come from the store now (assets are user-managed).
  const warehouses = useStore((s) => s.locations);
  const ledgerMap = useStore((s) => s.ledger);
  const suppliers = useStore((s) => s.suppliers);
  const salesOrders = useStore((s) => s.salesOrders);
  const purchaseOrders = useStore((s) => s.purchaseOrders);
  const purchaseOrderLines = useStore((s) => s.purchaseOrderLines);
  const allMovements = useStore((s) => s.movements);
  const adjustments = useStore((s) => s.adjustments);

  const ledger = Object.values(ledgerMap);
  const movements = [...allMovements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
  const posWithLines: (PurchaseOrder & { line: PurchaseOrderLine })[] = [...purchaseOrders]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((po) => ({ po, line: purchaseOrderLines[po.id] }))
    .filter((r): r is { po: PurchaseOrder; line: PurchaseOrderLine } => Boolean(r.line))
    .map(({ po, line }) => ({ ...po, line }));

  const now = Date.now();
  const valuation = buildStockValuationReport(ledger, products, warehouses);
  const lowStock = buildLowStockReport(ledger, products, warehouses);
  const salesSummary = buildSalesSummary(salesOrders, products, warehouses);
  const poSummary = buildPurchaseOrderSummary(posWithLines, products, suppliers);
  const movementHistory = buildMovementHistory(movements, products, warehouses);
  const receivingHistory = buildReceivingHistory(movements, products, warehouses);
  const movementTypeTotals = buildMovementTypeTotals(movements);
  const supplierSummary = buildSupplierSummary(posWithLines, suppliers);
  const customerSummary = buildCustomerSummary(salesOrders, warehouses);
  const pickList = buildPickList(salesOrders, products, warehouses);
  const adjustmentReasonSummary = buildAdjustmentReasonSummary(adjustments, adjustmentReasonCodes);
  const warehouseSummary = buildWarehouseSummary(ledger, products, warehouses);
  const openPurchaseOrders = buildOpenPurchaseOrders(posWithLines, products, suppliers, now);
  const dormantStock = buildDormantStock(ledger, movements, products, warehouses);

  const money = (n: number) => `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Dashboards &amp; reports</h1>
        <p className="text-[0.86rem] text-text-muted">
          Fourteen reports — stock valuation, low stock, warehouse summary, dormant stock, requisitions,
          assets, pick list, purchase orders, suppliers, open POs, movement history, receiving history,
          movement type totals, and adjustment reasons. Every table exports to CSV (opens in Excel), per the
          RFQ&apos;s data-export requirement.
        </p>
      </div>

      <ReportSection
        title="Stock valuation"
        subtitle={`Grand total: ${money(valuation.grandTotal)} across ${valuation.byWarehouse.length} warehouses`}
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
                <td className="px-5 py-3 text-right tabular-nums text-text">{money(r.value)}</td>
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
                  <td className="px-5 py-3 text-right tabular-nums text-text">{r.suggestedReorderQuantity?.toLocaleString() ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection title="Warehouse summary" subtitle={`${warehouseSummary.length} warehouses`} exportFilename="warehouse-summary" rows={warehouseSummary}>
        <table className="w-full min-w-[560px] border-collapse text-[0.86rem]">
          <thead>
            <tr className="text-left text-text-faint">
              <th className="px-5 py-2.5 font-medium">Warehouse</th>
              <th className="px-5 py-2.5 text-right font-medium tabular-nums">SKUs</th>
              <th className="px-5 py-2.5 text-right font-medium tabular-nums">Below reorder</th>
              <th className="px-5 py-2.5 text-right font-medium tabular-nums">Total value</th>
            </tr>
          </thead>
          <tbody>
            {warehouseSummary.map((r, i) => (
              <tr key={i} className="border-t border-accent/[0.08]">
                <td className="px-5 py-3 text-text">{r.warehouseName}</td>
                <td className="px-5 py-3 text-right tabular-nums text-text-muted">{r.skuCount}</td>
                <td className={`px-5 py-3 text-right tabular-nums ${r.lowStockCount > 0 ? 'text-danger' : 'text-text-muted'}`}>{r.lowStockCount}</td>
                <td className="px-5 py-3 text-right tabular-nums text-text">{money(r.totalValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportSection>

      <ReportSection
        title="Dormant stock"
        subtitle={`${dormantStock.length} product-warehouse combinations with no movement recorded yet`}
        exportFilename="dormant-stock"
        rows={dormantStock}
      >
        {dormantStock.length === 0 ? (
          <EmptyState text="Everything on the ledger has moved." />
        ) : (
          <table className="w-full min-w-[560px] border-collapse text-[0.86rem]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="px-5 py-2.5 font-medium">Warehouse</th>
                <th className="px-5 py-2.5 font-medium">SKU</th>
                <th className="px-5 py-2.5 font-medium">Product</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">On hand</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Value</th>
              </tr>
            </thead>
            <tbody>
              {dormantStock.map((r, i) => (
                <tr key={i} className="border-t border-accent/[0.08]">
                  <td className="px-5 py-3 text-text-muted">{r.warehouseCode}</td>
                  <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text">{r.sku}</td>
                  <td className="px-5 py-3 text-text-muted">{r.productName}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text">{r.quantityOnHand.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text">{money(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection title="Requisition summary" subtitle={`${salesSummary.length} requisitions`} exportFilename="requisitions" rows={salesSummary}>
        {salesSummary.length === 0 ? (
          <EmptyState text="No requisitions yet." />
        ) : (
          <table className="w-full min-w-[640px] border-collapse text-[0.86rem]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="px-5 py-2.5 font-medium">Requisition</th>
                <th className="px-5 py-2.5 font-medium">Asset</th>
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
                  <td className="px-5 py-3 text-right tabular-nums text-text">{money(r.value)}</td>
                  <td className="px-5 py-3 text-text-muted capitalize">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection title="Asset summary" subtitle={`${customerSummary.length} assets`} exportFilename="asset-summary" rows={customerSummary}>
        {customerSummary.length === 0 ? (
          <EmptyState text="No requisitions yet." />
        ) : (
          <table className="w-full min-w-[640px] border-collapse text-[0.86rem]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="px-5 py-2.5 font-medium">Asset</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Requisitions</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Issued</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Requested value</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Issued value</th>
              </tr>
            </thead>
            <tbody>
              {customerSummary.map((r, i) => (
                <tr key={i} className="border-t border-accent/[0.08]">
                  <td className="px-5 py-3 text-text">{r.customerName}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text-muted">{r.orderCount}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text-muted">{r.dispatchedCount}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text">{money(r.totalOrderedValue)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text">{money(r.totalDispatchedValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection title="Pick list" subtitle={`${pickList.length} requisitions approved or issued`} exportFilename="pick-list" rows={pickList}>
        {pickList.length === 0 ? (
          <EmptyState text="No requisitions approved or issued yet." />
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-[0.86rem]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="px-5 py-2.5 font-medium">Requisition</th>
                <th className="px-5 py-2.5 font-medium">Asset</th>
                <th className="px-5 py-2.5 font-medium">SKU</th>
                <th className="px-5 py-2.5 font-medium">Product</th>
                <th className="px-5 py-2.5 font-medium">Warehouse</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Qty</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {pickList.map((r, i) => (
                <tr key={i} className="border-t border-accent/[0.08]">
                  <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text">{r.orderNumber}</td>
                  <td className="px-5 py-3 text-text-muted">{r.customerName}</td>
                  <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text-muted">{r.sku}</td>
                  <td className="px-5 py-3 text-text-muted">{r.productName}</td>
                  <td className="px-5 py-3 text-text-muted">{r.warehouseCode}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text">
                    {r.quantity.toLocaleString()} {r.unitOfMeasure}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.72rem] font-semibold ${
                        r.status === 'confirmed' ? 'bg-accent/15 text-accent' : 'bg-white/5 text-text-muted'
                      }`}
                    >
                      {r.status === 'confirmed' ? 'Ready to pick' : 'Issued'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection title="Purchase order summary" subtitle={`${poSummary.length} orders`} exportFilename="purchase-orders" rows={poSummary}>
        {poSummary.length === 0 ? (
          <EmptyState text="No purchase orders yet." />
        ) : (
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
        )}
      </ReportSection>

      <ReportSection title="Supplier summary" subtitle={`${supplierSummary.length} suppliers`} exportFilename="supplier-summary" rows={supplierSummary}>
        {supplierSummary.length === 0 ? (
          <EmptyState text="No purchase orders yet." />
        ) : (
          <table className="w-full min-w-[640px] border-collapse text-[0.86rem]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="px-5 py-2.5 font-medium">Supplier</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Orders</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Ordered value</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Received value</th>
              </tr>
            </thead>
            <tbody>
              {supplierSummary.map((r, i) => (
                <tr key={i} className="border-t border-accent/[0.08]">
                  <td className="px-5 py-3 text-text">{r.supplierName}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text-muted">{r.orderCount}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text">{money(r.totalOrderedValue)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text">{money(r.totalReceivedValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection
        title="Open purchase orders"
        subtitle={`${openPurchaseOrders.length} issued or partially received — exceptions only`}
        exportFilename="open-purchase-orders"
        rows={openPurchaseOrders}
      >
        {openPurchaseOrders.length === 0 ? (
          <EmptyState text="Nothing outstanding — every issued PO is fully received." />
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-[0.86rem]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="px-5 py-2.5 font-medium">PO</th>
                <th className="px-5 py-2.5 font-medium">Supplier</th>
                <th className="px-5 py-2.5 font-medium">SKU</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Outstanding</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Value</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Days open</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {openPurchaseOrders.map((r, i) => (
                <tr key={i} className="border-t border-accent/[0.08]">
                  <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text">{r.poNumber}</td>
                  <td className="px-5 py-3 text-text-muted">{r.supplierName}</td>
                  <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text-muted">{r.sku}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text">{r.quantityOutstanding.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text">{money(r.outstandingValue)}</td>
                  <td className={`px-5 py-3 text-right tabular-nums ${(r.daysOpen ?? 0) > 14 ? 'text-danger' : 'text-text-muted'}`}>
                    {r.daysOpen ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-text-muted capitalize">{r.status.replace('_', ' ')}</td>
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

      <ReportSection
        title="Receiving history"
        subtitle={`${receivingHistory.length} receipts — quick-receive and PO receipts alike`}
        exportFilename="receiving-history"
        rows={receivingHistory}
      >
        {receivingHistory.length === 0 ? (
          <EmptyState text="No receipts posted yet." />
        ) : (
          <table className="w-full min-w-[680px] border-collapse text-[0.86rem]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="px-5 py-2.5 font-medium">Received</th>
                <th className="px-5 py-2.5 font-medium">SKU</th>
                <th className="px-5 py-2.5 font-medium">Product</th>
                <th className="px-5 py-2.5 font-medium">Warehouse</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Qty</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Unit cost</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Value</th>
              </tr>
            </thead>
            <tbody>
              {receivingHistory.map((r, i) => (
                <tr key={i} className="border-t border-accent/[0.08]">
                  <td className="px-5 py-3 text-text-muted">{new Date(r.receivedAt).toLocaleString('en-ZA')}</td>
                  <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text">{r.sku}</td>
                  <td className="px-5 py-3 text-text-muted">{r.productName}</td>
                  <td className="px-5 py-3 text-text-muted">{r.warehouseCode}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text">{r.quantity.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text-muted">R {r.unitCost.toFixed(2)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text">{money(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection
        title="Movement type totals"
        subtitle="Roll-up of every stock movement by type"
        exportFilename="movement-type-totals"
        rows={movementTypeTotals}
      >
        {movementTypeTotals.length === 0 ? (
          <EmptyState text="No stock movements posted yet." />
        ) : (
          <table className="w-full min-w-[520px] border-collapse text-[0.86rem]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="px-5 py-2.5 font-medium">Type</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Count</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Total units</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Total value</th>
              </tr>
            </thead>
            <tbody>
              {movementTypeTotals.map((r, i) => (
                <tr key={i} className="border-t border-accent/[0.08]">
                  <td className="px-5 py-3 text-text-muted capitalize">{r.movementType.replace('_', ' ')}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text-muted">{r.count}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text-muted">{r.totalUnits.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text">{money(r.totalValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection
        title="Adjustment reason summary"
        subtitle="Counts by reason code and status — quantity/value impact isn't tracked at this level yet"
        exportFilename="adjustment-reasons"
        rows={adjustmentReasonSummary}
      >
        {adjustmentReasonSummary.length === 0 ? (
          <EmptyState text="No adjustments requested yet." />
        ) : (
          <table className="w-full min-w-[560px] border-collapse text-[0.86rem]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="px-5 py-2.5 font-medium">Reason</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Pending</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Approved</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Rejected</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Total</th>
              </tr>
            </thead>
            <tbody>
              {adjustmentReasonSummary.map((r, i) => (
                <tr key={i} className="border-t border-accent/[0.08]">
                  <td className="px-5 py-3 text-text">
                    {r.reasonCode}
                    <div className="text-[0.72rem] text-text-faint">{r.reasonDescription}</div>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-accent">{r.pendingCount}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text-muted">{r.approvedCount}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text-muted">{r.rejectedCount}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text">{r.totalCount}</td>
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
