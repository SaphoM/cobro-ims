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
  /**
   * Engineers work AT an asset — this is the asset they're associated with,
   * and it scopes what their dashboard shows and which notifications reach
   * them. Null for Admin and Store, who aren't tied to one asset.
   */
  assetId: UUID | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * Cobro runs ONE physical store. Everything else that holds stock is an
 * asset — a machine or workshop where stock is used. Both are stock
 * locations, so they share one type and one id-space, which is what lets the
 * ledger key on `productId::locationId` and lets a movement run Store→Asset,
 * Asset→Asset or Asset→Store through the same code path.
 *
 * The type is still named `Warehouse` deliberately: the ledger, the WAC
 * engine and every movement already key on `warehouseId`, and renaming that
 * field would touch the inventory engine for zero user-visible benefit. This
 * mirrors the decision made when Sales & Dispatch became Requisitions —
 * terminology and behaviour changed, internal identifiers did not.
 */
export type LocationKind = 'store' | 'asset';

export interface Warehouse {
  id: UUID;
  code: string;
  name: string;
  /** Asset description — surfaced on the Assets page. */
  description: string | null;
  kind: LocationKind;
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

/** Current on-hand snapshot per product+location. Derived from stock_movements. */
export interface StockLedgerEntry {
  productId: UUID;
  warehouseId: UUID;
  quantityOnHand: number;
  quantityReserved: number;
  weightedAverageCost: number;
  /**
   * When stock last arrived at this location. Set on every inbound movement.
   * Idle-stock detection measures age from here: stock sitting at an asset
   * with no inbound refresh and no outbound use is what goes stale.
   */
  lastInboundAt: ISODateTime | null;
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

export type SalesOrderStatus =
  | 'draft'
  | 'confirmed'
  | 'partially_fulfilled'
  | 'dispatched'
  | 'cancelled';

/**
 * Requisition vs transfer. The UI presents both on one page, but the records
 * stay distinguishable because they are different business events:
 *
 *  - `requisition` — an ASK. An engineer at an asset requests stock from the
 *    Store. It can sit outstanding, be partially fulfilled, and reserve the
 *    shortfall.
 *  - `transfer` — a MOVE. Stock physically relocates (Asset→Asset, or
 *    Asset→Store as a return). There is no "asking" step.
 */
export type MovementKind = 'requisition' | 'transfer';

/**
 * One requisition or transfer line. Replaces the old SalesOrder's
 * customerId/warehouseId pair with an explicit from→to across the unified
 * location list, which is what makes Store→Asset, Asset→Asset and
 * Asset→Store all expressible in one record.
 *
 * Partial fulfilment is first-class: `quantityReceived` is the actual amount
 * handed over, and outstanding is always
 * `quantityOrdered - quantityReceived`. A short fulfilment never closes the
 * record — it moves to `partially_fulfilled` and reserves the shortfall at
 * the source.
 */
export interface SalesOrder {
  id: UUID;
  orderNumber: string;
  kind: MovementKind;
  /** Source location — Store for a requisition, an asset for a return/transfer. */
  fromLocationId: UUID;
  /** Destination location — the requesting asset, or Store for a return. */
  toLocationId: UUID;
  productId: UUID;
  quantityOrdered: number;
  /** Actual quantity handed over so far. Source of truth for fulfilment. */
  quantityReceived: number;
  unitPrice: number;
  status: SalesOrderStatus;
  createdBy: UUID;
  createdAt: ISODateTime;
  confirmedAt: ISODateTime | null;
  dispatchedAt: ISODateTime | null;
}

// ---------------------------------------------------------------------------
// Notifications — role- and asset-aware, generated by workflow events
// ---------------------------------------------------------------------------

/** Which roles a notification is addressed to. */
export type NotificationAudience = 'admin' | 'store' | 'engineer';

export interface AppNotification {
  id: UUID;
  /** Roles this reaches. A requisition notifies store + admin, for example. */
  audience: NotificationAudience[];
  /**
   * When set, only engineers attached to THIS asset see it. Admin and Store
   * see it regardless (they have organisation-wide oversight).
   */
  assetId: UUID | null;
  title: string;
  body: string;
  /** Optional in-app destination, e.g. '/dashboard/requisitions'. */
  href: string | null;
  /** Marks the idle-stock prompt so the UI can offer a return action. */
  kind: 'general' | 'idle_stock';
  /** For idle_stock — what to offer returning. */
  productId: UUID | null;
  createdAt: ISODateTime;
  readBy: UUID[];
}

// ---------------------------------------------------------------------------
// RFQ Phase 4 — Invoicing & Billing
// ---------------------------------------------------------------------------

export type InvoiceStatus = 'unpaid' | 'partially_paid' | 'paid' | 'cancelled';

/**
 * The current SARS VAT rate. Not a Claude Code assumption — 15% is the
 * factual current rate. What IS an open question (BUSINESS DECISION
 * REQUIRED, see docs/ARCHITECTURE.md): whether any Cobro customers are
 * VAT-exempt (e.g. export sales) and need a 0%-rated invoice path, which
 * this model doesn't handle yet — every invoice here is standard-rated.
 */
export const VAT_RATE = 0.15;

/** One invoice per dispatched sales order (mirrors the order's single-line simplification). */
export interface Invoice {
  id: UUID;
  invoiceNumber: string;
  salesOrderId: UUID;
  customerId: UUID;
  subtotal: number; // ex-VAT, quantityOrdered * unitPrice from the sales order
  vatAmount: number;
  total: number;
  amountPaid: number;
  creditedAmount: number; // total of all credit notes issued against this invoice
  status: InvoiceStatus;
  issuedAt: ISODateTime;
  dueAt: ISODateTime; // issuedAt + payment terms (30 days, matching Cobro's own PO terms)
  createdBy: UUID;
}

export interface InvoicePayment {
  id: UUID;
  invoiceId: UUID;
  amount: number;
  paidAt: ISODateTime;
  recordedBy: UUID;
}

/**
 * Reduces what's owed on an invoice without being a payment — for returns,
 * pricing corrections, or goodwill adjustments. `outstanding` on an invoice
 * is always `total - amountPaid - creditedAmount`; status flips to 'paid'
 * once that reaches zero the same way a payment would close it out.
 */
export interface CreditNote {
  id: UUID;
  creditNoteNumber: string;
  invoiceId: UUID;
  amount: number;
  reason: string;
  issuedAt: ISODateTime;
  issuedBy: UUID;
}
