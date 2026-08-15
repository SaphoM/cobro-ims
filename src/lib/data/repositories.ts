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
  GoodsReceipt,
  InterWarehouseTransfer,
  Product,
  ProductBomLine,
  PurchaseOrder,
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
  create(input: CreateProductInput): Promise<Product>;
  listBom(parentProductId: string): Promise<ProductBomLine[]>;
}

export interface StockLedgerRepository {
  listAll(): Promise<StockLedgerEntry[]>;
  listByWarehouse(warehouseId: string): Promise<StockLedgerEntry[]>;
  get(productId: string, warehouseId: string): Promise<StockLedgerEntry | null>;
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

export interface SupplierRepository {
  list(): Promise<Supplier[]>;
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
 * one step and immediately posts the stock movement — a deliberate
 * simplification while full Purchase Order lifecycle management (RFQ Phase
 * 3) doesn't exist yet. The schema still models PO -> GRN properly
 * underneath, so this isn't a shortcut that needs undoing later, just a
 * thinner entry point into it.
 */
export interface ReceivingRepository {
  listRecentReceipts(limit?: number): Promise<GoodsReceipt[]>;
  quickReceive(input: QuickReceiveInput): Promise<{ purchaseOrder: PurchaseOrder; goodsReceipt: GoodsReceipt }>;
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

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  getById(id: string): Promise<User | null>;
  list(): Promise<User[]>;
}
