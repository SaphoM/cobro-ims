/**
 * Mock repository implementations. In-memory only — state resets on server
 * restart, and (being module-level) is shared across requests within one
 * dev-server process, which is enough to demo full workflows (receive
 * stock, transfer it, adjust it, watch the ledger update) without a real
 * database.
 *
 * These implement the exact same interfaces a Supabase-backed set would
 * (see src/lib/data/repositories.ts), so swapping later is a one-line change
 * in src/lib/data/index.ts, not a rewrite of any calling code.
 */

import { randomUUID } from 'crypto';
import type {
  AdjustmentReasonCode,
  GoodsReceipt,
  InterWarehouseTransfer,
  Product,
  ProductBomLine,
  PurchaseOrder,
  StockAdjustment,
  StockLedgerEntry,
  StockMovement,
  Supplier,
  Warehouse,
} from '@/lib/domain/inventory';
import type {
  AdjustmentReasonRepository,
  CreateProductInput,
  InitiateTransferInput,
  ProductRepository,
  QuickReceiveInput,
  ReceivingRepository,
  RecordMovementInput,
  RequestAdjustmentInput,
  StockAdjustmentRepository,
  StockLedgerRepository,
  StockMovementRepository,
  SupplierRepository,
  TransferRepository,
  UserRepository,
  WarehouseRepository,
} from '@/lib/data/repositories';
import { applyMovement } from '@/lib/services/inventory-engine';
import {
  adjustmentReasonCodes,
  products as seedProducts,
  stockLedger as seedLedger,
  suppliers as seedSuppliers,
  users as seedUsers,
  warehouses as seedWarehouses,
} from '@/lib/data/mock/seed';

// Module-level mutable state, seeded once per server process.
const state = {
  products: [...seedProducts] as Product[],
  ledger: new Map<string, StockLedgerEntry>(seedLedger.map((e) => [ledgerKey(e.productId, e.warehouseId), { ...e }])),
  movements: [] as StockMovement[],
  purchaseOrders: [] as PurchaseOrder[],
  goodsReceipts: [] as GoodsReceipt[],
  transfers: [] as InterWarehouseTransfer[],
  adjustments: [] as StockAdjustment[],
};

let poCounter = 1000;
let grnCounter = 1000;
let transferCounter = 1000;
let adjustmentCounter = 1000;

function ledgerKey(productId: string, warehouseId: string) {
  return `${productId}::${warehouseId}`;
}

async function postMovement(input: RecordMovementInput) {
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
    return state.products;
  },
  async getById(id) {
    return state.products.find((p) => p.id === id) ?? null;
  },
  async getBySku(sku) {
    return state.products.find((p) => p.sku === sku) ?? null;
  },
  async create(input: CreateProductInput) {
    if (state.products.some((p) => p.sku.toLowerCase() === input.sku.toLowerCase())) {
      throw new Error(`SKU "${input.sku}" already exists.`);
    }
    const now = new Date().toISOString();
    const product: Product = {
      id: randomUUID(),
      sku: input.sku,
      name: input.name,
      description: null,
      categoryId: null,
      unitOfMeasure: input.unitOfMeasure,
      barcode: input.barcode ?? null,
      reorderPoint: input.reorderPoint ?? null,
      reorderQuantity: input.reorderQuantity ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    state.products.push(product);
    return product;
  },
  async listBom(): Promise<ProductBomLine[]> {
    return []; // no BOM relationships in the seed data yet
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
  async listRecent(limit = 20) {
    return [...state.movements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  },
  async record(input: RecordMovementInput) {
    return postMovement(input);
  },
};

export const mockSupplierRepository: SupplierRepository = {
  async list(): Promise<Supplier[]> {
    return seedSuppliers;
  },
};

export const mockReceivingRepository: ReceivingRepository = {
  async listRecentReceipts(limit = 20) {
    return [...state.goodsReceipts].sort((a, b) => (b.receivedAt ?? '').localeCompare(a.receivedAt ?? '')).slice(0, limit);
  },
  async quickReceive(input: QuickReceiveInput) {
    const now = new Date().toISOString();
    poCounter += 1;
    grnCounter += 1;
    const poId = randomUUID();
    const poLineId = randomUUID();

    const purchaseOrder: PurchaseOrder = {
      id: poId,
      poNumber: `PO-${poCounter}`,
      supplierId: input.supplierId,
      warehouseId: input.warehouseId,
      status: 'received',
      orderedAt: now,
      expectedAt: null,
      createdBy: input.receivedBy,
      createdAt: now,
    };
    state.purchaseOrders.push(purchaseOrder);
    // purchase_order_lines isn't separately exposed yet (no reader needs it),
    // but keeping the id here documents where it would be created in a real
    // implementation once the full PO lifecycle (Phase 3) exists.
    void poLineId;

    const goodsReceipt: GoodsReceipt = {
      id: randomUUID(),
      grnNumber: `GRN-${grnCounter}`,
      purchaseOrderId: poId,
      warehouseId: input.warehouseId,
      status: 'posted',
      receivedBy: input.receivedBy,
      receivedAt: now,
      createdAt: now,
    };
    state.goodsReceipts.push(goodsReceipt);

    await postMovement({
      productId: input.productId,
      warehouseId: input.warehouseId,
      movementType: 'receipt',
      quantity: Math.abs(input.quantity),
      unitCost: input.unitCost,
      referenceType: 'goods_receipt',
      referenceId: goodsReceipt.id,
      createdBy: input.receivedBy,
    });

    return { purchaseOrder, goodsReceipt };
  },
};

export const mockTransferRepository: TransferRepository = {
  async list() {
    return [...state.transfers].sort((a, b) => b.initiatedAt.localeCompare(a.initiatedAt));
  },
  async initiate(input: InitiateTransferInput) {
    if (input.fromWarehouseId === input.toWarehouseId) {
      throw new Error('Source and destination warehouse must differ.');
    }
    const sourceLedger = state.ledger.get(ledgerKey(input.productId, input.fromWarehouseId));
    if (!sourceLedger || sourceLedger.quantityOnHand < input.quantity) {
      throw new Error('Not enough stock on hand at the source warehouse to transfer that quantity.');
    }

    transferCounter += 1;
    const now = new Date().toISOString();
    const transfer: InterWarehouseTransfer = {
      id: randomUUID(),
      transferNumber: `XFR-${transferCounter}`,
      fromWarehouseId: input.fromWarehouseId,
      toWarehouseId: input.toWarehouseId,
      status: 'in_transit',
      initiatedBy: input.initiatedBy,
      initiatedAt: now,
      completedAt: null,
    };
    state.transfers.push(transfer);

    // The unit cost carried forward is the source warehouse's current WAC —
    // the destination receives stock "at cost", same principle as a GRN.
    await postMovement({
      productId: input.productId,
      warehouseId: input.fromWarehouseId,
      movementType: 'transfer_out',
      quantity: -Math.abs(input.quantity),
      unitCost: sourceLedger.weightedAverageCost,
      referenceType: 'inter_warehouse_transfer',
      referenceId: transfer.id,
      createdBy: input.initiatedBy,
    });

    // Track quantity + cost on the transfer record itself via a side map so
    // `complete()` can post the matching transfer_in without re-deriving it.
    pendingTransferLines.set(transfer.id, {
      productId: input.productId,
      quantity: Math.abs(input.quantity),
      unitCost: sourceLedger.weightedAverageCost,
      toWarehouseId: input.toWarehouseId,
    });

    return transfer;
  },
  async complete(transferId, completedBy) {
    const transfer = state.transfers.find((t) => t.id === transferId);
    if (!transfer) throw new Error('Transfer not found.');
    if (transfer.status !== 'in_transit') throw new Error(`Transfer is already ${transfer.status}.`);

    const line = pendingTransferLines.get(transferId);
    if (!line) throw new Error('Transfer line details missing — cannot complete.');

    await postMovement({
      productId: line.productId,
      warehouseId: line.toWarehouseId,
      movementType: 'transfer_in',
      quantity: line.quantity,
      unitCost: line.unitCost,
      referenceType: 'inter_warehouse_transfer',
      referenceId: transfer.id,
      createdBy: completedBy,
    });

    transfer.status = 'completed';
    transfer.completedAt = new Date().toISOString();
    pendingTransferLines.delete(transferId);
    return transfer;
  },
  async getStatus(transferId) {
    return state.transfers.find((t) => t.id === transferId)?.status ?? null;
  },
};

const pendingTransferLines = new Map<
  string,
  { productId: string; quantity: number; unitCost: number; toWarehouseId: string }
>();

export const mockAdjustmentReasonRepository: AdjustmentReasonRepository = {
  async list(): Promise<AdjustmentReasonCode[]> {
    return adjustmentReasonCodes;
  },
};

export const mockStockAdjustmentRepository: StockAdjustmentRepository = {
  async list() {
    return [...state.adjustments].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  },
  async request(input: RequestAdjustmentInput) {
    adjustmentCounter += 1;
    const now = new Date().toISOString();
    const adjustment: StockAdjustment = {
      id: randomUUID(),
      adjustmentNumber: `ADJ-${adjustmentCounter}`,
      warehouseId: input.warehouseId,
      reasonCodeId: input.reasonCodeId,
      status: 'pending_approval',
      requestedBy: input.requestedBy,
      requestedAt: now,
      approvedBy: null,
      approvedAt: null,
    };
    state.adjustments.push(adjustment);
    pendingAdjustmentLines.set(adjustment.id, {
      productId: input.productId,
      quantityDelta: input.quantityDelta,
      unitCost: input.unitCost,
    });
    return adjustment;
  },
  async decide(adjustmentId, decision, decidedBy) {
    const adjustment = state.adjustments.find((a) => a.id === adjustmentId);
    if (!adjustment) throw new Error('Adjustment not found.');
    if (adjustment.status !== 'pending_approval') {
      throw new Error(`Adjustment is already ${adjustment.status}.`);
    }

    if (decision === 'approved') {
      const line = pendingAdjustmentLines.get(adjustmentId);
      if (!line) throw new Error('Adjustment line details missing — cannot approve.');
      await postMovement({
        productId: line.productId,
        warehouseId: adjustment.warehouseId,
        movementType: line.quantityDelta >= 0 ? 'adjustment' : 'write_off',
        quantity: line.quantityDelta,
        unitCost: line.unitCost,
        referenceType: 'stock_adjustment',
        referenceId: adjustment.id,
        createdBy: decidedBy,
      });
    }

    adjustment.status = decision;
    adjustment.approvedBy = decidedBy;
    adjustment.approvedAt = new Date().toISOString();
    pendingAdjustmentLines.delete(adjustmentId);
    return adjustment;
  },
};

const pendingAdjustmentLines = new Map<string, { productId: string; quantityDelta: number; unitCost: number }>();

export const mockUserRepository: UserRepository = {
  async findByEmail(email) {
    return seedUsers.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  },
  async getById(id) {
    return seedUsers.find((u) => u.id === id) ?? null;
  },
  async list() {
    return seedUsers;
  },
};
