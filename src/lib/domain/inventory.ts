/**
 * Domain types for Cobro IMS — Foundation + Phase 2 (Core Inventory
 * Operations). Mirrors supabase/migrations/20260815120000_foundation_and_core_inventory.sql.
 *
 * Keep this file and the migration in sync by hand for now. Once a real
 * Supabase project exists, `supabase gen types typescript` can take over
 * generation and this file becomes the seam we replace.
 */

export type UUID = string;
export type ISODateTime = string;

export interface Role {
  id: UUID;
  name: string;
  description: string | null;
  permissions: Record<string, boolean>;
  createdAt: ISODateTime;
}

export interface User {
  id: UUID;
  email: string;
  fullName: string;
  roleId: UUID;
  isActive: boolean;
  mfaEnrolled: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Warehouse {
  id: UUID;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
  createdAt: ISODateTime;
}

export interface ProductCategory {
  id: UUID;
  name: string;
  parentId: UUID | null;
}

export interface Product {
  id: UUID;
  sku: string;
  name: string;
  description: string | null;
  categoryId: UUID | null;
  unitOfMeasure: string;
  barcode: string | null;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  isActive: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ProductBomLine {
  id: UUID;
  parentProductId: UUID;
  componentProductId: UUID;
  quantity: number;
}

export interface Supplier {
  id: UUID;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: ISODateTime;
}

export type PoStatus = 'draft' | 'issued' | 'partially_received' | 'received' | 'cancelled';

export interface PurchaseOrder {
  id: UUID;
  poNumber: string;
  supplierId: UUID;
  warehouseId: UUID;
  status: PoStatus;
  orderedAt: ISODateTime | null;
  expectedAt: string | null;
  createdBy: UUID;
  createdAt: ISODateTime;
}

export interface PurchaseOrderLine {
  id: UUID;
  purchaseOrderId: UUID;
  productId: UUID;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
}

export type GrnStatus = 'draft' | 'posted';

export interface GoodsReceipt {
  id: UUID;
  grnNumber: string;
  purchaseOrderId: UUID;
  warehouseId: UUID;
  status: GrnStatus;
  receivedBy: UUID | null;
  receivedAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface GoodsReceiptLine {
  id: UUID;
  goodsReceiptId: UUID;
  purchaseOrderLineId: UUID;
  productId: UUID;
  quantityReceived: number;
  unitCost: number;
}

export type TransferStatus = 'in_transit' | 'completed' | 'cancelled';

export interface InterWarehouseTransfer {
  id: UUID;
  transferNumber: string;
  fromWarehouseId: UUID;
  toWarehouseId: UUID;
  status: TransferStatus;
  initiatedBy: UUID;
  initiatedAt: ISODateTime;
  completedAt: ISODateTime | null;
}

export interface InterWarehouseTransferLine {
  id: UUID;
  transferId: UUID;
  productId: UUID;
  quantity: number;
}

export type AdjustmentStatus = 'pending_approval' | 'approved' | 'rejected';

export interface AdjustmentReasonCode {
  id: UUID;
  code: string;
  description: string;
  requiresApproval: boolean;
}

export interface StockAdjustment {
  id: UUID;
  adjustmentNumber: string;
  warehouseId: UUID;
  reasonCodeId: UUID;
  status: AdjustmentStatus;
  requestedBy: UUID;
  requestedAt: ISODateTime;
  approvedBy: UUID | null;
  approvedAt: ISODateTime | null;
}

export interface StockAdjustmentLine {
  id: UUID;
  stockAdjustmentId: UUID;
  productId: UUID;
  quantityDelta: number;
  unitCost: number;
}

/** Current on-hand snapshot per product+warehouse. Derived from stock_movements. */
export interface StockLedgerEntry {
  productId: UUID;
  warehouseId: UUID;
  quantityOnHand: number;
  quantityReserved: number;
  weightedAverageCost: number;
  updatedAt: ISODateTime;
}

export type StockMovementType =
  | 'receipt'
  | 'dispatch'
  | 'transfer_out'
  | 'transfer_in'
  | 'adjustment'
  | 'write_off';

/** Append-only. This is the audit-critical table the stock ledger is derived from. */
export interface StockMovement {
  id: UUID;
  productId: UUID;
  warehouseId: UUID;
  movementType: StockMovementType;
  quantity: number; // signed: positive = in, negative = out
  unitCost: number;
  referenceType: string | null;
  referenceId: UUID | null;
  createdBy: UUID;
  createdAt: ISODateTime;
}

export interface AuditLogEntry {
  id: UUID;
  tableName: string;
  recordId: UUID;
  action: 'insert' | 'update' | 'delete';
  changedBy: UUID | null;
  changedAt: ISODateTime;
  before: unknown;
  after: unknown;
}

/** Convenience shape for UI: a stock ledger row joined with its product/warehouse. */
export interface StockLedgerView extends StockLedgerEntry {
  product: Product;
  warehouse: Warehouse;
  stockValue: number; // quantityOnHand * weightedAverageCost
  isBelowReorderPoint: boolean;
}

// ---------------------------------------------------------------------------
// RFQ Phase 3 — Sales, Procurement and Supplier Management
// ---------------------------------------------------------------------------

export interface Customer {
  id: UUID;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: ISODateTime;
}

export type SalesOrderStatus = 'draft' | 'confirmed' | 'dispatched' | 'cancelled';

/**
 * Modelled as a single line per order for now (matches the interaction
 * pattern already established by GRN/transfer/adjustment quick-entry
 * flows). Multi-line orders are a natural UI extension later — nothing in
 * the shape below blocks it, `sales_order_lines` is still a proper child
 * table, this is just the current UI's scope.
 */
export interface SalesOrder {
  id: UUID;
  orderNumber: string;
  customerId: UUID;
  warehouseId: UUID;
  productId: UUID;
  quantityOrdered: number;
  unitPrice: number;
  status: SalesOrderStatus;
  createdBy: UUID;
  createdAt: ISODateTime;
  confirmedAt: ISODateTime | null;
  dispatchedAt: ISODateTime | null;
}
