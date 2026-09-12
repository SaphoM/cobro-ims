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
  AuditLogEntry,
  CreditNote,
  Customer,
  GoodsReceipt,
  InterWarehouseTransfer,
  Invoice,
  InvoicePayment,
  LabelPermission,
  PoStatus,
  Product,
  ProductBomLine,
  PurchaseOrder,
  PurchaseOrderLine,
  Role,
  SalesOrder,
  SalesOrderStatus,
  StockAdjustment,
  StockLedgerEntry,
  StockMovement,
  StockMovementType,
  Supplier,
  TransferStatus,
  User,
  UUID,
  ISODateTime,
  Warehouse,
} from '@/lib/domain/inventory';

export interface CreateWarehouseInput {
  code: string;
  name: string;
  address: string | null;
  type: 'store' | 'engineer_station';
  ownerUserId: string | null;
}

export interface WarehouseRepository {
  list(): Promise<Warehouse[]>;
  getById(id: string): Promise<Warehouse | null>;
  /** Creates a new location. Used today only to auto-create an Engineer's
   *  own station when their user account is created — see
   *  src/app/dashboard/users/actions.ts. */
  create(input: CreateWarehouseInput): Promise<Warehouse>;
  /** The one station belonging to this user, if any — null for every role
   *  except Engineer / Requester. */
  getByOwner(ownerUserId: string): Promise<Warehouse | null>;
}

export interface RoleRepository {
  list(): Promise<Role[]>;
  getById(id: string): Promise<Role | null>;
}

export interface WriteAuditEntryInput {
  tableName: string;
  recordId: string;
  action: 'insert' | 'update' | 'delete';
  changedBy: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Append-only by construction: this interface has no update/delete method,
 * only `write` and `list`. The real Postgres immutability requirement (RFQ:
 * "No record in the audit log may be deleted or modified — enforced at the
 * database level") still needs the DB-level trigger in the migration when a
 * live project exists — this mock can't enforce anything a caller with
 * direct state access chooses to ignore, but no caller here is given any
 * way to mutate or remove an entry once written.
 */
export interface AuditLogRepository {
  write(input: WriteAuditEntryInput): Promise<AuditLogEntry>;
  list(limit?: number): Promise<AuditLogEntry[]>;
}

export interface CreateProductInput {
  sku: string;
  name: string;
  unitOfMeasure: string;
  barcode?: string | null;
  reorderPoint?: number | null;
  reorderQuantity?: number | null;
  unitPrice?: number | null;
}

export interface AddBomLineInput {
  parentProductId: string;
  componentProductId: string;
  quantity: number;
}

/** Editable catalogue fields for a product. Price is edited separately via
 *  setUnitPrice (manage_pricing); SKU is the immutable business key. */
export interface UpdateProductInput {
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
  /** Edit a product's catalogue fields (name, unit, barcode, reorder thresholds). */
  update(id: string, input: UpdateProductInput): Promise<Product>;
  /** Permanently remove a product. Throws a friendly error if it is still
   *  referenced by stock, movements or documents (referential integrity). */
  delete(id: string): Promise<void>;
  /**
   * Changes a product's standing price. Separate from `create` because it is
   * separately permissioned - only `manage_pricing` may call it - and it is
   * the one product field that changes on its own schedule.
   */
  setUnitPrice(productId: string, unitPrice: number | null): Promise<Product>;
  /**
   * Flat parent -> component BOM only — the schema/migration's committed
   * shape. Whether Cobro needs nested/multi-level BOM (e.g. a palletised
   * product built from sub-assemblies) is still a BUSINESS DECISION
   * REQUIRED item (docs/ARCHITECTURE.md §5.3); this isn't blocked on that
   * decision, it's the flat model the schema already settled on.
   */
  listBom(parentProductId: string): Promise<ProductBomLine[]>;
  addBomLine(input: AddBomLineInput): Promise<ProductBomLine>;
  removeBomLine(lineId: string): Promise<void>;
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
  /** Batch / lot / delivery-note reference, recorded on the movement. */
  batchRef?: string | null;
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

export type UpdateSupplierInput = CreateSupplierInput;

export interface SupplierRepository {
  list(): Promise<Supplier[]>;
  create(input: CreateSupplierInput): Promise<Supplier>;
  update(id: string, input: UpdateSupplierInput): Promise<Supplier>;
  /** Permanently remove a supplier. Throws a friendly error if it is still
   *  referenced by purchase orders (referential integrity). */
  delete(id: string): Promise<void>;
}

export interface CreateCustomerInput {
  name: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
}

export type UpdateCustomerInput = CreateCustomerInput;

export interface CustomerRepository {
  list(): Promise<Customer[]>;
  create(input: CreateCustomerInput): Promise<Customer>;
  update(id: string, input: UpdateCustomerInput): Promise<Customer>;
  /** Permanently remove a department. Throws a friendly error if it is still
   *  referenced by requisitions/invoices (referential integrity). */
  delete(id: string): Promise<void>;
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
  /** What product/quantity this transfer actually carries - one transfer is
   *  one product/quantity pair today (see InitiateTransferInput; there is no
   *  multi-line transfer yet). Used to show what a transfer IS on the
   *  Transfers page and, for a station-to-store return, to check a Stores
   *  scan against the right product before completing it. Still answers
   *  after the transfer completes, unlike the in-flight-only bookkeeping
   *  `complete()` itself needs. */
  getLine(transferId: string): Promise<{ productId: string; quantity: number } | null>;
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
  getById(orderId: string): Promise<SalesOrder | null>;
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
  /**
   * Reduces what's owed without being a payment. Outstanding is always
   * total - amountPaid - creditedAmount; status flips to 'paid' the same
   * way a payment closing the balance out would.
   */
  issueCreditNote(invoiceId: string, amount: number, reason: string, issuedBy: string): Promise<{ invoice: Invoice; creditNote: CreditNote }>;
  listCreditNotes(invoiceId: string): Promise<CreditNote[]>;
}

/**
 * App-wide settings. Currently just one flag, but it is a repository rather
 * than a constant because it is operator-controlled state that has to
 * survive alongside the rest of the data and will move to Supabase with it.
 */
export interface AppSettings {
  /**
   * When false, roles without `manage_pricing` see no money anywhere -
   * prices, unit costs, weighted-average cost and stock values are all
   * withheld. Admin always sees them regardless.
   */
  showCostsToAllRoles: boolean;
}

export interface SettingsRepository {
  get(): Promise<AppSettings>;
  setShowCostsToAllRoles(visible: boolean): Promise<AppSettings>;
}

export interface CreateUserInput {
  email: string;
  fullName: string;
  roleId: string;
  /** Only meaningful for the Engineer / Requester role — see User.area. */
  area?: string | null;
}

/**
 * Result of creating a user. `temporaryPassword` is a freshly generated,
 * per-user one-time password the admin hands to the new employee; it is shown
 * once and never stored in plaintext. The new account is flagged
 * must_change_password so the employee is forced to change it on first login.
 */
export interface CreateUserResult {
  user: User;
  temporaryPassword: string;
}

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  getById(id: string): Promise<User | null>;
  list(): Promise<User[]>;
  create(input: CreateUserInput): Promise<CreateUserResult>;
  updateRole(userId: string, roleId: string): Promise<User>;
  updateArea(userId: string, area: string | null): Promise<User>;
  /** Admin's per-user override of `create_product_labels` — see
   *  User.labelPermission and hasPermission. */
  setLabelPermission(userId: string, value: LabelPermission): Promise<User>;
  setActive(userId: string, active: boolean): Promise<User>;
  /** RFQ Phase 6: 2FA enrollment status for privileged users. Mock — no real TOTP/authenticator, just the flag a real flow would set. */
  setMfaEnrolled(userId: string, enrolled: boolean): Promise<User>;
}

/**
 * Desktop-to-phone camera handoff (RFQ Phase 5: browser camera scanning).
 *
 * A desktop browser has no rear camera worth scanning with, so "Scan with
 * camera" on desktop hands the job to the user's phone instead: the desktop
 * creates one of these, shows it as a QR the phone scans, and polls until
 * the phone has resolved it. This is NOT the inventory QR/barcode itself -
 * it carries only an opaque token identifying this handoff, never a
 * barcode, a credential, or any inventory data. See
 * src/components/scanner/camera-scanner.tsx.
 *
 * Single-use and short-lived by construction: `status` moves
 * pending -> resolved (or -> expired) and never back, and a resolved or
 * expired session is never reused for a second scan - the desktop opens a
 * fresh one every time "Scan with camera" is clicked.
 */
export type ScanHandoffStatus = 'pending' | 'resolved' | 'expired';

export interface ScanHandoffSession {
  /** The opaque token - the only thing that ever appears in the QR or URL. */
  id: UUID;
  /** Whoever's desktop session created this - resolving belongs to whatever
   *  phone scans the QR, but reading the result back is restricted to this
   *  same authenticated user (see ScanHandoffRepository.get). */
  initiatingUserId: UUID;
  createdAt: ISODateTime;
  expiresAt: ISODateTime;
  status: ScanHandoffStatus;
  /** Who the resolved scan is attributed to. The phone never signs in (see
   *  src/lib/scan-handoff-actions.ts's "ATTRIBUTION" comment), so this is
   *  always the same as `initiatingUserId` - kept as a separate field, not
   *  merged into it, because it names WHO THE ACTION IS RECORDED AGAINST
   *  regardless of how that gets decided, which is a distinct question from
   *  "who created this session" even though today they're always equal. */
  resolvedByUserId: UUID | null;
  /** The raw scanned string, once resolved - handed back to the desktop
   *  exactly as if its own camera had decoded it. Never a mutating action by
   *  itself; whatever the desktop does with it goes through the same
   *  permission-checked Server Action any other scan result would. */
  result: string | null;
}

export interface ScanHandoffRepository {
  /** Creates a new pending session for `initiatingUserId`, expiring in a few
   *  minutes. */
  create(initiatingUserId: UUID): Promise<ScanHandoffSession>;
  /** Read-only status check. Returns null for an id that never existed - a
   *  guessed/mistyped token must look identical to an expired one, not leak
   *  which is which. Callers additionally sweep `status` to 'expired' past
   *  `expiresAt` even though nothing has resolved it, so a stale session
   *  reads as expired rather than perpetually pending. */
  get(id: UUID): Promise<ScanHandoffSession | null>;
  /** Marks a still-pending, unexpired session resolved with the scanned
   *  value and who scanned it. Throws if the session doesn't exist, has
   *  already been resolved (single-use), or has expired - the phone gets a
   *  clear reason rather than a silent no-op. */
  resolve(id: UUID, resolvedByUserId: UUID, result: string): Promise<ScanHandoffSession>;
}
