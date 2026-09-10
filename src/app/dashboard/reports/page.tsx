import {
  adjustmentReasonRepository,
  customerRepository,
  productRepository,
  purchaseOrderRepository,
  roleRepository,
  salesOrderRepository,
  stockAdjustmentRepository,
  stockLedgerRepository,
  stockMovementRepository,
  supplierRepository,
  userRepository,
  warehouseRepository,
} from '@/lib/data';
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
} from '@/lib/services/reports';
import { getNowMs } from '@/lib/now';
import { ExportCsvButton } from '@/components/export-csv-button';
import { getSession } from '@/lib/auth';

// What each role sees on this page, beyond the underlying data access
// already enforced elsewhere (`view_reports` gates the route itself - see
// src/lib/nav-items.ts). Admin and Stores Manager get every section;
// Stores Clerk loses the three purchasing/supplier-facing ones (financial
// detail beyond "relevant stock reports"); Engineer / Requester gets only
// their own requisitions and what's short on the shelf - not purchasing,
// suppliers, warehouse valuations, or anyone else's activity.
const PURCHASING_SECTIONS = new Set(['Purchase order summary', 'Supplier summary', 'Open purchase orders']);
const ENGINEER_VISIBLE_SECTIONS = new Set(['Requisition summary', 'Low stock / reorder suggestions']);
// A Supervisor gets what a Team Leader gets PLUS movement history - the
// "relevant usage/movement information" the 8 September review named for
// this role, and the one thing that makes their reporting view broader
// than a Team Leader's (whose view is also narrowed by `area`).
const SUPERVISOR_VISIBLE_SECTIONS = new Set([
  'Requisition summary',
  'Low stock / reorder suggestions',
  'Stock movement history',
]);

export default async function ReportsPage() {
  const [products, warehouses, ledger, suppliers, customers, allSalesOrders, purchaseOrders, movements, adjustments, adjustmentReasons, users, session] =
    await Promise.all([
      productRepository.list(),
      warehouseRepository.list(),
      stockLedgerRepository.listAll(),
      supplierRepository.list(),
      customerRepository.list(),
      salesOrderRepository.list(),
      purchaseOrderRepository.list(),
      stockMovementRepository.listRecent(200),
      stockAdjustmentRepository.list(),
      adjustmentReasonRepository.list(),
      userRepository.list(),
      getSession(),
    ]);

  const role = session ? await roleRepository.getById(session.roleId) : null;
  const isEngineer = role?.name === 'engineer_requester';
  const isStoresClerk = role?.name === 'stores_clerk';
  // View-only oversight, added per the 8 September client review - see
  // permissions.ts's ROLE_PERMISSIONS comment.
  const isTeamLeader = role?.name === 'mechanical_team_leader' || role?.name === 'electrical_team_leader';
  const isSupervisor = role?.name === 'supervisor';
  const userById = new Map(users.map((u) => [u.id, u]));
  // Engineers only ever see their own requisitions here, same rule as
  // /dashboard/sales - never everyone else's, even in a read-only report. A
  // Team Leader sees every requisition raised by someone in their own
  // `area` - team oversight, not the whole business. A Supervisor sees
  // every team's, unscoped - the point of being above the Team Leaders.
  const salesOrders =
    isEngineer && session
      ? allSalesOrders.filter((o) => o.createdBy === session.id)
      : isTeamLeader && session?.area
        ? allSalesOrders.filter((o) => userById.get(o.createdBy)?.area === session.area)
        : allSalesOrders;
  const hideSection = (title: string) =>
    isEngineer || isTeamLeader
      ? !ENGINEER_VISIBLE_SECTIONS.has(title)
      : isSupervisor
        ? !SUPERVISOR_VISIBLE_SECTIONS.has(title)
        : isStoresClerk
          ? PURCHASING_SECTIONS.has(title)
          : false;

  const now = getNowMs();
  const valuation = buildStockValuationReport(ledger, products, warehouses);
  const lowStock = buildLowStockReport(ledger, products, warehouses);
  const salesSummary = buildSalesSummary(salesOrders, products, customers);
  const poSummary = buildPurchaseOrderSummary(purchaseOrders, products, suppliers);
  const movementHistory = buildMovementHistory(movements, products, warehouses);
  const receivingHistory = buildReceivingHistory(movements, products, warehouses);
  const movementTypeTotals = buildMovementTypeTotals(movements);
  const supplierSummary = buildSupplierSummary(purchaseOrders, suppliers);
  const customerSummary = buildCustomerSummary(salesOrders, customers);
  const pickList = buildPickList(salesOrders, products, customers, warehouses);
  const adjustmentReasonSummary = buildAdjustmentReasonSummary(adjustments, adjustmentReasons);
  const warehouseSummary = buildWarehouseSummary(ledger, products, warehouses);
  const openPurchaseOrders = buildOpenPurchaseOrders(purchaseOrders, products, suppliers, now);
  const dormantStock = buildDormantStock(ledger, movements, products, warehouses);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Dashboards & reports</h1>
        <p className="text-[0.86rem] text-text-muted">
          {isEngineer
            ? 'Your own requisitions and what’s currently below reorder point - the purchasing, supplier and warehouse-valuation reports below are a Stores/Admin function.'
            : isTeamLeader
              ? 'Your team’s requisitions and what’s currently below reorder point - purchasing, supplier and warehouse-valuation detail is a Stores/Admin function.'
              : isSupervisor
                ? 'Every team’s requisitions, stock movement history and what’s below reorder point - purchasing, supplier and warehouse-valuation detail is a Stores/Admin function.'
              : isStoresClerk
                ? 'Operational store reports - stock, requisitions and movements. Purchasing and supplier detail is a Stores Manager/Admin function.'
                : 'Fifteen of the RFQ’s "15+" standard reports - stock valuation, low stock, sales, customers, purchase orders, suppliers, invoice ageing, movement history, receiving history, movement type totals, pick list, adjustment reasons, warehouse summary, open purchase orders, and dormant stock.'}{' '}
          Every table exports to CSV (opens in Excel), per the RFQ&apos;s data-export requirement.
        </p>
      </div>

      <ReportSection
        title="Stock valuation"
        hidden={hideSection('Stock valuation')}
        subtitle={`Grand total: R ${valuation.grandTotal.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} across ${valuation.byWarehouse.length} stores`}
        exportFilename="stock-valuation"
        rows={valuation.rows}
      >
        <table className="w-full min-w-[720px] border-collapse text-[0.86rem]">
          <thead>
            <tr className="text-left text-text-faint">
              <th className="px-5 py-2.5 font-medium">Store</th>
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
        hidden={hideSection('Low stock / reorder suggestions')}
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
                <th className="px-5 py-2.5 font-medium">Store</th>
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
                    {r.suggestedReorderQuantity?.toLocaleString() ?? '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection
        title="Store summary"
        hidden={hideSection('Store summary')}
        subtitle={`${warehouseSummary.length} warehouses`}
        exportFilename="warehouse-summary"
        rows={warehouseSummary}
      >
        <table className="w-full min-w-[560px] border-collapse text-[0.86rem]">
          <thead>
            <tr className="text-left text-text-faint">
              <th className="px-5 py-2.5 font-medium">Store</th>
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
                <td className={`px-5 py-3 text-right tabular-nums ${r.lowStockCount > 0 ? 'text-danger' : 'text-text-muted'}`}>
                  {r.lowStockCount}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-text">
                  R {r.totalValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportSection>

      <ReportSection
        title="Dormant stock"
        hidden={hideSection('Dormant stock')}
        subtitle={`${dormantStock.length} product-warehouse combinations with no movement recorded this session`}
        exportFilename="dormant-stock"
        rows={dormantStock}
      >
        {dormantStock.length === 0 ? (
          <EmptyState text="Everything on the ledger has moved since this server started." />
        ) : (
          <table className="w-full min-w-[560px] border-collapse text-[0.86rem]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="px-5 py-2.5 font-medium">Store</th>
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
                  <td className="px-5 py-3 text-right tabular-nums text-text">
                    R {r.value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection
        title="Requisition summary"
        hidden={hideSection('Requisition summary')}
        subtitle={`${salesSummary.length} requisitions`}
        exportFilename="requisitions"
        rows={salesSummary}
      >
        <table className="w-full min-w-[640px] border-collapse text-[0.86rem]">
          <thead>
            <tr className="text-left text-text-faint">
              <th className="px-5 py-2.5 font-medium">Requisition</th>
              <th className="px-5 py-2.5 font-medium">Department</th>
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
        title="Department summary"
        hidden={hideSection('Department summary')}
        subtitle={`${customerSummary.length} departments`}
        exportFilename="department-summary"
        rows={customerSummary}
      >
        <table className="w-full min-w-[640px] border-collapse text-[0.86rem]">
          <thead>
            <tr className="text-left text-text-faint">
              <th className="px-5 py-2.5 font-medium">Department</th>
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
                <td className="px-5 py-3 text-right tabular-nums text-text">
                  R {r.totalOrderedValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-text">
                  R {r.totalDispatchedValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportSection>

      <ReportSection
        title="Pick list"
        hidden={hideSection('Pick list')}
        subtitle={`${pickList.length} requisitions approved or issued`}
        exportFilename="pick-list"
        rows={pickList}
      >
        {pickList.length === 0 ? (
          <EmptyState text="No requisitions approved or issued yet." />
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-[0.86rem]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="px-5 py-2.5 font-medium">Requisition</th>
                <th className="px-5 py-2.5 font-medium">Department</th>
                <th className="px-5 py-2.5 font-medium">SKU</th>
                <th className="px-5 py-2.5 font-medium">Product</th>
                <th className="px-5 py-2.5 font-medium">Store</th>
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
                        r.status === 'confirmed' ? 'bg-accent/15 text-accent-strong' : 'bg-neutral-soft text-text-muted'
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

      <ReportSection
        title="Purchase order summary"
        hidden={hideSection('Purchase order summary')}
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
                  {r.quantityOutstanding > 0 ? r.quantityOutstanding.toLocaleString() : '-'}
                </td>
                <td className="px-5 py-3 text-text-muted capitalize">{r.status.replace('_', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportSection>

      <ReportSection
        title="Supplier summary"
        hidden={hideSection('Supplier summary')}
        subtitle={`${supplierSummary.length} suppliers`}
        exportFilename="supplier-summary"
        rows={supplierSummary}
      >
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
                <td className="px-5 py-3 text-right tabular-nums text-text">
                  R {r.totalOrderedValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-text">
                  R {r.totalReceivedValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportSection>

      <ReportSection
        title="Open purchase orders"
        hidden={hideSection('Open purchase orders')}
        subtitle={`${openPurchaseOrders.length} issued or partially received - exceptions only`}
        exportFilename="open-purchase-orders"
        rows={openPurchaseOrders}
      >
        {openPurchaseOrders.length === 0 ? (
          <EmptyState text="Nothing outstanding - every issued PO is fully received." />
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
                  <td className="px-5 py-3 text-right tabular-nums text-text">
                    R {r.outstandingValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className={`px-5 py-3 text-right tabular-nums ${(r.daysOpen ?? 0) > 14 ? 'text-danger' : 'text-text-muted'}`}>
                    {r.daysOpen ?? '-'}
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
        hidden={hideSection('Stock movement history')}
        subtitle={`Last ${movementHistory.length} movements - the append-only audit trail`}
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
                <th className="px-5 py-2.5 font-medium">Store</th>
                <th className="px-5 py-2.5 font-medium">Type</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Qty</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Unit cost</th>
                <th className="px-5 py-2.5 font-medium">Batch</th>
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
                  <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text-muted">{r.batchRef ?? '-'}</td>
                  <td className="px-5 py-3 text-text-faint">{r.referenceType?.replace(/_/g, ' ') ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection
        title="Receiving history"
        hidden={hideSection('Receiving history')}
        subtitle={`${receivingHistory.length} receipts - quick-receive and PO receipts alike`}
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
                <th className="px-5 py-2.5 font-medium">Store</th>
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
                  <td className="px-5 py-3 text-right tabular-nums text-text">
                    R {r.value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection
        title="Movement type totals"
        hidden={hideSection('Movement type totals')}
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
                  <td className="px-5 py-3 text-right tabular-nums text-text">
                    R {r.totalValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection
        title="Adjustment reason summary"
        hidden={hideSection('Adjustment reason summary')}
        subtitle="Counts by reason code and status - quantity/value impact isn't tracked at this level yet"
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
                  <td className="px-5 py-3 text-right tabular-nums text-accent-strong">{r.pendingCount}</td>
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
  hidden = false,
}: {
  title: string;
  subtitle: string;
  exportFilename: string;
  rows: T[];
  children: React.ReactNode;
  /** Role-based visibility (see VISIBLE_REPORTS below) - not a UI-only
   *  toggle, since every report here is built from data already scoped to
   *  what the page fetched for this role (Engineers get a pre-filtered
   *  order list, see ReportsPage). Defaults to visible so existing callers
   *  that never pass it are unaffected. */
  hidden?: boolean;
}) {
  if (hidden) return null;
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
