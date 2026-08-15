/**
 * Mock repository implementations. In-memory only — state resets on server
 * restart, and (being module-level) is shared across requests within one
 * dev-server process, which is enough to demo "record a movement, watch the
 * ledger update" end-to-end without a real database.
 *
 * These implement the exact same interfaces a Supabase-backed set would
 * (see src/lib/data/repositories.ts), so swapping later is a one-line change
 * in src/lib/data/index.ts, not a rewrite of any calling code.
 */

import { randomUUID } from 'crypto';
import type { StockLedgerEntry, StockMovement, Warehouse, Product, AdjustmentReasonCode } from '@/lib/domain/inventory';
import type {
  AdjustmentReasonRepository,
  ProductRepository,
  RecordMovementInput,
  StockLedgerRepository,
  StockMovementRepository,
  UserRepository,
  WarehouseRepository,
} from '@/lib/data/repositories';
import { applyMovement } from '@/lib/services/inventory-engine';
import {
  adjustmentReasonCodes,
  products as seedProducts,
  stockLedger as seedLedger,
  users as seedUsers,
  warehouses as seedWarehouses,
} from '@/lib/data/mock/seed';

// Module-level mutable state, seeded once per server process.
const state = {
  ledger: new Map<string, StockLedgerEntry>(seedLedger.map((e) => [ledgerKey(e.productId, e.warehouseId), { ...e }])),
  movements: [] as StockMovement[],
};

function ledgerKey(productId: string, warehouseId: string) {
  return `${productId}::${warehouseId}`;
}

export const mockWarehouseRepository: WarehouseRepository = {
  async list(): Promise<Warehouse[]> {
    return seedWarehouses;
  },
  async getById(id) {
    return seedWarehouses.find((w) => w.id === id) ?? null;
  },
};

export const mockProductRepository: ProductRepository = {
  async list(): Promise<Product[]> {
    return seedProducts;
  },
  async getById(id) {
    return seedProducts.find((p) => p.id === id) ?? null;
  },
  async getBySku(sku) {
    return seedProducts.find((p) => p.sku === sku) ?? null;
  },
};

export const mockStockLedgerRepository: StockLedgerRepository = {
  async listAll() {
    return Array.from(state.ledger.values());
  },
  async listByWarehouse(warehouseId) {
    return Array.from(state.ledger.values()).filter((e) => e.warehouseId === warehouseId);
  },
  async get(productId, warehouseId) {
    return state.ledger.get(ledgerKey(productId, warehouseId)) ?? null;
  },
};

export const mockStockMovementRepository: StockMovementRepository = {
  async listByProduct(productId, warehouseId) {
    return state.movements.filter(
      (m) => m.productId === productId && (!warehouseId || m.warehouseId === warehouseId)
    );
  },
  async record(input: RecordMovementInput) {
    const key = ledgerKey(input.productId, input.warehouseId);
    const current = state.ledger.get(key) ?? null;

    const ledger = applyMovement(current, {
      productId: input.productId,
      warehouseId: input.warehouseId,
      movementType: input.movementType,
      quantity: input.quantity,
      unitCost: input.unitCost,
    });
    state.ledger.set(key, ledger);

    const movement: StockMovement = {
      id: randomUUID(),
      productId: input.productId,
      warehouseId: input.warehouseId,
      movementType: input.movementType,
      quantity: input.quantity,
      unitCost: input.unitCost,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };
    state.movements.push(movement);

    return { movement, ledger };
  },
};

export const mockAdjustmentReasonRepository: AdjustmentReasonRepository = {
  async list(): Promise<AdjustmentReasonCode[]> {
    return adjustmentReasonCodes;
  },
};

export const mockUserRepository: UserRepository = {
  async findByEmail(email) {
    return seedUsers.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  },
  async getById(id) {
    return seedUsers.find((u) => u.id === id) ?? null;
  },
};
