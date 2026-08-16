/**
 * Repository interfaces — the seam between domain/business logic and the
 * data source. Everything above this line (services, UI) must depend only
 * on these interfaces, never on how data is actually fetched.
 *
 * Today: `src/lib/data/mock` implements these against in-memory seed data.
 * Later: a `src/lib/data/supabase` implementation swaps in without any
 * caller changing, driven by `src/lib/data/index.ts`'s DATA_SOURCE switch.
 */

import type {
  AdjustmentReasonCode,
  AdjustmentStatus,
  Customer,
  GoodsReceipt,
  InterWarehouseTransfer,
  Invoice,
  InvoicePayment,
  PoStatus,
  Product,
  ProductBomLine,
  PurchaseOrder,
  PurchaseOrderLine,
  SalesOrder,
  SalesOrderStatus,
  StockAdjustment,
  StockLedgerEntry,
  StockMovement,
  StockMovementType,
  Supplier,
  TransferStatus,
  User,
  Warehouse,
} from '@/lib/domain/inventory';

export interface WarehouseRepository {
  list(): Promise<Warehouse[]>;
  getById(id: string): Promise<Warehouse | null>;
}

export interface CreateProductInput {
  sku: string;
  name: string;
  unitOfMeasure: string;
  barcode?: string | null;
  reorderPoint?: number | null;
  reorderQuantity?: number | null;
}

export interface ProductRepository {
  list(): Promise<Product[]>;
  getById(id: string): Promise<Product | null>;
  getBySku(sku: string): Promise<Product | null>;
  /** Barcode/QR lookup — RFQ Phase 5. Matches on the exact barcode value scanned. */
  getByBarcode(barcode: string): Promise<Product | null>;
  create(input: CreateProductInput): Promise<Product>;
  listBom(parentProductId: string): Promise<ProductBomLine[]>;
}

export interface StockLedgerRepository {
  listAll(): Promise<StockLedgerEntry[]>;
  listByWarehouse(warehouseId: string): Promise<StockLedgerEntry[]>;
  get(productId: string, warehouseId: string): Promise<StockLedgerEntry | null>;
  /**
   * Adjusts quantity_reserved directly — this is a ledger-state change, not
   * a stock movement (it doesn't affect quantity_on_hand or WAC), which is
   * why it lives here rather than going through applyMovement. Positive
   * delta reserves more; negative releases. Throws if it would take
   * reserved above on-hand or below zero.
   */
  adjustReserved(productId: string, warehouseId: string, delta: number): Promise<StockLedgerEntry>;
}

export interface RecordMovementInput {
  productId: string;
  warehouseId: string;
  movementType: StockMovementType;
  quantity: number; // signed
  unitCost: number;
  referenceType?: string;
  referenceId?: string;
  createdBy: string;
}

export interface StockMovementRepository {
  listByProduct(productId: string, warehouseId?: string): Promise<StockMovement[]>;
  listRecent(limit?: number): Promise<StockMovement[]>;
  /**
   * Records a movement AND updates the derived stock_ledger snapshot
   * (quantity + weighted-average cost) atomically. This is the one write
   * path every stock-affecting workflow (GRN, dispatch, transfer,
   * adjustment) must go through — see src/lib/services/inventory-engine.ts.
   */
  record(input: RecordMovementInput): Promise<{ movement: StockMovement; ledger: StockLedgerEntry }>;
}

export interface CreateSupplierInput {
  name: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
}

export interface SupplierRepository {
  list(): Promise<Supplier[]>;
  create(input: CreateSupplierInput): Promise<Supplier>;
}

export interface CreateCustomerInput {
  name: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
}

export interface CustomerRepository {
  list(): Promise<Customer[]>;
  create(input: CreateCustomerInput): Promise<Customer>;
}

export interface QuickReceiveInput {
  supplierId: string;
  warehouseId: string;
  productId: string;
  quantity: number;
  unitCost: number;
  receivedBy: string;
}

/**
 * GRN receiving. `quickReceive` creates the PO + PO line + GRN + GRN line in
 * one step and immediately posts the stock movement, for the legitimate
 * ad-hoc case (no formal PO was ever raised). `receiveAgainstPurchaseOrder`
 * on PurchaseOrderRepository below is the other path — receiving against an
 * already-issued PO, with partial-receipt support.
 */
export interface ReceivingRepository {
  listRecentReceipts(limit?: number): Promise<GoodsReceipt[]>;
  quickReceive(input: QuickReceiveInput): Promise<{ purchaseOrder: PurchaseOrder; goodsReceipt: GoodsReceipt }>;
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  warehouseId: string;
  productId: string;
  quantity: number;
  unitCost: number;
  createdBy: string;
}

/** A PurchaseOrder joined with its (single, see domain comment) line, for list/detail views. */
export interface PurchaseOrderWithLine extends PurchaseOrder {
  line: PurchaseOrderLine;
}

/**
 * Full PO lifecycle: draft (editable, nothing posted) -> issue (sent to
 * supplier, locks the line) -> receive one or more times against it
 * (partial receipts supported; each posts a GRN + a 'receipt' stock
 * movement at the PO's quoted unit cost) until quantity_received reaches
 * quantity_ordered, at which point status becomes 'received'.
 */
export interface PurchaseOrderRepository {
  list(): Promise<PurchaseOrderWithLine[]>;
  create(input: CreatePurchaseOrderInput): Promise<PurchaseOrderWithLine>;
  issue(poId: string): Promise<PurchaseOrderWithLine>;
  receive(
    poId: string,
    quantity: number,
    receivedBy: string
  ): Promise<{ purchaseOrder: PurchaseOrderWithLine; goodsReceipt: GoodsReceipt }>;
  getStatus(poId: string): Promise<PoStatus | null>;
}

export interface InitiateTransferInput {
  fromWarehouseId: string;
  toWarehouseId: string;
  productId: string;
  quantity: number;
  initiatedBy: string;
}

export interface TransferRepository {
  list(): Promise<InterWarehouseTransfer[]>;
  /** Posts the transfer_out movement at the source warehouse immediately; ledger cost carried is the source's current WAC. */
  initiate(input: InitiateTransferInput): Promise<InterWarehouseTransfer>;
  /** Posts the transfer_in movement at the destination, closing out an in-transit transfer. */
  complete(transferId: string, completedBy: string): Promise<InterWarehouseTransfer>;
  getStatus(transferId: string): Promise<TransferStatus | null>;
}

export interface AdjustmentReasonRepository {
  list(): Promise<AdjustmentReasonCode[]>;
}

export interface RequestAdjustmentInput {
  warehouseId: string;
  reasonCodeId: string;
  productId: string;
  quantityDelta: number; // signed: +found / -missing
  unitCost: number;
  requestedBy: string;
}

export interface StockAdjustmentRepository {
  list(): Promise<StockAdjustment[]>;
  request(input: RequestAdjustmentInput): Promise<StockAdjustment>;
  /** Approving posts the stock movement (adjustment or write_off, by sign); rejecting never touches the ledger. */
  decide(adjustmentId: string, decision: Exclude<AdjustmentStatus, 'pending_approval'>, decidedBy: string): Promise<StockAdjustment>;
}

export interface CreateSalesOrderInput {
  customerId: string;
  warehouseId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  createdBy: string;
}

/**
 * Order flow: draft (nothing reserved yet) -> confirm (reserves stock,
 * quantity_reserved only, no movement) -> dispatch (posts the 'dispatch'
 * stock_movements row and releases the matching reservation) or cancel from
 * draft/confirmed (releases any reservation, posts nothing).
 */
export interface SalesOrderRepository {
  list(): Promise<SalesOrder[]>;
  create(input: CreateSalesOrderInput): Promise<SalesOrder>;
  confirm(orderId: string): Promise<SalesOrder>;
  dispatch(orderId: string, dispatchedBy: string): Promise<SalesOrder>;
  cancel(orderId: string): Promise<SalesOrder>;
  getStatus(orderId: string): Promise<SalesOrderStatus | null>;
}

/**
 * One invoice per dispatched sales order. `generateFromSalesOrder` computes
 * subtotal/VAT/total from the order's quantity*unitPrice and the current
 * VAT_RATE (src/lib/domain/inventory.ts), and sets a 30-day due date —
 * matching Cobro's own payment terms as vendor to Productivity SA. Throws if
 * the order isn't dispatched yet or already has an invoice.
 */
export interface InvoiceRepository {
  list(): Promise<Invoice[]>;
  getBySalesOrderId(salesOrderId: string): Promise<Invoice | null>;
  generateFromSalesOrder(salesOrderId: string, createdBy: string): Promise<Invoice>;
  /** Partial payments supported — status becomes 'partially_paid' or 'paid' depending on the running total. */
  recordPayment(invoiceId: string, amount: number, recordedBy: string): Promise<{ invoice: Invoice; payment: InvoicePayment }>;
  listPayments(invoiceId: string): Promise<InvoicePayment[]>;
}

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  getById(id: string): Promise<User | null>;
  list(): Promise<User[]>;
}
