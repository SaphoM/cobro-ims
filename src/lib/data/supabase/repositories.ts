/**
 * Supabase-backed repository implementations. Every repository here
 * implements the exact same interface as its mock counterpart in
 * src/lib/data/mock/repositories.ts — callers never know the difference.
 *
 * Client policy (real Supabase Auth):
 *   - Ordinary employee reads/writes go through the USER-SCOPED client
 *     (createServerSupabaseClient) so auth.uid() resolves and RLS applies as
 *     a real backstop underneath the Server Action permission checks.
 *   - A SMALL set of trusted, privileged operations use the service-role
 *     client (getServiceSupabase): the stock ledger/movement writer and
 *     reservation adjuster (those tables have no user-writable RLS policy by
 *     design), global document-number generation (must see every row, not
 *     just the caller's), Auth Admin user creation, the app-settings singleton
 *     write, and the cross-device scan-handoff token flow. Each is invoked
 *     only after the Server Action layer has already authorised the caller.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceSupabase } from '@/lib/supabase/service';
import type {
  AdjustmentReasonCode,
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
  Supplier,
  User,
  Warehouse,
} from '@/lib/domain/inventory';
import { VAT_RATE } from '@/lib/domain/inventory';
import type {
  AddBomLineInput,
  AdjustmentReasonRepository,
  AppSettings,
  AuditLogRepository,
  CreateCustomerInput,
  CreateProductInput,
  CreatePurchaseOrderInput,
  CreateSalesOrderInput,
  CreateSupplierInput,
  CreateUserInput,
  CreateWarehouseInput,
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
  RoleRepository,
  SalesOrderRepository,
  ScanHandoffRepository,
  ScanHandoffSession,
  SettingsRepository,
  StockAdjustmentRepository,
  StockLedgerRepository,
  StockMovementRepository,
  SupplierRepository,
  TransferRepository,
  UserRepository,
  WarehouseRepository,
  WriteAuditEntryInput,
} from '@/lib/data/repositories';
import { applyMovement } from '@/lib/services/inventory-engine';
import { generateTemporaryPassword } from '@/lib/temp-password';

// ---------------------------------------------------------------------------
// Helpers: snake_case DB rows ↔ camelCase domain objects
// ---------------------------------------------------------------------------

function snakeToCamel(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  }
  return out;
}

function toCamel<T>(row: Record<string, unknown>): T {
  return snakeToCamel(row) as T;
}

function toCamelArray<T>(rows: Record<string, unknown>[]): T[] {
  return rows.map((r) => toCamel<T>(r));
}

/**
 * Generate the next sequential document number by reading the current max
 * from the table. Adequate for <20 concurrent users; the DB RPC functions
 * exist for truly atomic generation when needed later.
 */
async function nextDocNumber(
  table: string,
  column: string,
  prefix: string,
  startAt = 1001
): Promise<string> {
  const sb = getServiceSupabase();
  const { data } = await sb
    .from(table)
    .select(column)
    .order(column, { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return `${prefix}-${startAt}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const last = (data[0] as any)[column] as string;
  const m = last.match(/(\d+)$/);
  return `${prefix}-${m ? parseInt(m[1], 10) + 1 : startAt}`;
}

/**
 * Central stock-movement writer: reads the current ledger, applies the WAC
 * engine (the same pure `applyMovement` function the mock layer uses), then
 * upserts the ledger and inserts the movement row.
 */
async function postMovement(input: RecordMovementInput): Promise<{ movement: StockMovement; ledger: StockLedgerEntry }> {
  const sb = getServiceSupabase();

  // 1. Current ledger snapshot
  const { data: ledgerRow } = await sb
    .from('stock_ledger')
    .select('*')
    .eq('product_id', input.productId)
    .eq('warehouse_id', input.warehouseId)
    .maybeSingle();

  const current: StockLedgerEntry | null = ledgerRow ? toCamel<StockLedgerEntry>(ledgerRow) : null;

  // 2. WAC calculation via existing pure engine
  const newLedger = applyMovement(current, {
    productId: input.productId,
    warehouseId: input.warehouseId,
    movementType: input.movementType,
    quantity: input.quantity,
    unitCost: input.unitCost,
  });

  // 3. Upsert ledger
  const { error: ledgerErr } = await sb.from('stock_ledger').upsert(
    {
      product_id: input.productId,
      warehouse_id: input.warehouseId,
      quantity_on_hand: newLedger.quantityOnHand,
      quantity_reserved: newLedger.quantityReserved,
      weighted_average_cost: newLedger.weightedAverageCost,
      updated_at: newLedger.updatedAt,
    },
    { onConflict: 'product_id,warehouse_id' }
  );
  if (ledgerErr) throw new Error(`Ledger update failed: ${ledgerErr.message}`);

  // 4. Insert movement
  const { data: movRow, error: movErr } = await sb
    .from('stock_movements')
    .insert({
      product_id: input.productId,
      warehouse_id: input.warehouseId,
      movement_type: input.movementType,
      quantity: input.quantity,
      unit_cost: input.unitCost,
      reference_type: input.referenceType ?? null,
      reference_id: input.referenceId ?? null,
      batch_ref: input.batchRef?.trim() ? input.batchRef.trim() : null,
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (movErr) throw new Error(`Movement insert failed: ${movErr.message}`);

  return { movement: toCamel<StockMovement>(movRow), ledger: newLedger };
}

// ---------------------------------------------------------------------------
// Warehouse
// ---------------------------------------------------------------------------

export const sbWarehouseRepository: WarehouseRepository = {
  async list() {
    const { data, error } = await (await createServerSupabaseClient()).from('warehouses').select('*').order('created_at');
    if (error) throw new Error(error.message);
    return toCamelArray<Warehouse>(data);
  },
  async getById(id) {
    const { data, error } = await (await createServerSupabaseClient()).from('warehouses').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toCamel<Warehouse>(data) : null;
  },
  async create(input: CreateWarehouseInput) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('warehouses')
      .insert({
        code: input.code,
        name: input.name,
        address: input.address,
        type: input.type,
        owner_user_id: input.ownerUserId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toCamel<Warehouse>(data);
  },
  async getByOwner(ownerUserId) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('warehouses')
      .select('*')
      .eq('type', 'engineer_station')
      .eq('owner_user_id', ownerUserId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toCamel<Warehouse>(data) : null;
  },
};

// ---------------------------------------------------------------------------
// Role
// ---------------------------------------------------------------------------

export const sbRoleRepository: RoleRepository = {
  async list() {
    const { data, error } = await (await createServerSupabaseClient()).from('roles').select('*').order('created_at');
    if (error) throw new Error(error.message);
    return toCamelArray(data);
  },
  async getById(id) {
    const { data, error } = await (await createServerSupabaseClient()).from('roles').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toCamel(data) : null;
  },
};

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export const sbAuditLogRepository: AuditLogRepository = {
  async write(input: WriteAuditEntryInput) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('audit_log')
      .insert({
        table_name: input.tableName,
        record_id: input.recordId,
        action: input.action,
        changed_by: input.changedBy,
        before: input.before ?? null,
        after: input.after ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toCamel<AuditLogEntry>(data);
  },
  async list(limit = 200) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('audit_log')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return toCamelArray<AuditLogEntry>(data);
  },
};

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

export const sbProductRepository: ProductRepository = {
  async list() {
    const { data, error } = await (await createServerSupabaseClient()).from('products').select('*').order('created_at');
    if (error) throw new Error(error.message);
    return toCamelArray<Product>(data);
  },
  async getById(id) {
    const { data, error } = await (await createServerSupabaseClient()).from('products').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toCamel<Product>(data) : null;
  },
  async getBySku(sku) {
    const { data, error } = await (await createServerSupabaseClient()).from('products').select('*').ilike('sku', sku).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toCamel<Product>(data) : null;
  },
  async getByBarcode(barcode) {
    const { data, error } = await (await createServerSupabaseClient()).from('products').select('*').eq('barcode', barcode).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toCamel<Product>(data) : null;
  },
  async create(input: CreateProductInput) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('products')
      .insert({
        sku: input.sku,
        name: input.name,
        unit_of_measure: input.unitOfMeasure,
        barcode: input.barcode ?? null,
        reorder_point: input.reorderPoint ?? null,
        reorder_quantity: input.reorderQuantity ?? null,
        unit_price: input.unitPrice ?? null,
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        if (error.message.includes('sku')) throw new Error(`SKU "${input.sku}" already exists.`);
        if (error.message.includes('barcode')) {
          // Look up the clashing product to match the mock error message
          const clash = input.barcode ? await sbProductRepository.getByBarcode(input.barcode) : null;
          throw new Error(
            `Barcode "${input.barcode}" is already assigned to ${clash?.sku ?? '?'} - ${clash?.name ?? '?'}.`
          );
        }
      }
      throw new Error(error.message);
    }
    return toCamel<Product>(data);
  },
  async setUnitPrice(productId, unitPrice) {
    if (unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
      throw new Error('Price must be zero or a positive number.');
    }
    const { data, error } = await (await createServerSupabaseClient())
      .from('products')
      .update({ unit_price: unitPrice, updated_at: new Date().toISOString() })
      .eq('id', productId)
      .select()
      .single();
    if (error) throw new Error('That product could not be found.');
    return toCamel<Product>(data);
  },
  async listBom(parentProductId) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('product_bom')
      .select('*')
      .eq('parent_product_id', parentProductId);
    if (error) throw new Error(error.message);
    return toCamelArray<ProductBomLine>(data);
  },
  async addBomLine(input: AddBomLineInput) {
    if (input.parentProductId === input.componentProductId) {
      throw new Error('A product cannot be a component of itself.');
    }
    const { data, error } = await (await createServerSupabaseClient())
      .from('product_bom')
      .insert({
        parent_product_id: input.parentProductId,
        component_product_id: input.componentProductId,
        quantity: input.quantity,
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        throw new Error('That component is already on this BOM - remove it first to change the quantity.');
      }
      throw new Error(error.message);
    }
    return toCamel<ProductBomLine>(data);
  },
  async removeBomLine(lineId) {
    const { error } = await (await createServerSupabaseClient()).from('product_bom').delete().eq('id', lineId);
    if (error) throw new Error('BOM line not found.');
  },
};

// ---------------------------------------------------------------------------
// Stock ledger
// ---------------------------------------------------------------------------

export const sbStockLedgerRepository: StockLedgerRepository = {
  async listAll() {
    const { data, error } = await (await createServerSupabaseClient()).from('stock_ledger').select('*');
    if (error) throw new Error(error.message);
    return toCamelArray<StockLedgerEntry>(data);
  },
  async listByWarehouse(warehouseId) {
    const { data, error } = await (await createServerSupabaseClient()).from('stock_ledger').select('*').eq('warehouse_id', warehouseId);
    if (error) throw new Error(error.message);
    return toCamelArray<StockLedgerEntry>(data);
  },
  async get(productId, warehouseId) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('stock_ledger')
      .select('*')
      .eq('product_id', productId)
      .eq('warehouse_id', warehouseId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toCamel<StockLedgerEntry>(data) : null;
  },
  async adjustReserved(productId, warehouseId, delta) {
    // Service-role: stock_ledger has no user-writable UPDATE policy — this is
    // a trusted reservation write invoked only from confirm/dispatch/cancel.
    const sb = getServiceSupabase();
    const { data: row, error: readErr } = await sb
      .from('stock_ledger')
      .select('*')
      .eq('product_id', productId)
      .eq('warehouse_id', warehouseId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error('No stock ledger entry to reserve against.');

    const current = toCamel<StockLedgerEntry>(row);
    const nextReserved = current.quantityReserved + delta;

    if (nextReserved < -1e-9) {
      throw new Error('Cannot release more stock than is currently reserved.');
    }
    if (nextReserved > current.quantityOnHand + 1e-9) {
      throw new Error('Not enough available stock to reserve that quantity.');
    }

    const rounded = Math.round(nextReserved * 1000) / 1000;
    const now = new Date().toISOString();

    const { data: updated, error: writeErr } = await sb
      .from('stock_ledger')
      .update({ quantity_reserved: rounded, updated_at: now })
      .eq('product_id', productId)
      .eq('warehouse_id', warehouseId)
      .select()
      .single();
    if (writeErr) throw new Error(writeErr.message);
    return toCamel<StockLedgerEntry>(updated);
  },
};

// ---------------------------------------------------------------------------
// Stock movements
// ---------------------------------------------------------------------------

export const sbStockMovementRepository: StockMovementRepository = {
  async listByProduct(productId, warehouseId) {
    let q = (await createServerSupabaseClient()).from('stock_movements').select('*').eq('product_id', productId);
    if (warehouseId) q = q.eq('warehouse_id', warehouseId);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return toCamelArray<StockMovement>(data);
  },
  async listRecent(limit = 20) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('stock_movements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return toCamelArray<StockMovement>(data);
  },
  async record(input: RecordMovementInput) {
    return postMovement(input);
  },
};

// ---------------------------------------------------------------------------
// Supplier
// ---------------------------------------------------------------------------

export const sbSupplierRepository: SupplierRepository = {
  async list() {
    const { data, error } = await (await createServerSupabaseClient()).from('suppliers').select('*').order('created_at');
    if (error) throw new Error(error.message);
    return toCamelArray<Supplier>(data);
  },
  async create(input: CreateSupplierInput) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('suppliers')
      .insert({
        name: input.name,
        contact_email: input.contactEmail ?? null,
        contact_phone: input.contactPhone ?? null,
        address: input.address ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toCamel<Supplier>(data);
  },
};

// ---------------------------------------------------------------------------
// Customer (labeled "Department" in the UI — route unchanged per §1.1)
// ---------------------------------------------------------------------------

export const sbCustomerRepository: CustomerRepository = {
  async list() {
    const { data, error } = await (await createServerSupabaseClient()).from('customers').select('*').order('created_at');
    if (error) throw new Error(error.message);
    return toCamelArray<Customer>(data);
  },
  async create(input: CreateCustomerInput) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('customers')
      .insert({
        name: input.name,
        contact_email: input.contactEmail ?? null,
        contact_phone: input.contactPhone ?? null,
        address: input.address ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toCamel<Customer>(data);
  },
};

// ---------------------------------------------------------------------------
// Goods Receiving
// ---------------------------------------------------------------------------

export const sbReceivingRepository: ReceivingRepository = {
  async listRecentReceipts(limit = 20) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('goods_receipts')
      .select('*')
      .order('received_at', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return toCamelArray<GoodsReceipt>(data);
  },

  async quickReceive(input: QuickReceiveInput) {
    const sb = (await createServerSupabaseClient());
    const now = new Date().toISOString();
    const poNumber = await nextDocNumber('purchase_orders', 'po_number', 'PO');
    const grnNumber = await nextDocNumber('goods_receipts', 'grn_number', 'GRN');

    // Create PO (immediately 'received')
    const { data: poRow, error: poErr } = await sb
      .from('purchase_orders')
      .insert({
        po_number: poNumber,
        supplier_id: input.supplierId,
        warehouse_id: input.warehouseId,
        status: 'received',
        ordered_at: now,
        created_by: input.receivedBy,
      })
      .select()
      .single();
    if (poErr) throw new Error(poErr.message);
    const po = toCamel<PurchaseOrder>(poRow);

    // Create PO line
    const { error: lineErr } = await sb.from('purchase_order_lines').insert({
      purchase_order_id: po.id,
      product_id: input.productId,
      quantity_ordered: Math.abs(input.quantity),
      quantity_received: Math.abs(input.quantity),
      unit_cost: input.unitCost,
    });
    if (lineErr) throw new Error(lineErr.message);

    // Create GRN
    const { data: grnRow, error: grnErr } = await sb
      .from('goods_receipts')
      .insert({
        grn_number: grnNumber,
        purchase_order_id: po.id,
        warehouse_id: input.warehouseId,
        status: 'posted',
        received_by: input.receivedBy,
        received_at: now,
      })
      .select()
      .single();
    if (grnErr) throw new Error(grnErr.message);
    const grn = toCamel<GoodsReceipt>(grnRow);

    // Post stock movement
    await postMovement({
      productId: input.productId,
      warehouseId: input.warehouseId,
      movementType: 'receipt',
      quantity: Math.abs(input.quantity),
      unitCost: input.unitCost,
      referenceType: 'goods_receipt',
      referenceId: grn.id,
      createdBy: input.receivedBy,
    });

    return { purchaseOrder: po, goodsReceipt: grn };
  },
};

// ---------------------------------------------------------------------------
// Purchase Orders
// ---------------------------------------------------------------------------

async function poWithLine(poRow: Record<string, unknown>): Promise<PurchaseOrderWithLine> {
  const po = toCamel<PurchaseOrder>(poRow);
  const { data: lineRow, error } = await (await createServerSupabaseClient())
    .from('purchase_order_lines')
    .select('*')
    .eq('purchase_order_id', po.id)
    .limit(1)
    .single();
  if (error || !lineRow) throw new Error(`Purchase order ${po.poNumber} has no line - data inconsistency.`);
  return { ...po, line: toCamel<PurchaseOrderLine>(lineRow) };
}

export const sbPurchaseOrderRepository: PurchaseOrderRepository = {
  async list() {
    const { data, error } = await (await createServerSupabaseClient())
      .from('purchase_orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    const results: PurchaseOrderWithLine[] = [];
    for (const row of data) {
      results.push(await poWithLine(row));
    }
    return results;
  },
  async create(input: CreatePurchaseOrderInput) {
    const sb = (await createServerSupabaseClient());
    const poNumber = await nextDocNumber('purchase_orders', 'po_number', 'PO');
    const now = new Date().toISOString();

    const { data: poRow, error: poErr } = await sb
      .from('purchase_orders')
      .insert({
        po_number: poNumber,
        supplier_id: input.supplierId,
        warehouse_id: input.warehouseId,
        status: 'draft',
        created_by: input.createdBy,
      })
      .select()
      .single();
    if (poErr) throw new Error(poErr.message);

    const { error: lineErr } = await sb.from('purchase_order_lines').insert({
      purchase_order_id: poRow.id,
      product_id: input.productId,
      quantity_ordered: input.quantity,
      quantity_received: 0,
      unit_cost: input.unitCost,
    });
    if (lineErr) throw new Error(lineErr.message);

    return poWithLine(poRow);
  },
  async issue(poId) {
    const sb = (await createServerSupabaseClient());
    const { data: existing } = await sb.from('purchase_orders').select('status').eq('id', poId).single();
    if (!existing) throw new Error('Purchase order not found.');
    if (existing.status !== 'draft') throw new Error(`Purchase order is already ${existing.status}.`);

    const { data: poRow, error } = await sb
      .from('purchase_orders')
      .update({ status: 'issued', ordered_at: new Date().toISOString() })
      .eq('id', poId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return poWithLine(poRow);
  },
  async receive(poId, quantity, receivedBy) {
    const sb = (await createServerSupabaseClient());
    const { data: poRow } = await sb.from('purchase_orders').select('*').eq('id', poId).single();
    if (!poRow) throw new Error('Purchase order not found.');
    if (poRow.status !== 'issued' && poRow.status !== 'partially_received') {
      throw new Error(`Purchase order must be issued before it can be received (currently ${poRow.status}).`);
    }
    const { data: lineRow } = await sb
      .from('purchase_order_lines')
      .select('*')
      .eq('purchase_order_id', poId)
      .limit(1)
      .single();
    if (!lineRow) throw new Error('Purchase order line not found.');

    const remaining = lineRow.quantity_ordered - lineRow.quantity_received;
    if (quantity <= 0) throw new Error('Quantity received must be a positive number.');
    if (quantity > remaining + 1e-9) {
      throw new Error(`Cannot receive more than the ${remaining} units still outstanding on this order.`);
    }

    const grnNumber = await nextDocNumber('goods_receipts', 'grn_number', 'GRN');
    const now = new Date().toISOString();

    const { data: grnRow, error: grnErr } = await sb
      .from('goods_receipts')
      .insert({
        grn_number: grnNumber,
        purchase_order_id: poId,
        warehouse_id: poRow.warehouse_id,
        status: 'posted',
        received_by: receivedBy,
        received_at: now,
      })
      .select()
      .single();
    if (grnErr) throw new Error(grnErr.message);

    await postMovement({
      productId: lineRow.product_id,
      warehouseId: poRow.warehouse_id,
      movementType: 'receipt',
      quantity: Math.abs(quantity),
      unitCost: lineRow.unit_cost,
      referenceType: 'goods_receipt',
      referenceId: grnRow.id,
      createdBy: receivedBy,
    });

    const newReceived = Math.round((lineRow.quantity_received + quantity) * 1000) / 1000;
    const newStatus = newReceived >= lineRow.quantity_ordered - 1e-9 ? 'received' : 'partially_received';

    await sb
      .from('purchase_order_lines')
      .update({ quantity_received: newReceived })
      .eq('id', lineRow.id);

    const { data: updatedPo } = await sb
      .from('purchase_orders')
      .update({ status: newStatus })
      .eq('id', poId)
      .select()
      .single();

    return {
      purchaseOrder: await poWithLine(updatedPo ?? poRow),
      goodsReceipt: toCamel<GoodsReceipt>(grnRow),
    };
  },
  async getStatus(poId) {
    const { data } = await (await createServerSupabaseClient()).from('purchase_orders').select('status').eq('id', poId).maybeSingle();
    return (data?.status as PurchaseOrder['status']) ?? null;
  },
};

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

export const sbTransferRepository: TransferRepository = {
  async list() {
    const { data, error } = await (await createServerSupabaseClient())
      .from('inter_warehouse_transfers')
      .select('*')
      .order('initiated_at', { ascending: false });
    if (error) throw new Error(error.message);
    return toCamelArray<InterWarehouseTransfer>(data);
  },
  async initiate(input: InitiateTransferInput) {
    if (input.fromWarehouseId === input.toWarehouseId) {
      throw new Error('Source and destination warehouse must differ.');
    }
    const sb = (await createServerSupabaseClient());

    const { data: ledgerRow } = await sb
      .from('stock_ledger')
      .select('*')
      .eq('product_id', input.productId)
      .eq('warehouse_id', input.fromWarehouseId)
      .maybeSingle();
    const sourceLedger = ledgerRow ? toCamel<StockLedgerEntry>(ledgerRow) : null;

    if (!sourceLedger || sourceLedger.quantityOnHand < input.quantity) {
      throw new Error('Not enough stock on hand at the source warehouse to transfer that quantity.');
    }

    const transferNumber = await nextDocNumber('inter_warehouse_transfers', 'transfer_number', 'XFR');

    const { data: xfrRow, error: xfrErr } = await sb
      .from('inter_warehouse_transfers')
      .insert({
        transfer_number: transferNumber,
        from_warehouse_id: input.fromWarehouseId,
        to_warehouse_id: input.toWarehouseId,
        status: 'in_transit',
        initiated_by: input.initiatedBy,
      })
      .select()
      .single();
    if (xfrErr) throw new Error(xfrErr.message);

    // Store line for complete()
    await sb.from('inter_warehouse_transfer_lines').insert({
      transfer_id: xfrRow.id,
      product_id: input.productId,
      quantity: Math.abs(input.quantity),
    });

    // Post transfer_out
    await postMovement({
      productId: input.productId,
      warehouseId: input.fromWarehouseId,
      movementType: 'transfer_out',
      quantity: -Math.abs(input.quantity),
      unitCost: sourceLedger.weightedAverageCost,
      referenceType: 'inter_warehouse_transfer',
      referenceId: xfrRow.id,
      createdBy: input.initiatedBy,
    });

    return toCamel<InterWarehouseTransfer>(xfrRow);
  },
  async complete(transferId, completedBy) {
    const sb = (await createServerSupabaseClient());
    const { data: xfrRow } = await sb
      .from('inter_warehouse_transfers')
      .select('*')
      .eq('id', transferId)
      .single();
    if (!xfrRow) throw new Error('Transfer not found.');
    if (xfrRow.status !== 'in_transit') throw new Error(`Transfer is already ${xfrRow.status}.`);

    const { data: lineRow } = await sb
      .from('inter_warehouse_transfer_lines')
      .select('*')
      .eq('transfer_id', transferId)
      .limit(1)
      .single();
    if (!lineRow) throw new Error('Transfer line details missing - cannot complete.');

    // Look up the unit cost from the transfer_out movement that was posted on initiate
    const { data: outMov } = await sb
      .from('stock_movements')
      .select('unit_cost')
      .eq('reference_id', transferId)
      .eq('movement_type', 'transfer_out')
      .limit(1)
      .single();
    const unitCost = outMov?.unit_cost ?? 0;

    await postMovement({
      productId: lineRow.product_id,
      warehouseId: xfrRow.to_warehouse_id,
      movementType: 'transfer_in',
      quantity: Number(lineRow.quantity),
      unitCost,
      referenceType: 'inter_warehouse_transfer',
      referenceId: transferId,
      createdBy: completedBy,
    });

    const { data: updated, error } = await sb
      .from('inter_warehouse_transfers')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', transferId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toCamel<InterWarehouseTransfer>(updated);
  },
  async getStatus(transferId) {
    const { data } = await (await createServerSupabaseClient())
      .from('inter_warehouse_transfers')
      .select('status')
      .eq('id', transferId)
      .maybeSingle();
    return (data?.status as InterWarehouseTransfer['status']) ?? null;
  },
  async getLine(transferId) {
    const { data: lineRow } = await (await createServerSupabaseClient())
      .from('inter_warehouse_transfer_lines')
      .select('product_id, quantity')
      .eq('transfer_id', transferId)
      .limit(1)
      .maybeSingle();
    return lineRow
      ? { productId: lineRow.product_id as string, quantity: Number(lineRow.quantity) }
      : null;
  },
};

// ---------------------------------------------------------------------------
// Adjustment reasons
// ---------------------------------------------------------------------------

export const sbAdjustmentReasonRepository: AdjustmentReasonRepository = {
  async list() {
    const { data, error } = await (await createServerSupabaseClient()).from('adjustment_reason_codes').select('*');
    if (error) throw new Error(error.message);
    return toCamelArray<AdjustmentReasonCode>(data);
  },
};

// ---------------------------------------------------------------------------
// Stock adjustments
// ---------------------------------------------------------------------------

export const sbStockAdjustmentRepository: StockAdjustmentRepository = {
  async list() {
    const { data, error } = await (await createServerSupabaseClient())
      .from('stock_adjustments')
      .select('*')
      .order('requested_at', { ascending: false });
    if (error) throw new Error(error.message);
    return toCamelArray<StockAdjustment>(data);
  },
  async request(input: RequestAdjustmentInput) {
    const sb = (await createServerSupabaseClient());
    const adjNumber = await nextDocNumber('stock_adjustments', 'adjustment_number', 'ADJ');

    const { data: adjRow, error: adjErr } = await sb
      .from('stock_adjustments')
      .insert({
        adjustment_number: adjNumber,
        warehouse_id: input.warehouseId,
        reason_code_id: input.reasonCodeId,
        status: 'pending_approval',
        requested_by: input.requestedBy,
      })
      .select()
      .single();
    if (adjErr) throw new Error(adjErr.message);

    // Store line for decide()
    await sb.from('stock_adjustment_lines').insert({
      stock_adjustment_id: adjRow.id,
      product_id: input.productId,
      quantity_delta: input.quantityDelta,
      unit_cost: input.unitCost,
    });

    return toCamel<StockAdjustment>(adjRow);
  },
  async decide(adjustmentId, decision, decidedBy) {
    const sb = (await createServerSupabaseClient());
    const { data: adjRow } = await sb
      .from('stock_adjustments')
      .select('*')
      .eq('id', adjustmentId)
      .single();
    if (!adjRow) throw new Error('Adjustment not found.');
    if (adjRow.status !== 'pending_approval') {
      throw new Error(`Adjustment is already ${adjRow.status}.`);
    }

    if (decision === 'approved') {
      const { data: lineRow } = await sb
        .from('stock_adjustment_lines')
        .select('*')
        .eq('stock_adjustment_id', adjustmentId)
        .limit(1)
        .single();
      if (!lineRow) throw new Error('Adjustment line details missing - cannot approve.');

      await postMovement({
        productId: lineRow.product_id,
        warehouseId: adjRow.warehouse_id,
        movementType: lineRow.quantity_delta >= 0 ? 'adjustment' : 'write_off',
        quantity: Number(lineRow.quantity_delta),
        unitCost: Number(lineRow.unit_cost),
        referenceType: 'stock_adjustment',
        referenceId: adjustmentId,
        createdBy: decidedBy,
      });
    }

    const { data: updated, error } = await sb
      .from('stock_adjustments')
      .update({
        status: decision,
        approved_by: decidedBy,
        approved_at: new Date().toISOString(),
      })
      .eq('id', adjustmentId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toCamel<StockAdjustment>(updated);
  },
};

// ---------------------------------------------------------------------------
// Sales orders (Requisitions — route/identifiers unchanged per §1.1)
// ---------------------------------------------------------------------------

export const sbSalesOrderRepository: SalesOrderRepository = {
  async list() {
    const { data, error } = await (await createServerSupabaseClient())
      .from('sales_orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return toCamelArray<SalesOrder>(data);
  },
  async getById(orderId) {
    const { data, error } = await (await createServerSupabaseClient()).from('sales_orders').select('*').eq('id', orderId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toCamel<SalesOrder>(data) : null;
  },
  async create(input: CreateSalesOrderInput) {
    const orderNumber = await nextDocNumber('sales_orders', 'order_number', 'REQ');

    const { data, error } = await (await createServerSupabaseClient())
      .from('sales_orders')
      .insert({
        order_number: orderNumber,
        customer_id: input.customerId,
        warehouse_id: input.warehouseId,
        product_id: input.productId,
        quantity_ordered: input.quantity,
        unit_price: input.unitPrice,
        status: 'draft',
        created_by: input.createdBy,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toCamel<SalesOrder>(data);
  },
  async confirm(orderId) {
    const sb = (await createServerSupabaseClient());
    const { data: row } = await sb.from('sales_orders').select('*').eq('id', orderId).single();
    if (!row) throw new Error('Sales order not found.');
    if (row.status !== 'draft') throw new Error(`Order is already ${row.status}.`);

    await sbStockLedgerRepository.adjustReserved(row.product_id, row.warehouse_id, Number(row.quantity_ordered));

    const { data: updated, error } = await sb
      .from('sales_orders')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', orderId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toCamel<SalesOrder>(updated);
  },
  async dispatch(orderId, dispatchedBy) {
    const sb = (await createServerSupabaseClient());
    const { data: row } = await sb.from('sales_orders').select('*').eq('id', orderId).single();
    if (!row) throw new Error('Sales order not found.');
    if (row.status !== 'confirmed') throw new Error('Only confirmed orders can be dispatched.');

    const { data: ledgerRow } = await sb
      .from('stock_ledger')
      .select('*')
      .eq('product_id', row.product_id)
      .eq('warehouse_id', row.warehouse_id)
      .single();
    if (!ledgerRow) throw new Error('No stock ledger entry for this product/warehouse.');
    const ledger = toCamel<StockLedgerEntry>(ledgerRow);

    // Release reservation
    await sbStockLedgerRepository.adjustReserved(row.product_id, row.warehouse_id, -Number(row.quantity_ordered));

    // Check if the requester has a personal station (Engineer)
    const destination = await sbWarehouseRepository.getByOwner(row.created_by);
    if (destination && destination.id !== row.warehouse_id) {
      // Transfer to Engineer's station
      await postMovement({
        productId: row.product_id,
        warehouseId: row.warehouse_id,
        movementType: 'transfer_out',
        quantity: -Math.abs(Number(row.quantity_ordered)),
        unitCost: ledger.weightedAverageCost,
        referenceType: 'sales_order',
        referenceId: orderId,
        createdBy: dispatchedBy,
      });
      await postMovement({
        productId: row.product_id,
        warehouseId: destination.id,
        movementType: 'transfer_in',
        quantity: Math.abs(Number(row.quantity_ordered)),
        unitCost: ledger.weightedAverageCost,
        referenceType: 'sales_order',
        referenceId: orderId,
        createdBy: dispatchedBy,
      });
    } else {
      // Plain outbound dispatch
      await postMovement({
        productId: row.product_id,
        warehouseId: row.warehouse_id,
        movementType: 'dispatch',
        quantity: -Math.abs(Number(row.quantity_ordered)),
        unitCost: ledger.weightedAverageCost,
        referenceType: 'sales_order',
        referenceId: orderId,
        createdBy: dispatchedBy,
      });
    }

    const { data: updated, error } = await sb
      .from('sales_orders')
      .update({ status: 'dispatched', dispatched_at: new Date().toISOString() })
      .eq('id', orderId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toCamel<SalesOrder>(updated);
  },
  async cancel(orderId) {
    const sb = (await createServerSupabaseClient());
    const { data: row } = await sb.from('sales_orders').select('*').eq('id', orderId).single();
    if (!row) throw new Error('Sales order not found.');
    if (row.status === 'dispatched' || row.status === 'cancelled') {
      throw new Error(`Order is already ${row.status}.`);
    }
    if (row.status === 'confirmed') {
      await sbStockLedgerRepository.adjustReserved(row.product_id, row.warehouse_id, -Number(row.quantity_ordered));
    }
    const { data: updated, error } = await sb
      .from('sales_orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toCamel<SalesOrder>(updated);
  },
  async getStatus(orderId) {
    const { data } = await (await createServerSupabaseClient()).from('sales_orders').select('status').eq('id', orderId).maybeSingle();
    return (data?.status as SalesOrder['status']) ?? null;
  },
};

// ---------------------------------------------------------------------------
// Invoices (dormant per §1.1 — still implemented against the real tables)
// ---------------------------------------------------------------------------

const INVOICE_PAYMENT_TERMS_DAYS = 30;

function invoiceOutstanding(inv: Invoice): number {
  return Math.round((inv.total - inv.amountPaid - inv.creditedAmount) * 100) / 100;
}

export const sbInvoiceRepository: InvoiceRepository = {
  async list() {
    const { data, error } = await (await createServerSupabaseClient())
      .from('invoices')
      .select('*')
      .order('issued_at', { ascending: false });
    if (error) throw new Error(error.message);
    return toCamelArray<Invoice>(data);
  },
  async getBySalesOrderId(salesOrderId) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('invoices')
      .select('*')
      .eq('sales_order_id', salesOrderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toCamel<Invoice>(data) : null;
  },
  async generateFromSalesOrder(salesOrderId, createdBy) {
    const sb = (await createServerSupabaseClient());
    const { data: orderRow } = await sb.from('sales_orders').select('*').eq('id', salesOrderId).single();
    if (!orderRow) throw new Error('Sales order not found.');
    if (orderRow.status !== 'dispatched') throw new Error('Only dispatched orders can be invoiced.');

    const { data: existing } = await sb.from('invoices').select('id').eq('sales_order_id', salesOrderId).maybeSingle();
    if (existing) throw new Error('This order already has an invoice.');

    const invNumber = await nextDocNumber('invoices', 'invoice_number', 'INV');
    const subtotal = Math.round(orderRow.quantity_ordered * orderRow.unit_price * 100) / 100;
    const vatAmount = Math.round(subtotal * VAT_RATE * 100) / 100;
    const total = Math.round((subtotal + vatAmount) * 100) / 100;
    const issuedAt = new Date();
    const dueAt = new Date(issuedAt.getTime() + INVOICE_PAYMENT_TERMS_DAYS * 24 * 60 * 60 * 1000);

    const { data, error } = await sb
      .from('invoices')
      .insert({
        invoice_number: invNumber,
        sales_order_id: salesOrderId,
        customer_id: orderRow.customer_id,
        subtotal,
        vat_amount: vatAmount,
        total,
        amount_paid: 0,
        credited_amount: 0,
        status: 'unpaid',
        issued_at: issuedAt.toISOString(),
        due_at: dueAt.toISOString(),
        created_by: createdBy,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toCamel<Invoice>(data);
  },
  async recordPayment(invoiceId, amount, recordedBy) {
    const sb = (await createServerSupabaseClient());
    const { data: invRow } = await sb.from('invoices').select('*').eq('id', invoiceId).single();
    if (!invRow) throw new Error('Invoice not found.');
    const invoice = toCamel<Invoice>(invRow);
    if (invoice.status === 'paid' || invoice.status === 'cancelled') {
      throw new Error(`Invoice is already ${invoice.status}.`);
    }
    if (amount <= 0) throw new Error('Payment amount must be positive.');
    const outstanding = invoiceOutstanding(invoice);
    if (amount > outstanding + 1e-9) {
      throw new Error(`Cannot pay more than the R${outstanding.toFixed(2)} outstanding on this invoice.`);
    }

    const { data: payRow, error: payErr } = await sb
      .from('invoice_payments')
      .insert({
        invoice_id: invoiceId,
        amount,
        recorded_by: recordedBy,
      })
      .select()
      .single();
    if (payErr) throw new Error(payErr.message);

    const newPaid = Math.round((invoice.amountPaid + amount) * 100) / 100;
    const newStatus = invoiceOutstanding({ ...invoice, amountPaid: newPaid }) <= 1e-9 ? 'paid' : 'partially_paid';

    const { data: updatedInv, error: updErr } = await sb
      .from('invoices')
      .update({ amount_paid: newPaid, status: newStatus })
      .eq('id', invoiceId)
      .select()
      .single();
    if (updErr) throw new Error(updErr.message);

    return { invoice: toCamel<Invoice>(updatedInv), payment: toCamel<InvoicePayment>(payRow) };
  },
  async listPayments(invoiceId) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('invoice_payments')
      .select('*')
      .eq('invoice_id', invoiceId);
    if (error) throw new Error(error.message);
    return toCamelArray<InvoicePayment>(data);
  },
  async issueCreditNote(invoiceId, amount, reason, issuedBy) {
    const sb = (await createServerSupabaseClient());
    const { data: invRow } = await sb.from('invoices').select('*').eq('id', invoiceId).single();
    if (!invRow) throw new Error('Invoice not found.');
    const invoice = toCamel<Invoice>(invRow);
    if (invoice.status === 'paid' || invoice.status === 'cancelled') {
      throw new Error(`Invoice is already ${invoice.status}.`);
    }
    if (amount <= 0) throw new Error('Credit note amount must be positive.');
    if (!reason.trim()) throw new Error('A reason is required.');
    const outstanding = invoiceOutstanding(invoice);
    if (amount > outstanding + 1e-9) {
      throw new Error(`Cannot credit more than the R${outstanding.toFixed(2)} outstanding on this invoice.`);
    }

    const cnNumber = await nextDocNumber('credit_notes', 'credit_note_number', 'CN');

    const { data: cnRow, error: cnErr } = await sb
      .from('credit_notes')
      .insert({
        credit_note_number: cnNumber,
        invoice_id: invoiceId,
        amount,
        reason: reason.trim(),
        issued_by: issuedBy,
      })
      .select()
      .single();
    if (cnErr) throw new Error(cnErr.message);

    const newCredited = Math.round((invoice.creditedAmount + amount) * 100) / 100;
    const newStatus =
      invoiceOutstanding({ ...invoice, creditedAmount: newCredited }) <= 1e-9 ? 'paid' : 'partially_paid';

    const { data: updatedInv, error: updErr } = await sb
      .from('invoices')
      .update({ credited_amount: newCredited, status: newStatus })
      .eq('id', invoiceId)
      .select()
      .single();
    if (updErr) throw new Error(updErr.message);

    return { invoice: toCamel<Invoice>(updatedInv), creditNote: toCamel<CreditNote>(cnRow) };
  },
  async listCreditNotes(invoiceId) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('credit_notes')
      .select('*')
      .eq('invoice_id', invoiceId);
    if (error) throw new Error(error.message);
    return toCamelArray<CreditNote>(data);
  },
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const sbSettingsRepository: SettingsRepository = {
  async get() {
    const { data, error } = await (await createServerSupabaseClient())
      .from('app_settings')
      .select('*')
      .eq('id', 'singleton')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { showCostsToAllRoles: true };
    return { showCostsToAllRoles: data.show_costs_to_all_roles as boolean };
  },
  async setShowCostsToAllRoles(visible: boolean) {
    // Service-role: app_settings has no INSERT policy (upsert needs one).
    const sb = getServiceSupabase();
    const { error } = await sb
      .from('app_settings')
      .upsert({ id: 'singleton', show_costs_to_all_roles: visible, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { showCostsToAllRoles: visible };
  },
};

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/**
 * Normalise a raw DB user row into the User domain type.
 * Guards against the label_permission column being absent (schema drift
 * before the 20260911 migration is applied): defaults to 'inherited' so
 * hasPermission() behaves correctly and no caller gets undefined.
 */
function toUser(row: Record<string, unknown>): User {
  const user = toCamel<User>(row);
  if (user.labelPermission == null) user.labelPermission = 'inherited';
  return user;
}

export const sbUserRepository: UserRepository = {
  async findByEmail(email) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('users')
      .select('*')
      .ilike('email', email.toLowerCase())
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toUser(data) : null;
  },
  async getById(id) {
    const { data, error } = await (await createServerSupabaseClient()).from('users').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toUser(data) : null;
  },
  async list() {
    const { data, error } = await (await createServerSupabaseClient()).from('users').select('*').order('created_at');
    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(toUser);
  },
  async create(input: CreateUserInput) {
    const email = input.email.trim().toLowerCase();
    // Service-role: user creation goes through the Auth Admin API.
    const sb = getServiceSupabase();

    // A fresh, unique one-time password — shown once to the creating admin,
    // never stored in plaintext (Supabase keeps only its hash).
    const temporaryPassword = generateTemporaryPassword();

    // public.users.id is a FK → auth.users.id (no default UUID).
    // We must create the auth user first — the DB trigger handle_new_auth_user
    // auto-inserts the public.users row using metadata we pass here, with the
    // correct role/area/name so no PATCH is needed afterwards.
    // app_metadata.must_change_password (service-role-only writable, so the
    // user cannot clear it themselves) forces a password change on first login.
    const { data: authData, error: authErr } = await sb.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      app_metadata: { must_change_password: true },
      user_metadata: {
        full_name: input.fullName,
        role_id: input.roleId,
        area: input.area ?? null,
      },
    });

    if (authErr) {
      if (authErr.message?.toLowerCase().includes('already been registered')) {
        throw new Error(`A user with the email ${email} already exists.`);
      }
      throw new Error(authErr.message ?? 'Failed to create auth user.');
    }

    const authUserId = authData.user.id;

    // Read back the public user row the trigger just created.
    const { data: pubRow, error: readErr } = await sb
      .from('users')
      .select('*')
      .eq('id', authUserId)
      .single();

    if (readErr || !pubRow) {
      // Trigger should have created the row synchronously — if it didn't,
      // clean up the auth user to avoid a ghost (auth user with no public row).
      await sb.auth.admin.deleteUser(authUserId);
      throw new Error('User created in auth but public profile was not found — check DB trigger handle_new_auth_user.');
    }

    return { user: toUser(pubRow), temporaryPassword };
  },
  async updateRole(userId, roleId) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('users')
      .update({ role_id: roleId, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw new Error('User not found.');
    return toUser(data);
  },
  async updateArea(userId, area) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('users')
      .update({ area, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw new Error('User not found.');
    return toUser(data);
  },
  async setLabelPermission(userId, value) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('users')
      .update({ label_permission: value, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    if (error) {
      // 42703 = undefined_column — label_permission migration not yet applied
      if (error.code === '42703') {
        throw new Error(
          'The label_permission column has not been added to the database yet. ' +
          'Run migration 20260911000000_label_permission_and_seed_roles.sql in the Supabase SQL Editor.'
        );
      }
      throw new Error('User not found.');
    }
    return toUser(data);
  },
  async setActive(userId, active) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('users')
      .update({ is_active: active, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw new Error('User not found.');
    return toUser(data);
  },
  async setMfaEnrolled(userId, enrolled) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('users')
      .update({ mfa_enrolled: enrolled, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw new Error('User not found.');
    return toUser(data);
  },
};

// ---------------------------------------------------------------------------
// Scan handoff
// ---------------------------------------------------------------------------

const SCAN_HANDOFF_TTL_MS = 3 * 60 * 1000;

export const sbScanHandoffRepository: ScanHandoffRepository = {
  async create(initiatingUserId) {
    const now = Date.now();
    // Service-role: cross-device token flow; scan_handoff has no user UPDATE policy.
    const { data, error } = await getServiceSupabase()
      .from('scan_handoff_sessions')
      .insert({
        initiating_user_id: initiatingUserId,
        expires_at: new Date(now + SCAN_HANDOFF_TTL_MS).toISOString(),
        status: 'pending',
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toCamel<ScanHandoffSession>(data);
  },
  async get(id) {
    const sb = getServiceSupabase();
    const { data, error } = await sb.from('scan_handoff_sessions').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;

    // Sweep expired
    if (data.status === 'pending' && new Date(data.expires_at).getTime() < Date.now()) {
      const { data: updated } = await sb
        .from('scan_handoff_sessions')
        .update({ status: 'expired' })
        .eq('id', id)
        .select()
        .single();
      return updated ? toCamel<ScanHandoffSession>(updated) : toCamel<ScanHandoffSession>({ ...data, status: 'expired' });
    }
    return toCamel<ScanHandoffSession>(data);
  },
  async resolve(id, resolvedByUserId, result) {
    const sb = getServiceSupabase();
    const { data: row } = await sb.from('scan_handoff_sessions').select('*').eq('id', id).maybeSingle();
    if (!row) throw new Error('That scanning session no longer exists.');

    if (row.status === 'pending' && new Date(row.expires_at).getTime() < Date.now()) {
      await sb.from('scan_handoff_sessions').update({ status: 'expired' }).eq('id', id);
      throw new Error('This scanning session has expired. Please generate a new QR code.');
    }
    if (row.status === 'expired') {
      throw new Error('This scanning session has expired. Please generate a new QR code.');
    }
    if (row.status === 'resolved') {
      throw new Error('This scanning session has already been used.');
    }

    const { data: updated, error } = await sb
      .from('scan_handoff_sessions')
      .update({
        status: 'resolved',
        resolved_by_user_id: resolvedByUserId,
        result,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toCamel<ScanHandoffSession>(updated);
  },
};
