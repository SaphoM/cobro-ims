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
  Customer,
  GoodsReceipt,
  InterWarehouseTransfer,
  Invoice,
  InvoicePayment,
  Product,
  ProductBomLine,
  PurchaseOrder,
  PurchaseOrderLine,
  SalesOrder,
  StockAdjustment,
  StockLedgerEntry,
  StockMovement,
  Supplier,
  Warehouse,
} from '@/lib/domain/inventory';
import { VAT_RATE } from '@/lib/domain/inventory';
import type {
  AdjustmentReasonRepository,
  CreateCustomerInput,
  CreatePurchaseOrderInput,
  CreateProductInput,
  CreateSalesOrderInput,
  CreateSupplierInput,
  CustomerRepository,
  InitiateTransferInput,
  InvoiceRepository,
  ProductRepository,
  PurchaseOrderRepository,
  PurchaseOrderWithLine,
  QuickReceiveInput,
  ReceivingRepository,
  RecordMovementInput,
  RequestAdjustmentInput,
  SalesOrderRepository,
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
  customers as seedCustomers,
  products as seedProducts,
  stockLedger as seedLedger,
  suppliers as seedSuppliers,
  users as seedUsers,
  warehouses as seedWarehouses,
} from '@/lib/data/mock/seed';

// Module-level mutable state, seeded once per server process.
const state = {
  products: [...seedProducts] as Product[],
  suppliers: [...seedSuppliers] as Supplier[],
  customers: [...seedCustomers] as Customer[],
  ledger: new Map<string, StockLedgerEntry>(seedLedger.map((e) => [ledgerKey(e.productId, e.warehouseId), { ...e }])),
  movements: [] as StockMovement[],
  purchaseOrders: [] as PurchaseOrder[],
  goodsReceipts: [] as GoodsReceipt[],
  transfers: [] as InterWarehouseTransfer[],
  adjustments: [] as StockAdjustment[],
  salesOrders: [] as SalesOrder[],
  purchaseOrderLines: new Map<string, PurchaseOrderLine>(),
  invoices: [] as Invoice[],
  invoicePayments: [] as InvoicePayment[],
};

let poCounter = 1000;
let grnCounter = 1000;
let transferCounter = 1000;
let adjustmentCounter = 1000;
let salesOrderCounter = 1000;
let invoiceCounter = 1000;

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
  async adjustReserved(productId, warehouseId, delta) {
    const key = ledgerKey(productId, warehouseId);
    const current = state.ledger.get(key);
    if (!current) throw new Error('No stock ledger entry to reserve against.');

    const nextReserved = current.quantityReserved + delta;
    if (nextReserved < -1e-9) {
      throw new Error('Cannot release more stock than is currently reserved.');
    }
    if (nextReserved > current.quantityOnHand + 1e-9) {
      throw new Error('Not enough available stock to reserve that quantity.');
    }

    const updated: StockLedgerEntry = {
      ...current,
      quantityReserved: Math.round(nextReserved * 1000) / 1000,
      updatedAt: new Date().toISOString(),
    };
    state.ledger.set(key, updated);
    return updated;
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
    return state.suppliers;
  },
  async create(input: CreateSupplierInput) {
    const supplier: Supplier = {
      id: randomUUID(),
      name: input.name,
      contactEmail: input.contactEmail ?? null,
      contactPhone: input.contactPhone ?? null,
      address: input.address ?? null,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    state.suppliers.push(supplier);
    return supplier;
  },
};

export const mockCustomerRepository: CustomerRepository = {
  async list(): Promise<Customer[]> {
    return state.customers;
  },
  async create(input: CreateCustomerInput) {
    const customer: Customer = {
      id: randomUUID(),
      name: input.name,
      contactEmail: input.contactEmail ?? null,
      contactPhone: input.contactPhone ?? null,
      address: input.address ?? null,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    state.customers.push(customer);
    return customer;
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

function withLine(po: PurchaseOrder): PurchaseOrderWithLine {
  const line = state.purchaseOrderLines.get(po.id);
  if (!line) throw new Error(`Purchase order ${po.poNumber} has no line — data inconsistency.`);
  return { ...po, line };
}

export const mockPurchaseOrderRepository: PurchaseOrderRepository = {
  async list() {
    return [...state.purchaseOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(withLine);
  },
  async create(input: CreatePurchaseOrderInput) {
    poCounter += 1;
    const now = new Date().toISOString();
    const po: PurchaseOrder = {
      id: randomUUID(),
      poNumber: `PO-${poCounter}`,
      supplierId: input.supplierId,
      warehouseId: input.warehouseId,
      status: 'draft',
      orderedAt: null,
      expectedAt: null,
      createdBy: input.createdBy,
      createdAt: now,
    };
    const line: PurchaseOrderLine = {
      id: randomUUID(),
      purchaseOrderId: po.id,
      productId: input.productId,
      quantityOrdered: input.quantity,
      quantityReceived: 0,
      unitCost: input.unitCost,
    };
    state.purchaseOrders.push(po);
    state.purchaseOrderLines.set(po.id, line);
    return withLine(po);
  },
  async issue(poId) {
    const po = state.purchaseOrders.find((p) => p.id === poId);
    if (!po) throw new Error('Purchase order not found.');
    if (po.status !== 'draft') throw new Error(`Purchase order is already ${po.status}.`);
    po.status = 'issued';
    po.orderedAt = new Date().toISOString();
    return withLine(po);
  },
  async receive(poId, quantity, receivedBy) {
    const po = state.purchaseOrders.find((p) => p.id === poId);
    if (!po) throw new Error('Purchase order not found.');
    if (po.status !== 'issued' && po.status !== 'partially_received') {
      throw new Error(`Purchase order must be issued before it can be received (currently ${po.status}).`);
    }
    const line = state.purchaseOrderLines.get(poId);
    if (!line) throw new Error('Purchase order line not found.');

    const remaining = line.quantityOrdered - line.quantityReceived;
    if (quantity <= 0) throw new Error('Quantity received must be a positive number.');
    if (quantity > remaining + 1e-9) {
      throw new Error(`Cannot receive more than the ${remaining} units still outstanding on this order.`);
    }

    grnCounter += 1;
    const now = new Date().toISOString();
    const goodsReceipt: GoodsReceipt = {
      id: randomUUID(),
      grnNumber: `GRN-${grnCounter}`,
      purchaseOrderId: poId,
      warehouseId: po.warehouseId,
      status: 'posted',
      receivedBy,
      receivedAt: now,
      createdAt: now,
    };
    state.goodsReceipts.push(goodsReceipt);

    await postMovement({
      productId: line.productId,
      warehouseId: po.warehouseId,
      movementType: 'receipt',
      quantity: Math.abs(quantity),
      unitCost: line.unitCost, // received at the PO's quoted cost, not re-negotiated per receipt
      referenceType: 'goods_receipt',
      referenceId: goodsReceipt.id,
      createdBy: receivedBy,
    });

    line.quantityReceived = Math.round((line.quantityReceived + quantity) * 1000) / 1000;
    po.status = line.quantityReceived >= line.quantityOrdered - 1e-9 ? 'received' : 'partially_received';

    return { purchaseOrder: withLine(po), goodsReceipt };
  },
  async getStatus(poId) {
    return state.purchaseOrders.find((p) => p.id === poId)?.status ?? null;
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

export const mockSalesOrderRepository: SalesOrderRepository = {
  async list() {
    return [...state.salesOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async create(input: CreateSalesOrderInput) {
    salesOrderCounter += 1;
    const order: SalesOrder = {
      id: randomUUID(),
      orderNumber: `SO-${salesOrderCounter}`,
      customerId: input.customerId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      quantityOrdered: input.quantity,
      unitPrice: input.unitPrice,
      status: 'draft',
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      confirmedAt: null,
      dispatchedAt: null,
    };
    state.salesOrders.push(order);
    return order;
  },
  async confirm(orderId) {
    const order = state.salesOrders.find((o) => o.id === orderId);
    if (!order) throw new Error('Sales order not found.');
    if (order.status !== 'draft') throw new Error(`Order is already ${order.status}.`);

    // Reserving is a ledger-state change (quantity_reserved), not a stock
    // movement — no WAC impact, nothing posted to stock_movements yet.
    await mockStockLedgerRepository.adjustReserved(order.productId, order.warehouseId, order.quantityOrdered);

    order.status = 'confirmed';
    order.confirmedAt = new Date().toISOString();
    return order;
  },
  async dispatch(orderId, dispatchedBy) {
    const order = state.salesOrders.find((o) => o.id === orderId);
    if (!order) throw new Error('Sales order not found.');
    if (order.status !== 'confirmed') throw new Error('Only confirmed orders can be dispatched.');

    const ledger = state.ledger.get(ledgerKey(order.productId, order.warehouseId));
    if (!ledger) throw new Error('No stock ledger entry for this product/warehouse.');

    // Post the actual outbound movement at the ledger's current WAC (the
    // sale's unit_price is revenue, not cost — COGS is valued at WAC).
    await postMovement({
      productId: order.productId,
      warehouseId: order.warehouseId,
      movementType: 'dispatch',
      quantity: -Math.abs(order.quantityOrdered),
      unitCost: ledger.weightedAverageCost,
      referenceType: 'sales_order',
      referenceId: order.id,
      createdBy: dispatchedBy,
    });
    // Release the reservation now that the stock has actually left.
    await mockStockLedgerRepository.adjustReserved(order.productId, order.warehouseId, -order.quantityOrdered);

    order.status = 'dispatched';
    order.dispatchedAt = new Date().toISOString();
    return order;
  },
  async cancel(orderId) {
    const order = state.salesOrders.find((o) => o.id === orderId);
    if (!order) throw new Error('Sales order not found.');
    if (order.status === 'dispatched' || order.status === 'cancelled') {
      throw new Error(`Order is already ${order.status}.`);
    }

    if (order.status === 'confirmed') {
      await mockStockLedgerRepository.adjustReserved(order.productId, order.warehouseId, -order.quantityOrdered);
    }
    order.status = 'cancelled';
    return order;
  },
  async getStatus(orderId) {
    return state.salesOrders.find((o) => o.id === orderId)?.status ?? null;
  },
};

const INVOICE_PAYMENT_TERMS_DAYS = 30; // matches Cobro's own PO terms as vendor to Productivity SA

export const mockInvoiceRepository: InvoiceRepository = {
  async list() {
    return [...state.invoices].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  },
  async getBySalesOrderId(salesOrderId) {
    return state.invoices.find((i) => i.salesOrderId === salesOrderId) ?? null;
  },
  async generateFromSalesOrder(salesOrderId, createdBy) {
    const order = state.salesOrders.find((o) => o.id === salesOrderId);
    if (!order) throw new Error('Sales order not found.');
    if (order.status !== 'dispatched') {
      throw new Error('Only dispatched orders can be invoiced.');
    }
    if (state.invoices.some((i) => i.salesOrderId === salesOrderId)) {
      throw new Error('This order already has an invoice.');
    }

    invoiceCounter += 1;
    const subtotal = Math.round(order.quantityOrdered * order.unitPrice * 100) / 100;
    const vatAmount = Math.round(subtotal * VAT_RATE * 100) / 100;
    const total = Math.round((subtotal + vatAmount) * 100) / 100;
    const issuedAt = new Date();
    const dueAt = new Date(issuedAt.getTime() + INVOICE_PAYMENT_TERMS_DAYS * 24 * 60 * 60 * 1000);

    const invoice: Invoice = {
      id: randomUUID(),
      invoiceNumber: `INV-${invoiceCounter}`,
      salesOrderId,
      customerId: order.customerId,
      subtotal,
      vatAmount,
      total,
      amountPaid: 0,
      status: 'unpaid',
      issuedAt: issuedAt.toISOString(),
      dueAt: dueAt.toISOString(),
      createdBy,
    };
    state.invoices.push(invoice);
    return invoice;
  },
  async recordPayment(invoiceId, amount, recordedBy) {
    const invoice = state.invoices.find((i) => i.id === invoiceId);
    if (!invoice) throw new Error('Invoice not found.');
    if (invoice.status === 'paid' || invoice.status === 'cancelled') {
      throw new Error(`Invoice is already ${invoice.status}.`);
    }
    if (amount <= 0) throw new Error('Payment amount must be positive.');
    const outstanding = Math.round((invoice.total - invoice.amountPaid) * 100) / 100;
    if (amount > outstanding + 1e-9) {
      throw new Error(`Cannot pay more than the R${outstanding.toFixed(2)} outstanding on this invoice.`);
    }

    const payment: InvoicePayment = {
      id: randomUUID(),
      invoiceId,
      amount,
      paidAt: new Date().toISOString(),
      recordedBy,
    };
    state.invoicePayments.push(payment);

    invoice.amountPaid = Math.round((invoice.amountPaid + amount) * 100) / 100;
    invoice.status = invoice.amountPaid >= invoice.total - 1e-9 ? 'paid' : 'partially_paid';

    return { invoice, payment };
  },
  async listPayments(invoiceId) {
    return state.invoicePayments.filter((p) => p.invoiceId === invoiceId);
  },
};

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
