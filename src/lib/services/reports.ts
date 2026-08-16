/**
 * Reporting — RFQ Phase 5 ("Dashboards & Reports: 15+ standard reports, live
 * dashboard, PDF/Excel export"). This file is the pure-function layer:
 * given already-fetched domain records, build the rows a report table
 * needs. No I/O here — pages fetch via the repositories, then call these.
 *
 * Six reports today, not the full 15+ the RFQ eventually wants — see
 * docs/ARCHITECTURE.md for the running list of what's still missing
 * (dispatch/pick-list reports, supplier performance, BOM explosion, etc.).
 */

import { stockValue } from '@/lib/services/inventory-engine';
import type {
  Customer,
  Invoice,
  Product,
  PurchaseOrderLine,
  PurchaseOrder,
  SalesOrder,
  StockLedgerEntry,
  Supplier,
  Warehouse,
} from '@/lib/domain/inventory';

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
      const outstanding = Math.round((inv.total - inv.amountPaid) * 100) / 100;
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
