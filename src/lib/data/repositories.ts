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
  Product,
  StockAdjustment,
  StockLedgerEntry,
  StockMovement,
  StockMovementType,
  User,
  Warehouse,
} from '@/lib/domain/inventory';

export interface WarehouseRepository {
  list(): Promise<Warehouse[]>;
  getById(id: string): Promise<Warehouse | null>;
}

export interface ProductRepository {
  list(): Promise<Product[]>;
  getById(id: string): Promise<Product | null>;
  getBySku(sku: string): Promise<Product | null>;
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
  /**
   * Records a movement AND updates the derived stock_ledger snapshot
   * (quantity + weighted-average cost) atomically. This is the one write
   * path every stock-affecting workflow (GRN, dispatch, transfer,
   * adjustment) must go through — see src/lib/services/inventory-engine.ts.
   */
  record(input: RecordMovementInput): Promise<{ movement: StockMovement; ledger: StockLedgerEntry }>;
}

export interface AdjustmentReasonRepository {
  list(): Promise<AdjustmentReasonCode[]>;
}

export interface StockAdjustmentRepository {
  list(): Promise<StockAdjustment[]>;
}

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  getById(id: string): Promise<User | null>;
}
