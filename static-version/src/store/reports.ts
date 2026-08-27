/**
 * Reporting — RFQ Phase 5 ("Dashboards & Reports: 15+ standard reports, live
 * dashboard, PDF/Excel export"). This file is the pure-function layer:
 * given already-fetched domain records, build the rows a report table
 * needs. No I/O here — pages fetch via the repositories, then call these.
 *
 * Fifteen reports — the RFQ's "15+" target reached. See
 * docs/ARCHITECTURE.md for what's still a plausible addition later
 * (BOM explosion, per-warehouse reorder thresholds once §5.6 is decided).
 */

import { stockValue } from '@/store/engine';
import type {
  AdjustmentReasonCode,
  Customer,
  Invoice,
  Product,
  PurchaseOrderLine,
  PurchaseOrder,
  SalesOrder,
  StockAdjustment,
  StockLedgerEntry,
  StockMovementType,
  Supplier,
  Warehouse,
} from '@/store/types';

// ---------------------------------------------------------------------------
// Stock valuation — by warehouse, with subtotals and a grand total
// ---------------------------------------------------------------------------

export interface StockValuationRow {
  warehouseCode: string;
  sku: string;
  productName: string;
  unitOfMeasure: string;
  quantityOnHand: number;
  weightedAverageCost: number;
  value: number;
}

export interface StockValuationReport {
  rows: StockValuationRow[];
  byWarehouse: { warehouseCode: string; total: number }[];
  grandTotal: number;
}

export function buildStockValuationReport(
  ledger: StockLedgerEntry[],
  products: Product[],
  warehouses: Warehouse[]
): StockValuationReport {
  const productById = new Map(products.map((p) => [p.id, p]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

  const rows: StockValuationRow[] = ledger
    .map((entry) => {
      const product = productById.get(entry.productId);
      const warehouse = warehouseById.get(entry.warehouseId);
      if (!product || !warehouse) return null;
      return {
        warehouseCode: warehouse.code,
        sku: product.sku,
        productName: product.name,
        unitOfMeasure: product.unitOfMeasure,
        quantityOnHand: entry.quantityOnHand,
        weightedAverageCost: entry.weightedAverageCost,
        value: stockValue(entry),
      };
    })
    .filter((r): r is StockValuationRow => r !== null)
    .sort((a, b) => a.warehouseCode.localeCompare(b.warehouseCode) || a.sku.localeCompare(b.sku));

  const byWarehouseMap = new Map<string, number>();
  for (const row of rows) {
    byWarehouseMap.set(row.warehouseCode, (byWarehouseMap.get(row.warehouseCode) ?? 0) + row.value);
  }

  return {
    rows,
    byWarehouse: [...byWarehouseMap.entries()].map(([warehouseCode, total]) => ({ warehouseCode, total })),
    grandTotal: rows.reduce((sum, r) => sum + r.value, 0),
  };
}

// ---------------------------------------------------------------------------
// Low stock / reorder suggestions
// ---------------------------------------------------------------------------

export interface LowStockRow {
  warehouseCode: string;
  sku: string;
  productName: string;
  unitOfMeasure: string;
  quantityOnHand: number;
  reorderPoint: number;
  suggestedReorderQuantity: number | null;
}

export function buildLowStockReport(
  ledger: StockLedgerEntry[],
  products: Product[],
  warehouses: Warehouse[]
): LowStockRow[] {
  const productById = new Map(products.map((p) => [p.id, p]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

  return ledger
    .map((entry) => {
      const product = productById.get(entry.productId);
      const warehouse = warehouseById.get(entry.warehouseId);
      if (!product || !warehouse || product.reorderPoint == null) return null;
      if (entry.quantityOnHand >= product.reorderPoint) return null;
      return {
        warehouseCode: warehouse.code,
        sku: product.sku,
        productName: product.name,
        unitOfMeasure: product.unitOfMeasure,
        quantityOnHand: entry.quantityOnHand,
        reorderPoint: product.reorderPoint,
        suggestedReorderQuantity: product.reorderQuantity,
      };
    })
    .filter((r): r is LowStockRow => r !== null)
    .sort((a, b) => a.quantityOnHand - b.quantityOnHand);
}

// ---------------------------------------------------------------------------
// Sales order summary
// ---------------------------------------------------------------------------

export interface SalesSummaryRow {
  orderNumber: string;
  customerName: string;
  sku: string;
  quantity: number;
  value: number;
  status: string;
}

export function buildSalesSummary(orders: SalesOrder[], products: Product[], customers: Customer[]): SalesSummaryRow[] {
  const productById = new Map(products.map((p) => [p.id, p]));
  const customerById = new Map(customers.map((c) => [c.id, c]));

  return orders
    .map((o) => ({
      orderNumber: o.orderNumber,
      customerName: customerById.get(o.customerId)?.name ?? 'Unknown',
      sku: productById.get(o.productId)?.sku ?? 'Unknown',
      quantity: o.quantityOrdered,
      value: Math.round(o.quantityOrdered * o.unitPrice * 100) / 100,
      status: o.status,
    }))
    .sort((a, b) => b.orderNumber.localeCompare(a.orderNumber));
}

// ---------------------------------------------------------------------------
// Purchase order summary
// ---------------------------------------------------------------------------

export interface PurchaseOrderSummaryRow {
  poNumber: string;
  supplierName: string;
  sku: string;
  quantityOrdered: number;
  quantityReceived: number;
  quantityOutstanding: number;
  status: string;
}

export function buildPurchaseOrderSummary(
  orders: (PurchaseOrder & { line: PurchaseOrderLine })[],
  products: Product[],
  suppliers: Supplier[]
): PurchaseOrderSummaryRow[] {
  const productById = new Map(products.map((p) => [p.id, p]));
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));

  return orders
    .map((po) => ({
      poNumber: po.poNumber,
      supplierName: supplierById.get(po.supplierId)?.name ?? 'Unknown',
      sku: productById.get(po.line.productId)?.sku ?? 'Unknown',
      quantityOrdered: po.line.quantityOrdered,
      quantityReceived: po.line.quantityReceived,
      quantityOutstanding: Math.round((po.line.quantityOrdered - po.line.quantityReceived) * 1000) / 1000,
      status: po.status,
    }))
    .sort((a, b) => b.poNumber.localeCompare(a.poNumber));
}

// ---------------------------------------------------------------------------
// Invoice ageing — standard AR buckets
// ---------------------------------------------------------------------------

export type AgeingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+';

export interface AgeingRow {
  invoiceNumber: string;
  customerName: string;
  total: number;
  outstanding: number;
  dueAt: string;
  bucket: AgeingBucket;
  status: string;
}

export interface InvoiceAgeingReport {
  rows: AgeingRow[];
  byBucket: Record<AgeingBucket, number>;
}

export function buildInvoiceAgeing(invoices: Invoice[], customers: Customer[], nowMs: number): InvoiceAgeingReport {
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const byBucket: Record<AgeingBucket, number> = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };

  const rows: AgeingRow[] = invoices
    .filter((i) => i.status === 'unpaid' || i.status === 'partially_paid')
    .map((inv) => {
      const outstanding = Math.round((inv.total - inv.amountPaid - inv.creditedAmount) * 100) / 100;
      const daysPastDue = Math.floor((nowMs - new Date(inv.dueAt).getTime()) / (24 * 60 * 60 * 1000));
      const bucket: AgeingBucket =
        daysPastDue <= 0 ? 'current' : daysPastDue <= 30 ? '1-30' : daysPastDue <= 60 ? '31-60' : daysPastDue <= 90 ? '61-90' : '90+';
      byBucket[bucket] += outstanding;
      return {
        invoiceNumber: inv.invoiceNumber,
        customerName: customerById.get(inv.customerId)?.name ?? 'Unknown',
        total: inv.total,
        outstanding,
        dueAt: inv.dueAt,
        bucket,
        status: inv.status,
      };
    })
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));

  return { rows, byBucket };
}

// ---------------------------------------------------------------------------
// Stock movement history — the append-only audit trail, human-readable
// ---------------------------------------------------------------------------

export interface MovementHistoryRow {
  createdAt: string;
  sku: string;
  warehouseCode: string;
  movementType: string;
  quantity: number;
  unitCost: number;
  referenceType: string | null;
}

export function buildMovementHistory(
  movements: { productId: string; warehouseId: string; movementType: string; quantity: number; unitCost: number; referenceType: string | null; createdAt: string }[],
  products: Product[],
  warehouses: Warehouse[]
): MovementHistoryRow[] {
  const productById = new Map(products.map((p) => [p.id, p]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

  return movements
    .map((m) => ({
      createdAt: m.createdAt,
      sku: productById.get(m.productId)?.sku ?? 'Unknown',
      warehouseCode: warehouseById.get(m.warehouseId)?.code ?? 'Unknown',
      movementType: m.movementType,
      quantity: m.quantity,
      unitCost: m.unitCost,
      referenceType: m.referenceType,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------------------------------------------------------------------------
// Receiving history — every 'receipt' movement, human-readable (covers both
// quick-receive and PO receipts, since both post through the same movement
// type)
// ---------------------------------------------------------------------------

export interface ReceivingHistoryRow {
  receivedAt: string;
  sku: string;
  productName: string;
  warehouseCode: string;
  quantity: number;
  unitCost: number;
  value: number;
}

export function buildReceivingHistory(
  movements: { productId: string; warehouseId: string; movementType: StockMovementType; quantity: number; unitCost: number; createdAt: string }[],
  products: Product[],
  warehouses: Warehouse[]
): ReceivingHistoryRow[] {
  const productById = new Map(products.map((p) => [p.id, p]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

  return movements
    .filter((m) => m.movementType === 'receipt')
    .map((m) => {
      const product = productById.get(m.productId);
      return {
        receivedAt: m.createdAt,
        sku: product?.sku ?? 'Unknown',
        productName: product?.name ?? 'Unknown',
        warehouseCode: warehouseById.get(m.warehouseId)?.code ?? 'Unknown',
        quantity: m.quantity,
        unitCost: m.unitCost,
        value: Math.round(m.quantity * m.unitCost * 100) / 100,
      };
    })
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

// ---------------------------------------------------------------------------
// Movement type totals — a quick roll-up of the audit trail by movement type
// ---------------------------------------------------------------------------

export interface MovementTypeTotalRow {
  movementType: string;
  count: number;
  totalUnits: number;
  totalValue: number;
}

export function buildMovementTypeTotals(
  movements: { movementType: StockMovementType; quantity: number; unitCost: number }[]
): MovementTypeTotalRow[] {
  const byType = new Map<string, MovementTypeTotalRow>();
  for (const m of movements) {
    const row = byType.get(m.movementType) ?? { movementType: m.movementType, count: 0, totalUnits: 0, totalValue: 0 };
    row.count += 1;
    row.totalUnits = Math.round((row.totalUnits + Math.abs(m.quantity)) * 1000) / 1000;
    row.totalValue = Math.round((row.totalValue + Math.abs(m.quantity) * m.unitCost) * 100) / 100;
    byType.set(m.movementType, row);
  }
  return [...byType.values()].sort((a, b) => b.totalValue - a.totalValue);
}

// ---------------------------------------------------------------------------
// Supplier summary — spend by supplier, ordered vs. actually received
// ---------------------------------------------------------------------------

export interface SupplierSummaryRow {
  supplierName: string;
  orderCount: number;
  totalOrderedValue: number;
  totalReceivedValue: number;
}

export function buildSupplierSummary(
  orders: (PurchaseOrder & { line: PurchaseOrderLine })[],
  suppliers: Supplier[]
): SupplierSummaryRow[] {
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const bySupplier = new Map<string, SupplierSummaryRow>();

  for (const po of orders) {
    const name = supplierById.get(po.supplierId)?.name ?? 'Unknown';
    const row = bySupplier.get(po.supplierId) ?? { supplierName: name, orderCount: 0, totalOrderedValue: 0, totalReceivedValue: 0 };
    row.orderCount += 1;
    row.totalOrderedValue = Math.round((row.totalOrderedValue + po.line.quantityOrdered * po.line.unitCost) * 100) / 100;
    row.totalReceivedValue = Math.round((row.totalReceivedValue + po.line.quantityReceived * po.line.unitCost) * 100) / 100;
    bySupplier.set(po.supplierId, row);
  }

  return [...bySupplier.values()].sort((a, b) => b.totalOrderedValue - a.totalOrderedValue);
}

// ---------------------------------------------------------------------------
// Customer summary — order volume and value by customer
// ---------------------------------------------------------------------------

export interface CustomerSummaryRow {
  customerName: string;
  orderCount: number;
  dispatchedCount: number;
  totalOrderedValue: number;
  totalDispatchedValue: number;
}

export function buildCustomerSummary(orders: SalesOrder[], customers: Customer[]): CustomerSummaryRow[] {
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const byCustomer = new Map<string, CustomerSummaryRow>();

  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    const name = customerById.get(o.customerId)?.name ?? 'Unknown';
    const row = byCustomer.get(o.customerId) ?? {
      customerName: name,
      orderCount: 0,
      dispatchedCount: 0,
      totalOrderedValue: 0,
      totalDispatchedValue: 0,
    };
    const value = Math.round(o.quantityOrdered * o.unitPrice * 100) / 100;
    row.orderCount += 1;
    row.totalOrderedValue = Math.round((row.totalOrderedValue + value) * 100) / 100;
    if (o.status === 'dispatched') {
      row.dispatchedCount += 1;
      row.totalDispatchedValue = Math.round((row.totalDispatchedValue + value) * 100) / 100;
    }
    byCustomer.set(o.customerId, row);
  }

  return [...byCustomer.values()].sort((a, b) => b.totalOrderedValue - a.totalOrderedValue);
}

// ---------------------------------------------------------------------------
// Pick list — confirmed (reserved, ready to pick) and dispatched orders,
// per the RFQ's "pick lists" mention under Sales Orders & Dispatch
// ---------------------------------------------------------------------------

export interface PickListRow {
  orderNumber: string;
  customerName: string;
  sku: string;
  productName: string;
  warehouseCode: string;
  quantity: number;
  unitOfMeasure: string;
  status: string;
}

export function buildPickList(
  orders: SalesOrder[],
  products: Product[],
  customers: Customer[],
  warehouses: Warehouse[]
): PickListRow[] {
  const productById = new Map(products.map((p) => [p.id, p]));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

  return orders
    .filter((o) => o.status === 'confirmed' || o.status === 'dispatched')
    .map((o) => {
      const product = productById.get(o.productId);
      return {
        orderNumber: o.orderNumber,
        customerName: customerById.get(o.customerId)?.name ?? 'Unknown',
        sku: product?.sku ?? 'Unknown',
        productName: product?.name ?? 'Unknown',
        warehouseCode: warehouseById.get(o.warehouseId)?.code ?? 'Unknown',
        quantity: o.quantityOrdered,
        unitOfMeasure: product?.unitOfMeasure ?? '',
        status: o.status,
      };
    })
    .sort((a, b) => (a.status === b.status ? a.orderNumber.localeCompare(b.orderNumber) : a.status === 'confirmed' ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Adjustment reason summary — counts by reason code and status. Quantity/
// value impact isn't included: StockAdjustmentLine (which holds
// quantityDelta/unitCost) isn't exposed by StockAdjustmentRepository today,
// only the header record is — see docs/ARCHITECTURE.md for that gap.
// ---------------------------------------------------------------------------

export interface AdjustmentReasonSummaryRow {
  reasonCode: string;
  reasonDescription: string;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalCount: number;
}

export function buildAdjustmentReasonSummary(
  adjustments: StockAdjustment[],
  reasonCodes: AdjustmentReasonCode[]
): AdjustmentReasonSummaryRow[] {
  const reasonById = new Map(reasonCodes.map((r) => [r.id, r]));
  const byReason = new Map<string, AdjustmentReasonSummaryRow>();

  for (const a of adjustments) {
    const reason = reasonById.get(a.reasonCodeId);
    const key = a.reasonCodeId;
    const row = byReason.get(key) ?? {
      reasonCode: reason?.code ?? 'Unknown',
      reasonDescription: reason?.description ?? '',
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      totalCount: 0,
    };
    if (a.status === 'pending_approval') row.pendingCount += 1;
    if (a.status === 'approved') row.approvedCount += 1;
    if (a.status === 'rejected') row.rejectedCount += 1;
    row.totalCount += 1;
    byReason.set(key, row);
  }

  return [...byReason.values()].sort((a, b) => b.totalCount - a.totalCount);
}

// ---------------------------------------------------------------------------
// Warehouse summary — a location-level roll-up, one row per warehouse
// ---------------------------------------------------------------------------

export interface WarehouseSummaryRow {
  warehouseCode: string;
  warehouseName: string;
  skuCount: number;
  totalValue: number;
  lowStockCount: number;
}

export function buildWarehouseSummary(
  ledger: StockLedgerEntry[],
  products: Product[],
  warehouses: Warehouse[]
): WarehouseSummaryRow[] {
  const productById = new Map(products.map((p) => [p.id, p]));
  const byWarehouse = new Map<string, WarehouseSummaryRow>();

  for (const w of warehouses) {
    byWarehouse.set(w.id, { warehouseCode: w.code, warehouseName: w.name, skuCount: 0, totalValue: 0, lowStockCount: 0 });
  }

  for (const entry of ledger) {
    const row = byWarehouse.get(entry.warehouseId);
    if (!row) continue;
    const product = productById.get(entry.productId);
    row.skuCount += 1;
    row.totalValue = Math.round((row.totalValue + stockValue(entry)) * 100) / 100;
    if (product?.reorderPoint != null && entry.quantityOnHand < product.reorderPoint) {
      row.lowStockCount += 1;
    }
  }

  return [...byWarehouse.values()].sort((a, b) => b.totalValue - a.totalValue);
}

// ---------------------------------------------------------------------------
// Open purchase orders — the exceptions view: only what's still outstanding
// ---------------------------------------------------------------------------

export interface OpenPurchaseOrderRow {
  poNumber: string;
  supplierName: string;
  sku: string;
  quantityOutstanding: number;
  outstandingValue: number;
  status: string;
  orderedAt: string | null;
  daysOpen: number | null;
}

export function buildOpenPurchaseOrders(
  orders: (PurchaseOrder & { line: PurchaseOrderLine })[],
  products: Product[],
  suppliers: Supplier[],
  nowMs: number
): OpenPurchaseOrderRow[] {
  const productById = new Map(products.map((p) => [p.id, p]));
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));

  return orders
    .filter((po) => po.status === 'issued' || po.status === 'partially_received')
    .map((po) => {
      const outstanding = Math.round((po.line.quantityOrdered - po.line.quantityReceived) * 1000) / 1000;
      const daysOpen = po.orderedAt ? Math.floor((nowMs - new Date(po.orderedAt).getTime()) / (24 * 60 * 60 * 1000)) : null;
      return {
        poNumber: po.poNumber,
        supplierName: supplierById.get(po.supplierId)?.name ?? 'Unknown',
        sku: productById.get(po.line.productId)?.sku ?? 'Unknown',
        quantityOutstanding: outstanding,
        outstandingValue: Math.round(outstanding * po.line.unitCost * 100) / 100,
        status: po.status,
        orderedAt: po.orderedAt,
        daysOpen,
      };
    })
    .sort((a, b) => (b.daysOpen ?? 0) - (a.daysOpen ?? 0));
}

// ---------------------------------------------------------------------------
// Dormant stock — stock on hand with no recorded movement. Caveat: mock data
// has no persistent movement history before this server process started, so
// "no movement" here means "no movement recorded this session", not
// necessarily true long-term dormancy — a real database would track actual
// last-movement timestamps.
// ---------------------------------------------------------------------------

export interface DormantStockRow {
  warehouseCode: string;
  sku: string;
  productName: string;
  quantityOnHand: number;
  value: number;
}

export function buildDormantStock(
  ledger: StockLedgerEntry[],
  movements: { productId: string; warehouseId: string }[],
  products: Product[],
  warehouses: Warehouse[]
): DormantStockRow[] {
  const productById = new Map(products.map((p) => [p.id, p]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  const touched = new Set(movements.map((m) => `${m.productId}::${m.warehouseId}`));

  return ledger
    .filter((entry) => entry.quantityOnHand > 0 && !touched.has(`${entry.productId}::${entry.warehouseId}`))
    .map((entry) => ({
      warehouseCode: warehouseById.get(entry.warehouseId)?.code ?? 'Unknown',
      sku: productById.get(entry.productId)?.sku ?? 'Unknown',
      productName: productById.get(entry.productId)?.name ?? 'Unknown',
      quantityOnHand: entry.quantityOnHand,
      value: stockValue(entry),
    }))
    .sort((a, b) => b.value - a.value);
}
