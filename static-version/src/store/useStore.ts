/**
 * The Zustand store — the browser-side rebirth of the Next.js app's mock
 * repository layer (src/lib/data/mock/repositories.ts) plus its ~13 Server
 * Actions. Every action below preserves the ORIGINAL's semantics exactly:
 * same status transitions, same validation, same error strings, same
 * numbering (PO-####, GRN-####, XFR-####, ADJ-####, REQ-####, INV-####,
 * CN-####), same audit entries.
 *
 * THREE structural adaptations, all forced by the browser:
 *
 * 1. `state.ledger` was a Map keyed `productId::warehouseId`. Maps don't
 *    survive JSON serialization, and this store persists to localStorage, so
 *    it's a plain Record with the identical key format. Same for
 *    `purchaseOrderLines` (was a Map keyed by poId).
 *
 * 2. `pendingTransferLines` and `pendingAdjustmentLines` were module-level
 *    Maps living OUTSIDE `state` in the original. That was fine server-side
 *    (one process, one lifetime), but here a page refresh would wipe them and
 *    leave in-transit transfers impossible to complete and pending
 *    adjustments impossible to approve. They are folded into the persisted
 *    store so those workflows survive a reload.
 *
 * 3. Permission checks are synchronous (see permissions.ts) and every action
 *    returns an ActionResult instead of throwing, because the UI renders the
 *    message inline exactly the way the original's `useActionState` did.
 *
 * The WAC math is NOT reimplemented here — every stock-affecting action goes
 * through `applyMovement` from engine.ts, a verbatim copy of the original
 * inventory engine. There is deliberately no second inventory code path.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applyMovement } from '@/store/engine';
import { checkPermission, type Permission } from '@/store/permissions';
import { randomUUID } from '@/store/uuid';
import { DEMO_ACCOUNTS } from '@/store/demo-credentials';
import {
  adjustmentReasonCodes,
  customers as seedCustomers,
  products as seedProducts,
  stockLedger as seedLedger,
  suppliers as seedSuppliers,
  users as seedUsers,
} from '@/store/seed';
import { VAT_RATE } from '@/store/types';
import type {
  AuditLogEntry,
  CreditNote,
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
  StockMovementType,
  Supplier,
  User,
} from '@/store/types';

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

const ok = (message: string): ActionResult => ({ ok: true, message });
const fail = (error: string): ActionResult => ({ ok: false, error });

export function ledgerKey(productId: string, warehouseId: string) {
  return `${productId}::${warehouseId}`;
}

const INVOICE_PAYMENT_TERMS_DAYS = 30; // matches Cobro's own PO terms as vendor to Productivity SA

function invoiceOutstanding(invoice: Invoice): number {
  return Math.round((invoice.total - invoice.amountPaid - invoice.creditedAmount) * 100) / 100;
}

interface Data {
  products: Product[];
  users: User[];
  suppliers: Supplier[];
  customers: Customer[];
  ledger: Record<string, StockLedgerEntry>;
  movements: StockMovement[];
  purchaseOrders: PurchaseOrder[];
  purchaseOrderLines: Record<string, PurchaseOrderLine>;
  goodsReceipts: GoodsReceipt[];
  transfers: InterWarehouseTransfer[];
  pendingTransferLines: Record<string, { productId: string; quantity: number; unitCost: number; toWarehouseId: string }>;
  adjustments: StockAdjustment[];
  pendingAdjustmentLines: Record<string, { productId: string; quantityDelta: number; unitCost: number }>;
  salesOrders: SalesOrder[];
  invoices: Invoice[];
  invoicePayments: InvoicePayment[];
  creditNotes: CreditNote[];
  auditLog: AuditLogEntry[];
  bomLines: ProductBomLine[];
  poCounter: number;
  grnCounter: number;
  transferCounter: number;
  adjustmentCounter: number;
  salesOrderCounter: number;
  invoiceCounter: number;
  creditNoteCounter: number;
  currentUserId: string | null;
}

function freshData(): Data {
  return {
    products: seedProducts.map((p) => ({ ...p })),
    users: seedUsers.map((u) => ({ ...u })),
    suppliers: seedSuppliers.map((s) => ({ ...s })),
    customers: seedCustomers.map((c) => ({ ...c })),
    ledger: Object.fromEntries(seedLedger.map((e) => [ledgerKey(e.productId, e.warehouseId), { ...e }])),
    movements: [],
    purchaseOrders: [],
    purchaseOrderLines: {},
    goodsReceipts: [],
    transfers: [],
    pendingTransferLines: {},
    adjustments: [],
    pendingAdjustmentLines: {},
    salesOrders: [],
    invoices: [],
    invoicePayments: [],
    creditNotes: [],
    auditLog: [],
    bomLines: [],
    poCounter: 1000,
    grnCounter: 1000,
    transferCounter: 1000,
    adjustmentCounter: 1000,
    salesOrderCounter: 1000,
    invoiceCounter: 1000,
    creditNoteCounter: 1000,
    currentUserId: null,
  };
}

interface Actions {
  // session
  signIn: (email: string, password: string) => ActionResult;
  signOut: () => void;
  resetDemoData: () => void;
  // catalogue
  createProduct: (i: { sku: string; name: string; unitOfMeasure: string; barcode?: string; reorderPoint?: number | null; reorderQuantity?: number | null }) => ActionResult;
  addBomLine: (i: { parentProductId: string; componentProductId: string; quantity: number }) => ActionResult;
  removeBomLine: (lineId: string) => ActionResult;
  // partners
  createSupplier: (i: { name: string; contactEmail?: string; contactPhone?: string; address?: string }) => ActionResult;
  createCustomer: (i: { name: string; contactEmail?: string; contactPhone?: string; address?: string }) => ActionResult;
  // stock
  recordMovement: (i: { productId: string; warehouseId: string; movementType: StockMovementType; quantity: number; unitCost: number }) => ActionResult;
  quickReceive: (i: { supplierId: string; warehouseId: string; productId: string; quantity: number; unitCost: number }) => ActionResult;
  // purchase orders
  createPurchaseOrder: (i: { supplierId: string; warehouseId: string; productId: string; quantity: number; unitCost: number }) => ActionResult;
  issuePurchaseOrder: (poId: string) => ActionResult;
  receivePurchaseOrder: (poId: string, quantity: number) => ActionResult;
  // transfers
  initiateTransfer: (i: { fromWarehouseId: string; toWarehouseId: string; productId: string; quantity: number }) => ActionResult;
  completeTransfer: (transferId: string) => ActionResult;
  // adjustments
  requestAdjustment: (i: { warehouseId: string; productId: string; reasonCodeId: string; quantityDelta: number; unitCost: number }) => ActionResult;
  decideAdjustment: (adjustmentId: string, decision: 'approved' | 'rejected') => ActionResult;
  // requisitions
  createSalesOrder: (i: { customerId: string; warehouseId: string; productId: string; quantity: number; unitPrice: number }) => ActionResult;
  confirmSalesOrder: (orderId: string) => ActionResult;
  dispatchSalesOrder: (orderId: string) => ActionResult;
  cancelSalesOrder: (orderId: string) => ActionResult;
  // invoicing (dormant — unreachable from nav, per the original)
  generateInvoice: (salesOrderId: string) => ActionResult;
  recordPayment: (invoiceId: string, amount: number) => ActionResult;
  issueCreditNote: (invoiceId: string, amount: number, reason: string) => ActionResult;
  // security
  setMfaEnrolled: (enrolled: boolean) => ActionResult;
}

export type Store = Data & Actions;

export const useStore = create<Store>()(
  persist(
    (set, get) => {
      /** Current user, re-read from `users` so mfaEnrolled changes are always live. */
      function me(): User | null {
        const { currentUserId, users } = get();
        if (!currentUserId) return null;
        return users.find((u) => u.id === currentUserId) ?? null;
      }

      /**
       * Session + permission gate. Mirrors the original's pattern where every
       * mutating Server Action re-checks getSession() then requirePermission().
       */
      function guard(permission: Permission): { user: User } | { error: string } {
        const user = me();
        if (!user) return { error: 'Session expired.' };
        const check = checkPermission(user, permission);
        if (!check.allowed) return { error: check.reason ?? 'Permission denied.' };
        return { user };
      }

      function audit(
        d: Data,
        entry: { tableName: string; recordId: string; action: 'insert' | 'update' | 'delete'; changedBy: string | null; before?: unknown; after?: unknown }
      ) {
        d.auditLog.push({
          id: randomUUID(),
          tableName: entry.tableName,
          recordId: entry.recordId,
          action: entry.action,
          changedBy: entry.changedBy,
          changedAt: new Date().toISOString(),
          before: entry.before ?? null,
          after: entry.after ?? null,
        });
      }

      /**
       * The single path every stock movement takes — identical to the
       * original's `postMovement`. Applies the movement through the WAC
       * engine, writes the new ledger snapshot, appends to the movement log.
       * Throws on a negative-stock violation (engine.applyMovement's rule),
       * which callers catch and surface as an inline error.
       */
      function postMovement(
        d: Data,
        input: { productId: string; warehouseId: string; movementType: StockMovementType; quantity: number; unitCost: number; referenceType?: string | null; referenceId?: string | null; createdBy: string }
      ) {
        const key = ledgerKey(input.productId, input.warehouseId);
        const current = d.ledger[key] ?? null;
        const ledger = applyMovement(current, {
          productId: input.productId,
          warehouseId: input.warehouseId,
          movementType: input.movementType,
          quantity: input.quantity,
          unitCost: input.unitCost,
        });
        d.ledger[key] = ledger;

        d.movements.push({
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
        });
        return ledger;
      }

      /**
       * Runs `fn` against a shallow-cloned draft and commits it. Any throw
       * (e.g. the engine's negative-stock guard) aborts the commit entirely,
       * so a failed action never leaves half-applied state.
       */
      function tx(fn: (d: Data) => ActionResult): ActionResult {
        const s = get();
        const d: Data = {
          ...s,
          products: [...s.products],
          users: [...s.users],
          suppliers: [...s.suppliers],
          customers: [...s.customers],
          ledger: { ...s.ledger },
          movements: [...s.movements],
          purchaseOrders: [...s.purchaseOrders],
          purchaseOrderLines: { ...s.purchaseOrderLines },
          goodsReceipts: [...s.goodsReceipts],
          transfers: [...s.transfers],
          pendingTransferLines: { ...s.pendingTransferLines },
          adjustments: [...s.adjustments],
          pendingAdjustmentLines: { ...s.pendingAdjustmentLines },
          salesOrders: [...s.salesOrders],
          invoices: [...s.invoices],
          invoicePayments: [...s.invoicePayments],
          creditNotes: [...s.creditNotes],
          auditLog: [...s.auditLog],
          bomLines: [...s.bomLines],
        };
        let result: ActionResult;
        try {
          result = fn(d);
        } catch (err) {
          return fail(err instanceof Error ? err.message : 'Something went wrong.');
        }
        if (result.ok) set(d);
        return result;
      }

      /** Reserve/release — a ledger-state change, NOT a movement. Ported from adjustReserved. */
      function adjustReserved(d: Data, productId: string, warehouseId: string, delta: number) {
        const key = ledgerKey(productId, warehouseId);
        const current = d.ledger[key];
        if (!current) throw new Error('No stock ledger entry to reserve against.');
        const nextReserved = current.quantityReserved + delta;
        if (nextReserved < -1e-9) throw new Error('Cannot release more stock than is currently reserved.');
        if (nextReserved > current.quantityOnHand + 1e-9) throw new Error('Not enough available stock to reserve that quantity.');
        d.ledger[key] = {
          ...current,
          quantityReserved: Math.round(nextReserved * 1000) / 1000,
          updatedAt: new Date().toISOString(),
        };
      }

      return {
        ...freshData(),

        // ---------------------------------------------------------------
        // Session
        // ---------------------------------------------------------------
        signIn: (email, password) => {
          const normalized = email.trim().toLowerCase();
          const matches = DEMO_ACCOUNTS.some((a) => a.email === normalized && a.password === password);
          if (!matches) {
            return fail('Incorrect email or password. Try one of the demo accounts shown below.');
          }
          const user = get().users.find((u) => u.email.toLowerCase() === normalized);
          if (!user) return fail('Demo user is missing from the mock data set.');
          set({ currentUserId: user.id });
          return ok(`Signed in as ${user.fullName}.`);
        },

        signOut: () => set({ currentUserId: null }),

        resetDemoData: () => set(freshData()),

        // ---------------------------------------------------------------
        // Catalogue
        // ---------------------------------------------------------------
        createProduct: (input) =>
          tx((d) => {
            const g = guard('manage_catalogue');
            if ('error' in g) return fail(g.error);
            if (d.products.some((p) => p.sku.toLowerCase() === input.sku.toLowerCase())) {
              return fail(`SKU "${input.sku}" already exists.`);
            }
            const now = new Date().toISOString();
            const product: Product = {
              id: randomUUID(),
              sku: input.sku,
              name: input.name,
              description: null,
              categoryId: null,
              unitOfMeasure: input.unitOfMeasure,
              barcode: input.barcode?.trim() ? input.barcode.trim() : null,
              reorderPoint: input.reorderPoint ?? null,
              reorderQuantity: input.reorderQuantity ?? null,
              isActive: true,
              createdAt: now,
              updatedAt: now,
            };
            d.products.push(product);
            audit(d, { tableName: 'products', recordId: product.id, action: 'insert', changedBy: g.user.id, after: product });
            return ok(`Added ${product.sku} — ${product.name}.`);
          }),

        addBomLine: (input) =>
          tx((d) => {
            const g = guard('manage_catalogue');
            if ('error' in g) return fail(g.error);
            if (input.parentProductId === input.componentProductId) {
              return fail('A product cannot be a component of itself.');
            }
            if (d.bomLines.some((l) => l.parentProductId === input.parentProductId && l.componentProductId === input.componentProductId)) {
              return fail('That component is already on this BOM — remove it first to change the quantity.');
            }
            const line: ProductBomLine = {
              id: randomUUID(),
              parentProductId: input.parentProductId,
              componentProductId: input.componentProductId,
              quantity: input.quantity,
            };
            d.bomLines.push(line);
            audit(d, { tableName: 'product_bom', recordId: line.id, action: 'insert', changedBy: g.user.id, after: line });
            const component = d.products.find((p) => p.id === input.componentProductId);
            return ok(`Added ${component?.sku ?? 'component'} at ${input.quantity} per unit.`);
          }),

        removeBomLine: (lineId) =>
          tx((d) => {
            const g = guard('manage_catalogue');
            if ('error' in g) return fail(g.error);
            const index = d.bomLines.findIndex((l) => l.id === lineId);
            if (index === -1) return fail('BOM line not found.');
            const [removed] = d.bomLines.splice(index, 1);
            audit(d, { tableName: 'product_bom', recordId: lineId, action: 'delete', changedBy: g.user.id, before: removed });
            return ok('Component removed.');
          }),

        // ---------------------------------------------------------------
        // Partners
        // ---------------------------------------------------------------
        createSupplier: (input) =>
          tx((d) => {
            const g = guard('manage_suppliers');
            if ('error' in g) return fail(g.error);
            const supplier: Supplier = {
              id: randomUUID(),
              name: input.name,
              contactEmail: input.contactEmail?.trim() || null,
              contactPhone: input.contactPhone?.trim() || null,
              address: input.address?.trim() || null,
              isActive: true,
              createdAt: new Date().toISOString(),
            };
            d.suppliers.push(supplier);
            audit(d, { tableName: 'suppliers', recordId: supplier.id, action: 'insert', changedBy: g.user.id, after: supplier });
            return ok(`Added ${supplier.name}.`);
          }),

        createCustomer: (input) =>
          tx((d) => {
            const g = guard('manage_customers');
            if ('error' in g) return fail(g.error);
            const customer: Customer = {
              id: randomUUID(),
              name: input.name,
              contactEmail: input.contactEmail?.trim() || null,
              contactPhone: input.contactPhone?.trim() || null,
              address: input.address?.trim() || null,
              isActive: true,
              createdAt: new Date().toISOString(),
            };
            d.customers.push(customer);
            audit(d, { tableName: 'customers', recordId: customer.id, action: 'insert', changedBy: g.user.id, after: customer });
            return ok(`Added ${customer.name}.`);
          }),

        // ---------------------------------------------------------------
        // Stock
        // ---------------------------------------------------------------
        // The generic "record a movement" form on the overview. In the original
        // this was gated behind approve_adjustments specifically because it can
        // post a write-off, which would otherwise be an RBAC bypass around the
        // /dashboard/adjustments approval flow. Same gate here.
        recordMovement: (input) =>
          tx((d) => {
            const g = guard('approve_adjustments');
            if ('error' in g) return fail(g.error);
            const signed = ['receipt', 'transfer_in', 'adjustment'].includes(input.movementType)
              ? Math.abs(input.quantity)
              : -Math.abs(input.quantity);
            const ledger = postMovement(d, {
              productId: input.productId,
              warehouseId: input.warehouseId,
              movementType: input.movementType,
              quantity: signed,
              unitCost: input.unitCost,
              referenceType: null,
              referenceId: null,
              createdBy: g.user.id,
            });
            audit(d, { tableName: 'stock_movements', recordId: input.productId, action: 'insert', changedBy: g.user.id, after: { movementType: input.movementType, quantity: signed } });
            return ok(`Posted. On hand is now ${ledger.quantityOnHand.toLocaleString()} at WAC R ${ledger.weightedAverageCost.toFixed(2)}.`);
          }),

        // Quick receive — creates PO + PO LINE + GRN and posts the movement.
        // NOTE: the PO line is stored (the original had a bug where it was
        // discarded, breaking the PO list's withLine()); this is the FIXED
        // version, matching the current repositories.ts.
        quickReceive: (input) =>
          tx((d) => {
            const g = guard('manage_receiving');
            if ('error' in g) return fail(g.error);
            const now = new Date().toISOString();
            d.poCounter += 1;
            d.grnCounter += 1;
            const poId = randomUUID();

            const purchaseOrder: PurchaseOrder = {
              id: poId,
              poNumber: `PO-${d.poCounter}`,
              supplierId: input.supplierId,
              warehouseId: input.warehouseId,
              status: 'received',
              orderedAt: now,
              expectedAt: null,
              createdBy: g.user.id,
              createdAt: now,
            };
            d.purchaseOrders.push(purchaseOrder);
            d.purchaseOrderLines[poId] = {
              id: randomUUID(),
              purchaseOrderId: poId,
              productId: input.productId,
              quantityOrdered: Math.abs(input.quantity),
              quantityReceived: Math.abs(input.quantity),
              unitCost: input.unitCost,
            };

            const goodsReceipt: GoodsReceipt = {
              id: randomUUID(),
              grnNumber: `GRN-${d.grnCounter}`,
              purchaseOrderId: poId,
              warehouseId: input.warehouseId,
              status: 'posted',
              receivedBy: g.user.id,
              receivedAt: now,
              createdAt: now,
            };
            d.goodsReceipts.push(goodsReceipt);

            const ledger = postMovement(d, {
              productId: input.productId,
              warehouseId: input.warehouseId,
              movementType: 'receipt',
              quantity: Math.abs(input.quantity),
              unitCost: input.unitCost,
              referenceType: 'goods_receipt',
              referenceId: goodsReceipt.id,
              createdBy: g.user.id,
            });
            audit(d, { tableName: 'goods_receipts', recordId: goodsReceipt.id, action: 'insert', changedBy: g.user.id, after: goodsReceipt });
            return ok(`${goodsReceipt.grnNumber} posted. On hand is now ${ledger.quantityOnHand.toLocaleString()} at WAC R ${ledger.weightedAverageCost.toFixed(2)}.`);
          }),

        // ---------------------------------------------------------------
        // Purchase orders
        // ---------------------------------------------------------------
        createPurchaseOrder: (input) =>
          tx((d) => {
            const g = guard('manage_purchase_orders');
            if ('error' in g) return fail(g.error);
            d.poCounter += 1;
            const now = new Date().toISOString();
            const po: PurchaseOrder = {
              id: randomUUID(),
              poNumber: `PO-${d.poCounter}`,
              supplierId: input.supplierId,
              warehouseId: input.warehouseId,
              status: 'draft',
              orderedAt: null,
              expectedAt: null,
              createdBy: g.user.id,
              createdAt: now,
            };
            d.purchaseOrders.push(po);
            d.purchaseOrderLines[po.id] = {
              id: randomUUID(),
              purchaseOrderId: po.id,
              productId: input.productId,
              quantityOrdered: input.quantity,
              quantityReceived: 0,
              unitCost: input.unitCost,
            };
            audit(d, { tableName: 'purchase_orders', recordId: po.id, action: 'insert', changedBy: g.user.id, after: po });
            return ok(`${po.poNumber} saved as a draft.`);
          }),

        issuePurchaseOrder: (poId) =>
          tx((d) => {
            const g = guard('manage_purchase_orders');
            if ('error' in g) return fail(g.error);
            const po = d.purchaseOrders.find((p) => p.id === poId);
            if (!po) return fail('Purchase order not found.');
            if (po.status !== 'draft') return fail(`Purchase order is already ${po.status}.`);
            po.status = 'issued';
            po.orderedAt = new Date().toISOString();
            audit(d, { tableName: 'purchase_orders', recordId: po.id, action: 'update', changedBy: g.user.id, after: { status: 'issued' } });
            return ok(`${po.poNumber} issued.`);
          }),

        receivePurchaseOrder: (poId, quantity) =>
          tx((d) => {
            const g = guard('manage_receiving');
            if ('error' in g) return fail(g.error);
            const po = d.purchaseOrders.find((p) => p.id === poId);
            if (!po) return fail('Purchase order not found.');
            if (po.status !== 'issued' && po.status !== 'partially_received') {
              return fail(`Purchase order must be issued before it can be received (currently ${po.status}).`);
            }
            const line = d.purchaseOrderLines[poId];
            if (!line) return fail('Purchase order line not found.');

            const remaining = line.quantityOrdered - line.quantityReceived;
            if (quantity <= 0) return fail('Quantity received must be a positive number.');
            if (quantity > remaining + 1e-9) {
              return fail(`Cannot receive more than the ${remaining} units still outstanding on this order.`);
            }

            d.grnCounter += 1;
            const now = new Date().toISOString();
            const goodsReceipt: GoodsReceipt = {
              id: randomUUID(),
              grnNumber: `GRN-${d.grnCounter}`,
              purchaseOrderId: poId,
              warehouseId: po.warehouseId,
              status: 'posted',
              receivedBy: g.user.id,
              receivedAt: now,
              createdAt: now,
            };
            d.goodsReceipts.push(goodsReceipt);

            postMovement(d, {
              productId: line.productId,
              warehouseId: po.warehouseId,
              movementType: 'receipt',
              quantity: Math.abs(quantity),
              // received at the PO's quoted cost, not re-negotiated per receipt
              unitCost: line.unitCost,
              referenceType: 'goods_receipt',
              referenceId: goodsReceipt.id,
              createdBy: g.user.id,
            });

            const updatedLine: PurchaseOrderLine = {
              ...line,
              quantityReceived: Math.round((line.quantityReceived + quantity) * 1000) / 1000,
            };
            d.purchaseOrderLines[poId] = updatedLine;
            po.status = updatedLine.quantityReceived >= updatedLine.quantityOrdered - 1e-9 ? 'received' : 'partially_received';

            audit(d, { tableName: 'goods_receipts', recordId: goodsReceipt.id, action: 'insert', changedBy: g.user.id, after: goodsReceipt });
            return ok(`${goodsReceipt.grnNumber} posted — ${quantity.toLocaleString()} received against ${po.poNumber}.`);
          }),

        // ---------------------------------------------------------------
        // Transfers
        // ---------------------------------------------------------------
        initiateTransfer: (input) =>
          tx((d) => {
            const g = guard('manage_transfers');
            if ('error' in g) return fail(g.error);
            if (input.fromWarehouseId === input.toWarehouseId) {
              return fail('Source and destination warehouse must differ.');
            }
            const sourceLedger = d.ledger[ledgerKey(input.productId, input.fromWarehouseId)];
            if (!sourceLedger || sourceLedger.quantityOnHand < input.quantity) {
              return fail('Not enough stock on hand at the source warehouse to transfer that quantity.');
            }

            d.transferCounter += 1;
            const now = new Date().toISOString();
            const transfer: InterWarehouseTransfer = {
              id: randomUUID(),
              transferNumber: `XFR-${d.transferCounter}`,
              fromWarehouseId: input.fromWarehouseId,
              toWarehouseId: input.toWarehouseId,
              status: 'in_transit',
              initiatedBy: g.user.id,
              initiatedAt: now,
              completedAt: null,
            };
            d.transfers.push(transfer);

            // The unit cost carried forward is the SOURCE warehouse's current
            // WAC — the destination receives stock "at cost", same principle as
            // a GRN. A transfer never fabricates value.
            postMovement(d, {
              productId: input.productId,
              warehouseId: input.fromWarehouseId,
              movementType: 'transfer_out',
              quantity: -Math.abs(input.quantity),
              unitCost: sourceLedger.weightedAverageCost,
              referenceType: 'inter_warehouse_transfer',
              referenceId: transfer.id,
              createdBy: g.user.id,
            });

            d.pendingTransferLines[transfer.id] = {
              productId: input.productId,
              quantity: Math.abs(input.quantity),
              unitCost: sourceLedger.weightedAverageCost,
              toWarehouseId: input.toWarehouseId,
            };

            audit(d, { tableName: 'inter_warehouse_transfers', recordId: transfer.id, action: 'insert', changedBy: g.user.id, after: transfer });
            return ok(`${transfer.transferNumber} initiated — stock is in transit.`);
          }),

        completeTransfer: (transferId) =>
          tx((d) => {
            const g = guard('manage_transfers');
            if ('error' in g) return fail(g.error);
            const transfer = d.transfers.find((t) => t.id === transferId);
            if (!transfer) return fail('Transfer not found.');
            if (transfer.status !== 'in_transit') return fail(`Transfer is already ${transfer.status}.`);
            const line = d.pendingTransferLines[transferId];
            if (!line) return fail('Transfer line details missing — cannot complete.');

            postMovement(d, {
              productId: line.productId,
              warehouseId: line.toWarehouseId,
              movementType: 'transfer_in',
              quantity: line.quantity,
              unitCost: line.unitCost,
              referenceType: 'inter_warehouse_transfer',
              referenceId: transfer.id,
              createdBy: g.user.id,
            });

            transfer.status = 'completed';
            transfer.completedAt = new Date().toISOString();
            delete d.pendingTransferLines[transferId];
            audit(d, { tableName: 'inter_warehouse_transfers', recordId: transfer.id, action: 'update', changedBy: g.user.id, after: { status: 'completed' } });
            return ok(`${transfer.transferNumber} completed.`);
          }),

        // ---------------------------------------------------------------
        // Adjustments
        // ---------------------------------------------------------------
        requestAdjustment: (input) =>
          tx((d) => {
            const g = guard('request_adjustments');
            if ('error' in g) return fail(g.error);
            d.adjustmentCounter += 1;
            const now = new Date().toISOString();
            const adjustment: StockAdjustment = {
              id: randomUUID(),
              adjustmentNumber: `ADJ-${d.adjustmentCounter}`,
              warehouseId: input.warehouseId,
              reasonCodeId: input.reasonCodeId,
              status: 'pending_approval',
              requestedBy: g.user.id,
              requestedAt: now,
              approvedBy: null,
              approvedAt: null,
            };
            d.adjustments.push(adjustment);
            // Nothing touches the ledger until someone approves it.
            d.pendingAdjustmentLines[adjustment.id] = {
              productId: input.productId,
              quantityDelta: input.quantityDelta,
              unitCost: input.unitCost,
            };
            audit(d, { tableName: 'stock_adjustments', recordId: adjustment.id, action: 'insert', changedBy: g.user.id, after: adjustment });
            return ok(`${adjustment.adjustmentNumber} submitted for approval — nothing posted to the ledger yet.`);
          }),

        decideAdjustment: (adjustmentId, decision) =>
          tx((d) => {
            // The one action gated on BOTH role and 2FA enrollment.
            const g = guard('approve_adjustments');
            if ('error' in g) return fail(g.error);
            const adjustment = d.adjustments.find((a) => a.id === adjustmentId);
            if (!adjustment) return fail('Adjustment not found.');
            if (adjustment.status !== 'pending_approval') return fail(`Adjustment is already ${adjustment.status}.`);

            if (decision === 'approved') {
              const line = d.pendingAdjustmentLines[adjustmentId];
              if (!line) return fail('Adjustment line details missing — cannot approve.');
              postMovement(d, {
                productId: line.productId,
                warehouseId: adjustment.warehouseId,
                // sign of the delta decides adjustment vs write_off
                movementType: line.quantityDelta >= 0 ? 'adjustment' : 'write_off',
                quantity: line.quantityDelta,
                unitCost: line.unitCost,
                referenceType: 'stock_adjustment',
                referenceId: adjustment.id,
                createdBy: g.user.id,
              });
            }

            adjustment.status = decision;
            adjustment.approvedBy = g.user.id;
            adjustment.approvedAt = new Date().toISOString();
            delete d.pendingAdjustmentLines[adjustmentId];
            audit(d, { tableName: 'stock_adjustments', recordId: adjustment.id, action: 'update', changedBy: g.user.id, after: { status: decision } });
            return ok(`${adjustment.adjustmentNumber} ${decision}.`);
          }),

        // ---------------------------------------------------------------
        // Requisitions (route/permission names unchanged from Sales & Dispatch)
        // ---------------------------------------------------------------
        createSalesOrder: (input) =>
          tx((d) => {
            const g = guard('manage_sales_orders');
            if ('error' in g) return fail(g.error);
            d.salesOrderCounter += 1;
            const order: SalesOrder = {
              id: randomUUID(),
              orderNumber: `REQ-${d.salesOrderCounter}`,
              customerId: input.customerId,
              warehouseId: input.warehouseId,
              productId: input.productId,
              quantityOrdered: input.quantity,
              unitPrice: input.unitPrice,
              status: 'draft',
              createdBy: g.user.id,
              createdAt: new Date().toISOString(),
              confirmedAt: null,
              dispatchedAt: null,
            };
            d.salesOrders.push(order);
            audit(d, { tableName: 'sales_orders', recordId: order.id, action: 'insert', changedBy: g.user.id, after: order });
            return ok(`${order.orderNumber} created as a draft — nothing is reserved yet.`);
          }),

        confirmSalesOrder: (orderId) =>
          tx((d) => {
            const g = guard('manage_sales_orders');
            if ('error' in g) return fail(g.error);
            const order = d.salesOrders.find((o) => o.id === orderId);
            if (!order) return fail('Requisition not found.');
            if (order.status !== 'draft') return fail(`Order is already ${order.status}.`);
            // Reserving is a ledger-state change only — no movement, no WAC impact.
            adjustReserved(d, order.productId, order.warehouseId, order.quantityOrdered);
            order.status = 'confirmed';
            order.confirmedAt = new Date().toISOString();
            audit(d, { tableName: 'sales_orders', recordId: order.id, action: 'update', changedBy: g.user.id, after: { status: 'confirmed' } });
            return ok(`${order.orderNumber} approved — ${order.quantityOrdered.toLocaleString()} reserved.`);
          }),

        dispatchSalesOrder: (orderId) =>
          tx((d) => {
            const g = guard('manage_sales_orders');
            if ('error' in g) return fail(g.error);
            const order = d.salesOrders.find((o) => o.id === orderId);
            if (!order) return fail('Requisition not found.');
            if (order.status !== 'confirmed') return fail('Only approved requisitions can be issued.');
            const ledger = d.ledger[ledgerKey(order.productId, order.warehouseId)];
            if (!ledger) return fail('No stock ledger entry for this product/warehouse.');

            // Outbound movement is valued at the ledger's current WAC — the
            // requisition's unit price is not cost.
            postMovement(d, {
              productId: order.productId,
              warehouseId: order.warehouseId,
              movementType: 'dispatch',
              quantity: -Math.abs(order.quantityOrdered),
              unitCost: ledger.weightedAverageCost,
              referenceType: 'sales_order',
              referenceId: order.id,
              createdBy: g.user.id,
            });
            // Release the reservation now that the stock has actually left.
            adjustReserved(d, order.productId, order.warehouseId, -order.quantityOrdered);

            order.status = 'dispatched';
            order.dispatchedAt = new Date().toISOString();
            audit(d, { tableName: 'sales_orders', recordId: order.id, action: 'update', changedBy: g.user.id, after: { status: 'dispatched' } });
            return ok(`${order.orderNumber} issued — stock has left the ledger.`);
          }),

        cancelSalesOrder: (orderId) =>
          tx((d) => {
            const g = guard('manage_sales_orders');
            if ('error' in g) return fail(g.error);
            const order = d.salesOrders.find((o) => o.id === orderId);
            if (!order) return fail('Requisition not found.');
            if (order.status === 'dispatched' || order.status === 'cancelled') {
              return fail(`Order is already ${order.status}.`);
            }
            if (order.status === 'confirmed') {
              adjustReserved(d, order.productId, order.warehouseId, -order.quantityOrdered);
            }
            order.status = 'cancelled';
            audit(d, { tableName: 'sales_orders', recordId: order.id, action: 'update', changedBy: g.user.id, after: { status: 'cancelled' } });
            return ok(`${order.orderNumber} cancelled.`);
          }),

        // ---------------------------------------------------------------
        // Invoicing — DORMANT, exactly as in the original: the code works and
        // the route renders, but nothing in the nav reaches it and no
        // requisition creates an invoice. Kept, not deleted.
        // ---------------------------------------------------------------
        generateInvoice: (salesOrderId) =>
          tx((d) => {
            const g = guard('manage_invoices');
            if ('error' in g) return fail(g.error);
            const order = d.salesOrders.find((o) => o.id === salesOrderId);
            if (!order) return fail('Sales order not found.');
            if (order.status !== 'dispatched') return fail('Only dispatched orders can be invoiced.');
            if (d.invoices.some((i) => i.salesOrderId === salesOrderId)) return fail('This order already has an invoice.');

            d.invoiceCounter += 1;
            const subtotal = Math.round(order.quantityOrdered * order.unitPrice * 100) / 100;
            const vatAmount = Math.round(subtotal * VAT_RATE * 100) / 100;
            const total = Math.round((subtotal + vatAmount) * 100) / 100;
            const issuedAt = new Date();
            const dueAt = new Date(issuedAt.getTime() + INVOICE_PAYMENT_TERMS_DAYS * 24 * 60 * 60 * 1000);

            const invoice: Invoice = {
              id: randomUUID(),
              invoiceNumber: `INV-${d.invoiceCounter}`,
              salesOrderId,
              customerId: order.customerId,
              subtotal,
              vatAmount,
              total,
              amountPaid: 0,
              creditedAmount: 0,
              status: 'unpaid',
              issuedAt: issuedAt.toISOString(),
              dueAt: dueAt.toISOString(),
              createdBy: g.user.id,
            };
            d.invoices.push(invoice);
            audit(d, { tableName: 'invoices', recordId: invoice.id, action: 'insert', changedBy: g.user.id, after: invoice });
            return ok(`${invoice.invoiceNumber} issued — R ${total.toFixed(2)} incl. VAT.`);
          }),

        recordPayment: (invoiceId, amount) =>
          tx((d) => {
            const g = guard('manage_invoices');
            if ('error' in g) return fail(g.error);
            const invoice = d.invoices.find((i) => i.id === invoiceId);
            if (!invoice) return fail('Invoice not found.');
            if (invoice.status === 'paid' || invoice.status === 'cancelled') return fail(`Invoice is already ${invoice.status}.`);
            if (amount <= 0) return fail('Payment amount must be positive.');
            const outstanding = invoiceOutstanding(invoice);
            if (amount > outstanding + 1e-9) {
              return fail(`Cannot pay more than the R${outstanding.toFixed(2)} outstanding on this invoice.`);
            }
            d.invoicePayments.push({ id: randomUUID(), invoiceId, amount, paidAt: new Date().toISOString(), recordedBy: g.user.id });
            invoice.amountPaid = Math.round((invoice.amountPaid + amount) * 100) / 100;
            invoice.status = invoiceOutstanding(invoice) <= 1e-9 ? 'paid' : 'partially_paid';
            audit(d, { tableName: 'invoice_payments', recordId: invoice.id, action: 'insert', changedBy: g.user.id, after: { amount } });
            return ok(`Payment of R ${amount.toFixed(2)} recorded.`);
          }),

        issueCreditNote: (invoiceId, amount, reason) =>
          tx((d) => {
            const g = guard('manage_invoices');
            if ('error' in g) return fail(g.error);
            const invoice = d.invoices.find((i) => i.id === invoiceId);
            if (!invoice) return fail('Invoice not found.');
            if (invoice.status === 'paid' || invoice.status === 'cancelled') return fail(`Invoice is already ${invoice.status}.`);
            if (amount <= 0) return fail('Credit note amount must be positive.');
            if (!reason.trim()) return fail('A reason is required.');
            const outstanding = invoiceOutstanding(invoice);
            if (amount > outstanding + 1e-9) {
              return fail(`Cannot credit more than the R${outstanding.toFixed(2)} outstanding on this invoice.`);
            }
            d.creditNoteCounter += 1;
            const creditNote: CreditNote = {
              id: randomUUID(),
              creditNoteNumber: `CN-${d.creditNoteCounter}`,
              invoiceId,
              amount,
              reason: reason.trim(),
              issuedAt: new Date().toISOString(),
              issuedBy: g.user.id,
            };
            d.creditNotes.push(creditNote);
            invoice.creditedAmount = Math.round((invoice.creditedAmount + amount) * 100) / 100;
            invoice.status = invoiceOutstanding(invoice) <= 1e-9 ? 'paid' : 'partially_paid';
            audit(d, { tableName: 'credit_notes', recordId: creditNote.id, action: 'insert', changedBy: g.user.id, after: creditNote });
            return ok(`${creditNote.creditNoteNumber} issued for R ${amount.toFixed(2)}.`);
          }),

        // ---------------------------------------------------------------
        // Security — mock 2FA enrollment, same as the original: this only sets
        // the flag a real Supabase Auth MFA flow would set. The GATE it drives
        // (approve_adjustments) is real.
        // ---------------------------------------------------------------
        setMfaEnrolled: (enrolled) =>
          tx((d) => {
            const user = me();
            if (!user) return fail('Session expired.');
            const index = d.users.findIndex((u) => u.id === user.id);
            if (index === -1) return fail('User not found.');
            d.users[index] = { ...d.users[index], mfaEnrolled: enrolled, updatedAt: new Date().toISOString() };
            audit(d, { tableName: 'users', recordId: user.id, action: 'update', changedBy: user.id, after: { mfaEnrolled: enrolled } });
            return ok(enrolled ? '2FA enabled.' : '2FA disabled.');
          }),
      };
    },
    {
      name: 'cobro-ims-static-demo',
      version: 1,
    }
  )
);

/** Current signed-in user, or null. Re-derived from `users` so 2FA changes are live. */
export function useCurrentUser(): User | null {
  return useStore((s) => (s.currentUserId ? s.users.find((u) => u.id === s.currentUserId) ?? null : null));
}

export { adjustmentReasonCodes };
