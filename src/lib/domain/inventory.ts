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

/**
 * Per-user override for the `create_product_labels` capability, the ONE
 * permission Admin can grant/revoke below the role level (8 September
 * follow-up). `inherited` = follow the role default; `allowed`/`revoked` =
 * explicit Admin decision that beats the role default either way. This is
 * deliberately a single typed field, not a generic per-user permission bag
 * — nothing else in the RBAC model is overridable per user, and inventing a
 * parallel authorisation system for one capability would be more machinery
 * than this needs. See `hasPermission` in src/lib/permissions.ts for where
 * it's resolved (one place, so every caller gets the effective answer).
 */
export type LabelPermission = 'inherited' | 'allowed' | 'revoked';

export interface User {
  id: UUID;
  email: string;
  fullName: string;
  roleId: UUID;
  /**
   * Factory section/area — only meaningful for the Engineer / Requester
   * role (which section they request stock on behalf of). Null for every
   * other role. See src/lib/areas.ts for the selectable list.
   */
  area: string | null;
  /**
   * Admin's per-user override of `create_product_labels`. `inherited` on
   * every user until an Admin changes it. Deliberately NOT cleared on a
   * role change (unlike `area`): an explicit grant/revoke is a decision
   * about the person, not their role, and must survive them moving roles —
   * see updateUserRoleAction and §15 of the spec.
   */
  labelPermission: LabelPermission;
  isActive: boolean;
  mfaEnrolled: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * A stock location the WAC engine tracks on-hand/reserved/WAC for. Two kinds:
 *
 *   'store'            — a real physical warehouse (the original concept).
 *   'engineer_station' — a personal holding location for one Engineer /
 *                         Requester (`ownerUserId`), auto-created when that
 *                         user is created (see src/app/dashboard/users/actions.ts).
 *                         Stock an Engineer has accepted (picked up) but not
 *                         yet used sits here — visible to everyone the same
 *                         way a store's stock is, so another Engineer can
 *                         requisition unused stock straight off it instead
 *                         of waiting on a fresh store pickup. See
 *                         docs/ARCHITECTURE.md §1 for the full workflow.
 *
 * Every existing repository/report that iterates "warehouses" already works
 * unchanged for a station — it's a Warehouse row like any other, not a
 * parallel system. `type`/`ownerUserId` only matter to the two places that
 * need to tell a station apart from a store: who may create one (Admin, via
 * user creation) and who may approve a requisition sourced from one (the
 * station's own owner, not Stores) — see confirmSalesOrderAction.
 */
export interface Warehouse {
  id: UUID;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
  type: 'store' | 'engineer_station';
  /** Set only when `type === 'engineer_station'` — that Engineer's user id. */
  ownerUserId: UUID | null;
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
  /**
   * The product's own price, set on the catalogue and changed only by a role
   * holding `manage_pricing`. Deliberately NOT the same number as a stock
   * movement's `unitCost`: unit cost is what one particular delivery
   * actually cost and is what weighted-average cost is derived from, whereas
   * this is the standing price for the item. Null means no price is set yet.
   */
  unitPrice: number | null;
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
  | 'write_off'
  /** An Engineer / Requester consuming stock already sitting at their own
   *  station (posted by the "Use" mode on /dashboard/scan). Outbound, same
   *  as `dispatch` - it leaves tracked inventory for good - but kept as its
   *  own type so "how much has this Engineer actually used" is a distinct,
   *  reportable figure rather than indistinguishable from a store issuing
   *  stock outward. See src/lib/domain/inventory.ts's Warehouse doc comment
   *  for the full accept/use workflow. */
  | 'usage';

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
  /**
   * Free-text batch / lot / delivery-note reference captured at scan time,
   * so a movement can be traced back to the consignment it arrived on.
   * Recorded on the movement only - on-hand is still one figure per product
   * per store, not split per batch.
   */
  batchRef: string | null;
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
