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
  IDLE_STOCK_DAYS,
  products as seedProducts,
  stockLedger as seedLedger,
  STORE_LOCATION_ID,
  suppliers as seedSuppliers,
  users as seedUsers,
  warehouses as seedWarehouses,
} from '@/store/seed';
import { VAT_RATE } from '@/store/types';
import type {
  AppNotification,
  MovementKind,
  NotificationAudience,
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
  Warehouse,
  WorkshopBomLine,
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
  /**
   * Every stock location — the one Store plus every asset. Mutable (assets
   * are managed on the Assets page), so it lives in the store rather than
   * being read straight from the seed.
   */
  locations: Warehouse[];
  notifications: AppNotification[];
  /**
   * Per-user "don't show again" for the contextual help popups, keyed
   * `userId::sectionKey`. Persisted with the rest of the store.
   */
  helpDismissed: Record<string, boolean>;
  /** Assets already flagged idle, so the same prompt isn't raised twice. */
  idleFlagged: Record<string, boolean>;
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
  /**
   * Workshop BOM lines — Engineer-only, per asset. Each line ties a
   * requisitioned material to a job quantity at the engineer's Workshop/Asset.
   * Separate from the catalogue-level `bomLines` (which are product→component
   * relationships); these are planning records driven by requisitions.
   */
  workshopBomLines: WorkshopBomLine[];
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
    locations: seedWarehouses.map((w) => ({ ...w })),
    notifications: [],
    helpDismissed: {},
    idleFlagged: {},
    ledger: Object.fromEntries(seedLedger.map((e) => [ledgerKey(e.productId, e.warehouseId), { ...e }])),
    movements: [],
    purchaseOrders: [],
    purchaseOrderLines: {},
    goodsReceipts: [],
    transfers: [],
    pendingTransferLines: {},
    adjustments: [],
    pendingAdjustmentLines: {},
    /**
     * Two pre-seeded draft requisitions for the demo engineer (Machine 5).
     * They demonstrate the "engineer has made a requisition" state on the
     * Workshop BOM page without requiring any upfront interaction.
     * Status is `draft` so no stock reservation is needed in the ledger.
     * The Store can confirm + fulfil them as a full end-to-end demo.
     */
    salesOrders: [
      {
        id: 'req-seed-001',
        orderNumber: 'REQ-1001',
        kind: 'requisition' as const,
        fromLocationId: STORE_LOCATION_ID,
        toLocationId: 'asset-machine-5',
        productId: 'prod-cem-42-5',
        quantityOrdered: 50,
        quantityReceived: 0,
        unitPrice: 92.79,
        status: 'draft' as const,
        createdBy: 'user-engineer',
        createdAt: '2026-08-20T07:00:00Z',
        confirmedAt: null,
        dispatchedAt: null,
      },
      {
        id: 'req-seed-002',
        orderNumber: 'REQ-1002',
        kind: 'requisition' as const,
        fromLocationId: STORE_LOCATION_ID,
        toLocationId: 'asset-machine-5',
        productId: 'prod-rebar-y12',
        quantityOrdered: 20,
        quantityReceived: 0,
        unitPrice: 118.75,
        status: 'draft' as const,
        createdBy: 'user-engineer',
        createdAt: '2026-08-20T08:00:00Z',
        confirmedAt: null,
        dispatchedAt: null,
      },
    ],
    invoices: [],
    invoicePayments: [],
    creditNotes: [],
    auditLog: [],
    bomLines: [],
    workshopBomLines: [],
    poCounter: 1000,
    grnCounter: 1000,
    transferCounter: 1000,
    adjustmentCounter: 1000,
    // Counter starts at 1002 — REQ-1001 and REQ-1002 are pre-seeded above.
    salesOrderCounter: 1002,
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
  // assets
  createAsset: (i: { name: string; description?: string }) => ActionResult;
  updateAsset: (id: string, i: { name: string; description?: string }) => ActionResult;
  // requisitions & transfers (one unified record set, two business kinds)
  createSalesOrder: (i: {
    kind: MovementKind;
    fromLocationId: string;
    toLocationId: string;
    productId: string;
    quantity: number;
    unitPrice: number;
  }) => ActionResult;
  confirmSalesOrder: (orderId: string) => ActionResult;
  /**
   * Fulfil a request. `receivedQuantity` is the ACTUAL amount handed over —
   * scanned one at a time, scanned in bulk, or typed. Short fulfilment does
   * not close the record; it reserves the shortfall at the source instead.
   */
  fulfilSalesOrder: (orderId: string, receivedQuantity: number) => ActionResult;
  cancelSalesOrder: (orderId: string) => ActionResult;
  /** Idle-stock prompt shortcut: return everything of a product to Store. */
  returnStockToStore: (assetId: string, productId: string) => ActionResult;
  // Workshop BOM — Engineer-only; driven by the engineer's own requisitions.
  addWorkshopBomLine: (i: { assetId: string; productId: string; quantity: number }) => ActionResult;
  removeWorkshopBomLine: (lineId: string) => ActionResult;
  // notifications
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  /** Scans assets for stock past IDLE_STOCK_DAYS and raises prompts. */
  detectIdleStock: () => void;
  // help popups
  dismissHelp: (sectionKey: string) => void;
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

      /** Raise a notification. Audience + optional asset scope decide who sees it. */
      function notify(
        d: Data,
        n: {
          audience: NotificationAudience[];
          assetId?: string | null;
          title: string;
          body: string;
          href?: string | null;
          kind?: 'general' | 'idle_stock';
          productId?: string | null;
        }
      ) {
        d.notifications.push({
          id: randomUUID(),
          audience: n.audience,
          assetId: n.assetId ?? null,
          title: n.title,
          body: n.body,
          href: n.href ?? null,
          kind: n.kind ?? 'general',
          productId: n.productId ?? null,
          createdAt: new Date().toISOString(),
          readBy: [],
        });
      }

      /** Location name for notification/message text. */
      function locName(d: Data, id: string) {
        return d.locations.find((l) => l.id === id)?.name ?? 'Unknown location';
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
        // Stamp arrival time on inbound so stock ageing can be measured from
        // it. Outbound movements leave the existing timestamp alone — taking
        // stock out doesn't make what's left "newer".
        d.ledger[key] = input.quantity > 0 ? { ...ledger, lastInboundAt: new Date().toISOString() } : ledger;

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
          workshopBomLines: [...s.workshopBomLines],
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
        // Assets — stock-bearing locations (machines, workshops)
        // ---------------------------------------------------------------
        createAsset: (input) =>
          tx((d) => {
            const g = guard('manage_customers');
            if ('error' in g) return fail(g.error);
            const name = input.name.trim();
            if (!name) return fail('An asset name is required.');
            if (d.locations.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
              return fail(`An asset named "${name}" already exists.`);
            }
            const asset: Warehouse = {
              id: randomUUID(),
              // Short code derived from the name, for tables and pickers.
              code: name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 12) || 'ASSET',
              name,
              description: input.description?.trim() || null,
              kind: 'asset',
              address: null,
              isActive: true,
              createdAt: new Date().toISOString(),
            };
            d.locations.push(asset);
            audit(d, { tableName: 'assets', recordId: asset.id, action: 'insert', changedBy: g.user.id, after: asset });
            return ok(`Added asset ${asset.name}.`);
          }),

        updateAsset: (id, input) =>
          tx((d) => {
            const g = guard('manage_customers');
            if ('error' in g) return fail(g.error);
            const index = d.locations.findIndex((l) => l.id === id);
            if (index === -1) return fail('Asset not found.');
            if (d.locations[index].kind !== 'asset') return fail('The Store cannot be edited as an asset.');
            const name = input.name.trim();
            if (!name) return fail('An asset name is required.');
            const before = d.locations[index];
            d.locations[index] = { ...before, name, description: input.description?.trim() || null };
            audit(d, { tableName: 'assets', recordId: id, action: 'update', changedBy: g.user.id, before, after: d.locations[index] });
            return ok(`Updated ${name}.`);
          }),

        // ---------------------------------------------------------------
        // Requisitions & transfers — one record set, two business kinds.
        // A requisition is an ASK (Store -> Asset, can sit outstanding and
        // reserve a shortfall). A transfer is a MOVE (Asset -> Asset, or
        // Asset -> Store as a return).
        // ---------------------------------------------------------------
        createSalesOrder: (input) =>
          tx((d) => {
            // Requisitions and transfers are gated on different permissions,
            // which is what keeps Admin out of both (see permissions.ts).
            const g = guard(input.kind === 'requisition' ? 'manage_sales_orders' : 'manage_transfers');
            if ('error' in g) return fail(g.error);
            if (input.fromLocationId === input.toLocationId) {
              return fail('Source and destination must be different locations.');
            }
            if (input.quantity <= 0) return fail('Quantity must be a positive number.');

            // Can't move what isn't there. Checked at creation so the user
            // finds out immediately rather than at fulfilment.
            const source = d.ledger[ledgerKey(input.productId, input.fromLocationId)];
            const available = (source?.quantityOnHand ?? 0) - (source?.quantityReserved ?? 0);
            if (available < input.quantity) {
              return fail(
                `Only ${Math.max(available, 0).toLocaleString()} available (unreserved) at ${locName(d, input.fromLocationId)}.`
              );
            }

            d.salesOrderCounter += 1;
            const prefix = input.kind === 'requisition' ? 'REQ' : 'TRF';
            const order: SalesOrder = {
              id: randomUUID(),
              orderNumber: `${prefix}-${d.salesOrderCounter}`,
              kind: input.kind,
              fromLocationId: input.fromLocationId,
              toLocationId: input.toLocationId,
              productId: input.productId,
              quantityOrdered: input.quantity,
              quantityReceived: 0,
              unitPrice: input.unitPrice,
              status: 'draft',
              createdBy: g.user.id,
              createdAt: new Date().toISOString(),
              confirmedAt: null,
              dispatchedAt: null,
            };
            d.salesOrders.push(order);

            const product = d.products.find((p) => p.id === input.productId);
            const route = `${locName(d, input.fromLocationId)} → ${locName(d, input.toLocationId)}`;
            if (input.kind === 'requisition') {
              // Store needs to know there's something to pick; Admin oversees.
              notify(d, {
                audience: ['store', 'admin'],
                title: `New requisition ${order.orderNumber}`,
                body: `${locName(d, input.toLocationId)} requested ${input.quantity.toLocaleString()} × ${product?.sku ?? 'item'} from the Store.`,
                href: '/dashboard/requisitions',
              });
            } else {
              notify(d, {
                audience: ['admin', 'store'],
                assetId: input.fromLocationId,
                title: `Transfer raised ${order.orderNumber}`,
                body: `${route} — ${input.quantity.toLocaleString()} × ${product?.sku ?? 'item'}.`,
                href: '/dashboard/requisitions',
              });
            }

            audit(d, { tableName: 'sales_orders', recordId: order.id, action: 'insert', changedBy: g.user.id, after: order });
            return ok(`${order.orderNumber} created as a draft — nothing is reserved yet.`);
          }),

        confirmSalesOrder: (orderId) =>
          tx((d) => {
            const order = d.salesOrders.find((o) => o.id === orderId);
            if (!order) return fail('Record not found.');
            const g = guard(order.kind === 'requisition' ? 'manage_sales_orders' : 'manage_transfers');
            if ('error' in g) return fail(g.error);
            if (order.status !== 'draft') return fail(`Already ${order.status.replace('_', ' ')}.`);
            // Approving reserves at the SOURCE — a ledger-state change only.
            // No movement is posted and WAC is untouched until fulfilment.
            adjustReserved(d, order.productId, order.fromLocationId, order.quantityOrdered);
            order.status = 'confirmed';
            order.confirmedAt = new Date().toISOString();
            audit(d, { tableName: 'sales_orders', recordId: order.id, action: 'update', changedBy: g.user.id, after: { status: 'confirmed' } });
            return ok(`${order.orderNumber} approved — ${order.quantityOrdered.toLocaleString()} reserved at ${locName(d, order.fromLocationId)}.`);
          }),

        /**
         * PARTIAL FULFILMENT. `receivedQuantity` is the actual amount handed
         * over and is the single source of truth, whether it was scanned one
         * at a time, scanned in bulk, or typed.
         *
         * Short fulfilment does NOT close the record: what moved is posted,
         * what didn't stays outstanding, and the shortfall stays reserved at
         * the source so it can't be promised to anyone else.
         */
        fulfilSalesOrder: (orderId, receivedQuantity) =>
          tx((d) => {
            const order = d.salesOrders.find((o) => o.id === orderId);
            if (!order) return fail('Record not found.');
            const g = guard(order.kind === 'requisition' ? 'manage_sales_orders' : 'manage_transfers');
            if ('error' in g) return fail(g.error);
            if (order.status !== 'confirmed' && order.status !== 'partially_fulfilled') {
              return fail('Only approved records can be fulfilled.');
            }

            const outstandingBefore = Math.round((order.quantityOrdered - order.quantityReceived) * 1000) / 1000;
            if (receivedQuantity <= 0) return fail('Received quantity must be a positive number.');
            if (receivedQuantity > outstandingBefore + 1e-9) {
              return fail(`Cannot fulfil more than the ${outstandingBefore.toLocaleString()} still outstanding.`);
            }

            const sourceLedger = d.ledger[ledgerKey(order.productId, order.fromLocationId)];
            if (!sourceLedger) return fail(`No stock at ${locName(d, order.fromLocationId)} for this product.`);

            // Release only what actually moves, then post out at source and
            // in at destination — carrying the source's WAC, so a movement
            // never fabricates value.
            const unitCost = sourceLedger.weightedAverageCost;
            adjustReserved(d, order.productId, order.fromLocationId, -receivedQuantity);
            postMovement(d, {
              productId: order.productId,
              warehouseId: order.fromLocationId,
              movementType: 'transfer_out',
              quantity: -Math.abs(receivedQuantity),
              unitCost,
              referenceType: order.kind === 'requisition' ? 'requisition' : 'transfer',
              referenceId: order.id,
              createdBy: g.user.id,
            });
            postMovement(d, {
              productId: order.productId,
              warehouseId: order.toLocationId,
              movementType: 'transfer_in',
              quantity: Math.abs(receivedQuantity),
              unitCost,
              referenceType: order.kind === 'requisition' ? 'requisition' : 'transfer',
              referenceId: order.id,
              createdBy: g.user.id,
            });

            order.quantityReceived = Math.round((order.quantityReceived + receivedQuantity) * 1000) / 1000;
            const outstanding = Math.round((order.quantityOrdered - order.quantityReceived) * 1000) / 1000;

            // Arriving stock is no longer idle at its destination.
            delete d.idleFlagged[`${order.toLocationId}::${order.productId}`];

            const product = d.products.find((p) => p.id === order.productId);
            if (outstanding <= 1e-9) {
              order.status = 'dispatched';
              order.dispatchedAt = new Date().toISOString();
              notify(d, {
                audience: ['engineer', 'admin'],
                assetId: order.toLocationId,
                title: `${order.orderNumber} fulfilled`,
                body: `${order.quantityOrdered.toLocaleString()} × ${product?.sku ?? 'item'} received at ${locName(d, order.toLocationId)}.`,
                href: '/dashboard/requisitions',
              });
              audit(d, { tableName: 'sales_orders', recordId: order.id, action: 'update', changedBy: g.user.id, after: { status: 'dispatched' } });
              return ok(`${order.orderNumber} fulfilled in full — ${receivedQuantity.toLocaleString()} moved.`);
            }

            order.status = 'partially_fulfilled';
            // The shortfall stays reserved at source, so it remains promised
            // to this record and can't be handed to another.
            notify(d, {
              audience: ['engineer', 'store', 'admin'],
              assetId: order.toLocationId,
              title: `${order.orderNumber} partially fulfilled`,
              body: `Requested ${order.quantityOrdered.toLocaleString()}, received ${order.quantityReceived.toLocaleString()}, ${outstanding.toLocaleString()} still outstanding and reserved.`,
              href: '/dashboard/requisitions',
            });
            audit(d, { tableName: 'sales_orders', recordId: order.id, action: 'update', changedBy: g.user.id, after: { status: 'partially_fulfilled', received: order.quantityReceived } });
            return ok(
              `${receivedQuantity.toLocaleString()} received. ${outstanding.toLocaleString()} still outstanding — kept reserved at ${locName(d, order.fromLocationId)}.`
            );
          }),

        cancelSalesOrder: (orderId) =>
          tx((d) => {
            const order = d.salesOrders.find((o) => o.id === orderId);
            if (!order) return fail('Record not found.');
            const g = guard(order.kind === 'requisition' ? 'manage_sales_orders' : 'manage_transfers');
            if ('error' in g) return fail(g.error);
            if (order.status === 'dispatched' || order.status === 'cancelled') {
              return fail(`Already ${order.status}.`);
            }
            // Release whatever is still reserved but never moved.
            if (order.status === 'confirmed' || order.status === 'partially_fulfilled') {
              const stillReserved = Math.round((order.quantityOrdered - order.quantityReceived) * 1000) / 1000;
              if (stillReserved > 0) adjustReserved(d, order.productId, order.fromLocationId, -stillReserved);
            }
            order.status = 'cancelled';
            audit(d, { tableName: 'sales_orders', recordId: order.id, action: 'update', changedBy: g.user.id, after: { status: 'cancelled' } });
            return ok(`${order.orderNumber} cancelled.`);
          }),

        /**
         * The action offered on an idle-stock prompt: raise an Asset → Store
         * return for everything of that product currently at the asset. It
         * creates a normal transfer record rather than silently moving
         * stock, so the return is auditable like any other movement.
         */
        returnStockToStore: (assetId, productId) =>
          tx((d) => {
            const g = guard('manage_transfers');
            if ('error' in g) return fail(g.error);
            const entry = d.ledger[ledgerKey(productId, assetId)];
            const available = (entry?.quantityOnHand ?? 0) - (entry?.quantityReserved ?? 0);
            if (available <= 0) return fail('No unreserved stock at this asset to return.');

            d.salesOrderCounter += 1;
            const order: SalesOrder = {
              id: randomUUID(),
              orderNumber: `TRF-${d.salesOrderCounter}`,
              kind: 'transfer',
              fromLocationId: assetId,
              toLocationId: STORE_LOCATION_ID,
              productId,
              quantityOrdered: available,
              quantityReceived: 0,
              unitPrice: entry?.weightedAverageCost ?? 0,
              status: 'draft',
              createdBy: g.user.id,
              createdAt: new Date().toISOString(),
              confirmedAt: null,
              dispatchedAt: null,
            };
            d.salesOrders.push(order);
            delete d.idleFlagged[`${assetId}::${productId}`];

            const product = d.products.find((p) => p.id === productId);
            notify(d, {
              audience: ['store', 'admin'],
              title: `Return raised ${order.orderNumber}`,
              body: `${locName(d, assetId)} is returning ${available.toLocaleString()} × ${product?.sku ?? 'item'} to the Store.`,
              href: '/dashboard/requisitions',
            });
            audit(d, { tableName: 'sales_orders', recordId: order.id, action: 'insert', changedBy: g.user.id, after: order });
            return ok(`${order.orderNumber} raised — approve and fulfil it to complete the return.`);
          }),

        // ---------------------------------------------------------------
        // Workshop BOM — Engineer-only, requisition-driven.
        // The permission gate reuses `manage_sales_orders` (the same
        // permission engineers use to create requisitions), deliberately:
        // only the role that can raise a requisition can build a BOM from one.
        // ---------------------------------------------------------------
        addWorkshopBomLine: (input) =>
          tx((d) => {
            const g = guard('manage_sales_orders');
            if ('error' in g) return fail(g.error);
            // Engineers may only build a BOM for their own assigned asset.
            if (g.user.assetId !== input.assetId) {
              return fail('You can only build a Workshop BOM for your own asset.');
            }
            // Duplicate guard — remove and re-add to change quantity.
            if (d.workshopBomLines.some((l) => l.assetId === input.assetId && l.productId === input.productId)) {
              return fail('That material is already on this Workshop BOM — remove it first to change the quantity.');
            }
            if (input.quantity <= 0) return fail('Quantity per job unit must be a positive number.');
            const line: WorkshopBomLine = {
              id: randomUUID(),
              assetId: input.assetId,
              productId: input.productId,
              quantity: input.quantity,
            };
            d.workshopBomLines.push(line);
            const product = d.products.find((p) => p.id === input.productId);
            return ok(`Added ${product?.sku ?? 'material'} — ${input.quantity} per job unit.`);
          }),

        removeWorkshopBomLine: (lineId) =>
          tx((d) => {
            const g = guard('manage_sales_orders');
            if ('error' in g) return fail(g.error);
            const index = d.workshopBomLines.findIndex((l) => l.id === lineId);
            if (index === -1) return fail('Workshop BOM line not found.');
            // Confirm it belongs to the engineer's own asset.
            if (g.user.assetId !== d.workshopBomLines[index].assetId) {
              return fail('You can only modify the Workshop BOM for your own asset.');
            }
            d.workshopBomLines.splice(index, 1);
            return ok('Material removed from Workshop BOM.');
          }),

        // ---------------------------------------------------------------
        // Notifications & idle-stock detection
        // ---------------------------------------------------------------
        markNotificationRead: (id) =>
          set((s) => {
            const userId = s.currentUserId;
            if (!userId) return {};
            return {
              notifications: s.notifications.map((n) =>
                n.id === id && !n.readBy.includes(userId) ? { ...n, readBy: [...n.readBy, userId] } : n
              ),
            };
          }),

        markAllNotificationsRead: () =>
          set((s) => {
            const userId = s.currentUserId;
            if (!userId) return {};
            return {
              notifications: s.notifications.map((n) =>
                n.readBy.includes(userId) ? n : { ...n, readBy: [...n.readBy, userId] }
              ),
            };
          }),

        /**
         * Automated idle-stock detection. Runs on app load (see App shell) so
         * no one has to remember to check. Any asset holding stock whose last
         * inbound is older than IDLE_STOCK_DAYS raises a prompt addressed to
         * that asset's engineers, offering a return to Store.
         *
         * `idleFlagged` keeps it idempotent — the same stock won't re-prompt
         * on every page load. It clears when the stock moves.
         */
        detectIdleStock: () => {
          const s = get();
          const cutoff = Date.now() - IDLE_STOCK_DAYS * 24 * 60 * 60 * 1000;
          const assetIds = new Set(s.locations.filter((l) => l.kind === 'asset').map((l) => l.id));
          const fresh: AppNotification[] = [];
          const flagged: Record<string, boolean> = {};

          for (const entry of Object.values(s.ledger)) {
            if (!assetIds.has(entry.warehouseId) || entry.quantityOnHand <= 0) continue;
            const since = entry.lastInboundAt ? new Date(entry.lastInboundAt).getTime() : null;
            if (since === null || since > cutoff) continue;
            const key = `${entry.warehouseId}::${entry.productId}`;
            if (s.idleFlagged[key]) continue;

            const product = s.products.find((p) => p.id === entry.productId);
            const asset = s.locations.find((l) => l.id === entry.warehouseId);
            const days = Math.floor((Date.now() - since) / (24 * 60 * 60 * 1000));
            flagged[key] = true;
            fresh.push({
              id: randomUUID(),
              audience: ['engineer', 'admin'],
              assetId: entry.warehouseId,
              title: `Idle stock at ${asset?.name ?? 'asset'}`,
              body: `${entry.quantityOnHand.toLocaleString()} × ${product?.sku ?? 'item'} has sat unused for ${days} days. Return it to the Store?`,
              href: '/dashboard/requisitions',
              kind: 'idle_stock',
              productId: entry.productId,
              createdAt: new Date().toISOString(),
              readBy: [],
            });
          }

          if (fresh.length === 0) return;
          set({
            notifications: [...s.notifications, ...fresh],
            idleFlagged: { ...s.idleFlagged, ...flagged },
          });
        },

        // ---------------------------------------------------------------
        // Contextual help popups — per-user "don't show again"
        // ---------------------------------------------------------------
        dismissHelp: (sectionKey) =>
          set((s) => {
            if (!s.currentUserId) return {};
            return { helpDismissed: { ...s.helpDismissed, [`${s.currentUserId}::${sectionKey}`]: true } };
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
              // Dormant module: the old customer reference now points at the
              // destination location. Nothing populates invoices any more.
              customerId: order.toLocationId,
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
      // Version 2: adds WorkshopBomLine and pre-seeded draft requisitions.
      // `migrate` returning undefined signals "discard old data, start fresh"
      // which is what we want here — existing localStorage has no seeded
      // orders and no workshopBomLines field.
      version: 2,
      migrate: (_persistedState, fromVersion) => {
        // Any stored state from before version 2 is incompatible with the new
        // seed data shape. Return undefined to discard it and use freshData().
        if (fromVersion < 2) return undefined;
        return _persistedState as Data;
      },
    }
  )
);

/** Current signed-in user, or null. Re-derived from `users` so 2FA changes are live. */
export function useCurrentUser(): User | null {
  return useStore((s) => (s.currentUserId ? s.users.find((u) => u.id === s.currentUserId) ?? null : null));
}

/**
 * Which notifications reach a given user. One rule, used by both the badge
 * count and the list:
 *
 *  1. The user's role must be in the notification's audience.
 *  2. If the notification is scoped to an asset, engineers only see it when
 *     it's THEIR asset. Admin and Store hold organisation-wide roles, so an
 *     asset scope doesn't hide anything from them.
 */
export function visibleNotifications(
  notifications: AppNotification[],
  roleName: string,
  userAssetId: string | null
): AppNotification[] {
  const audience = roleName as NotificationAudience;
  return notifications.filter((n) => {
    if (!n.audience.includes(audience)) return false;
    if (n.assetId && roleName === 'engineer') return n.assetId === userAssetId;
    return true;
  });
}

/**
 * The locations a user should see detail for, and the one their dashboard
 * centres on.
 *
 *  - Engineer  -> their own asset (they still see other assets' quantities,
 *                 just without the same operational detail).
 *  - Store     -> the Store.
 *  - Admin     -> everything; no single focus.
 */
export function scopeFor(user: User | null, roleName: string): { focusLocationId: string | null } {
  if (!user) return { focusLocationId: null };
  if (roleName === 'engineer') return { focusLocationId: user.assetId };
  if (roleName === 'store') return { focusLocationId: STORE_LOCATION_ID };
  return { focusLocationId: null };
}

export { STORE_LOCATION_ID };

export { adjustmentReasonCodes };
