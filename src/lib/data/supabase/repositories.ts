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
 *     client (getServiceSupabase): the reservation adjuster (stock_ledger has
 *     no user-writable UPDATE policy by design), Auth Admin user creation,
 *     the app-settings singleton write, and the cross-device scan-handoff
 *     token flow. Each is invoked only after the Server Action layer has
 *     already authorised the caller.
 *
 * Business operations (receiving, PO lifecycle, adjustments, transfers,
 * requisitions, invoicing) call the matching Postgres function via
 * `sb.rpc(...)` rather than reimplementing WAC math, document numbering and
 * status transitions here — that logic already lives, tested, in the
 * database (see each method below for which function it calls). Pure
 * reads/list/get and CRUD with no RPC equivalent (products, suppliers,
 * customers, warehouses, categories, users, settings, notifications) stay as
 * direct `.select()`/`.insert()`/`.update()` calls under RLS.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceSupabase } from '@/lib/supabase/service';
import type {
  AdjustmentReasonCode,
  AppNotification,
  AuditLogEntry,
  CreditNote,
  Customer,
  GoodsReceipt,
  InterWarehouseTransfer,
  Invoice,
  InvoicePayment,
  Product,
  ProductBomLine,
  ProductCategory,
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
import type {
  AddBomLineInput,
  AdjustmentReasonRepository,
  AppSettings,
  AuditLogRepository,
  CategoryRepository,
  CreateCustomerInput,
  CreateProductInput,
  CreatePurchaseOrderInput,
  CreateReturnReminderInput,
  CreateSalesOrderInput,
  CreateSupplierInput,
  CreateUserInput,
  CreateWarehouseInput,
  CustomerRepository,
  InitiateTransferInput,
  InvoiceRepository,
  NotificationRepository,
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
import { generateTemporaryPassword } from '@/lib/temp-password';
// Note: VAT and invoice-outstanding math now lives inside the live
// generate_invoice_from_sales_order/record_invoice_payment/issue_credit_note
// Postgres functions, not here — see sbInvoiceRepository below.

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

/**
 * Translate a raw `products` row into the domain `Product` type, mapping the
 * live database's own packaging columns onto this app's simpler
 * `qtyPerPackage`/`defaultUnitCost` fields — see
 * supabase/migrations/20261011090000_purchase_order_supplier_nullable.sql's
 * sibling discussion: the live `products` table never had `qty_per_package`/
 * `default_unit_cost` columns, it has `items_per_package`/`unit_value`
 * (plus `package_value` and a dimensions model this app doesn't use). Rather
 * than add a second, redundant pair of packaging columns, this is the one
 * place that reconciles the two — every other file in the app only ever
 * touches the `Product` TS type, never these raw column names.
 */
function toProduct(row: Record<string, unknown>): Product {
  const product = toCamel<Product>(row);
  return {
    ...product,
    qtyPerPackage: (row.items_per_package as number | null) ?? null,
    defaultUnitCost: (row.unit_value as number | null) ?? null,
  };
}

function toProductArray(rows: Record<string, unknown>[]): Product[] {
  return rows.map(toProduct);
}

export const sbProductRepository: ProductRepository = {
  async list() {
    const { data, error } = await (await createServerSupabaseClient()).from('products').select('*').order('created_at');
    if (error) throw new Error(error.message);
    return toProductArray(data);
  },
  async getById(id) {
    const { data, error } = await (await createServerSupabaseClient()).from('products').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toProduct(data) : null;
  },
  async getBySku(sku) {
    const { data, error } = await (await createServerSupabaseClient()).from('products').select('*').ilike('sku', sku).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toProduct(data) : null;
  },
  async getByBarcode(barcode) {
    const { data, error } = await (await createServerSupabaseClient()).from('products').select('*').eq('barcode', barcode).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toProduct(data) : null;
  },
  async create(input: CreateProductInput) {
    const itemsPerPackage = (input.packagingUom && input.qtyPerPackage != null) ? input.qtyPerPackage : null;
    const unitValue = input.defaultUnitCost ?? null;
    const packageValue = itemsPerPackage != null && unitValue != null ? Math.round(itemsPerPackage * unitValue * 100) / 100 : null;
    const { data, error } = await (await createServerSupabaseClient())
      .from('products')
      .insert({
        sku: input.sku,
        name: input.name,
        unit_of_measure: input.unitOfMeasure,
        packaging_uom: input.packagingUom ?? null,
        items_per_package: itemsPerPackage,
        unit_value: unitValue,
        package_value: packageValue,
        category_id: input.categoryId ?? null,
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
    return toProduct(data);
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
    return toProduct(data);
  },
  async update(id, input) {
    const itemsPerPackage = (input.packagingUom && input.qtyPerPackage != null) ? input.qtyPerPackage : null;
    const unitValue = 'defaultUnitCost' in input ? (input.defaultUnitCost ?? null) : undefined;
    const packageValue = itemsPerPackage != null && typeof unitValue === 'number' ? Math.round(itemsPerPackage * unitValue * 100) / 100 : null;
    const { data, error } = await (await createServerSupabaseClient())
      .from('products')
      .update({
        name: input.name,
        unit_of_measure: input.unitOfMeasure,
        packaging_uom: input.packagingUom ?? null,
        items_per_package: itemsPerPackage,
        ...(unitValue !== undefined ? { unit_value: unitValue, package_value: packageValue } : {}),
        ...('categoryId' in input ? { category_id: input.categoryId ?? null } : {}),
        barcode: input.barcode ?? null,
        reorder_point: input.reorderPoint ?? null,
        reorder_quantity: input.reorderQuantity ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      if (error.code === '23505' && error.message.includes('barcode')) {
        throw new Error(`Barcode "${input.barcode}" is already assigned to another product.`);
      }
      throw new Error('That product could not be found or updated.');
    }
    return toProduct(data);
  },
  async delete(id) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('products')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) {
      // 23503 = FK violation: the product is referenced by stock, movements or documents.
      if (error.code === '23503') {
        throw new Error('This product has stock or purchase/sales history and cannot be deleted.');
      }
      throw new Error(error.message);
    }
    if (!data || data.length === 0) {
      throw new Error('Product not found, or you do not have permission to delete it.');
    }
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
    const sb = await createServerSupabaseClient();
    const { data, error } = await sb.rpc('post_stock_movement', {
      p_product_id: input.productId,
      p_warehouse_id: input.warehouseId,
      p_movement_type: input.movementType,
      p_quantity: input.quantity,
      p_unit_cost: input.unitCost,
      p_reference_type: input.referenceType ?? null,
      p_reference_id: input.referenceId ?? null,
      p_batch_ref: input.batchRef?.trim() ? input.batchRef.trim() : null,
      p_created_by: input.createdBy,
    });
    if (error) throw new Error(error.message);
    const movRow = Array.isArray(data) ? data[0] : data;
    const { data: ledgerRow, error: ledgerErr } = await sb
      .from('stock_ledger')
      .select('*')
      .eq('product_id', input.productId)
      .eq('warehouse_id', input.warehouseId)
      .single();
    if (ledgerErr) throw new Error(ledgerErr.message);
    return { movement: toCamel<StockMovement>(movRow), ledger: toCamel<StockLedgerEntry>(ledgerRow) };
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
  async update(id, input) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('suppliers')
      .update({
        name: input.name,
        contact_email: input.contactEmail ?? null,
        contact_phone: input.contactPhone ?? null,
        address: input.address ?? null,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error('That supplier could not be found or updated.');
    return toCamel<Supplier>(data);
  },
  async delete(id) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('suppliers')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) {
      if (error.code === '23503') {
        throw new Error('This supplier is referenced by existing purchase orders and cannot be deleted.');
      }
      throw new Error(error.message);
    }
    if (!data || data.length === 0) {
      throw new Error('Supplier not found, or you do not have permission to delete it.');
    }
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
  async update(id, input) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('customers')
      .update({
        name: input.name,
        contact_email: input.contactEmail ?? null,
        contact_phone: input.contactPhone ?? null,
        address: input.address ?? null,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error('That department could not be found or updated.');
    return toCamel<Customer>(data);
  },
  async delete(id) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('customers')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) {
      if (error.code === '23503') {
        throw new Error('This department is referenced by existing requisitions or invoices and cannot be deleted.');
      }
      throw new Error(error.message);
    }
    if (!data || data.length === 0) {
      throw new Error('Department not found, or you do not have permission to delete it.');
    }
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
    const sb = await createServerSupabaseClient();
    const { data, error } = await sb.rpc('quick_receive', {
      p_supplier_id: input.supplierId,
      p_warehouse_id: input.warehouseId,
      p_product_id: input.productId,
      p_quantity: input.quantity,
      p_unit_cost: input.unitCost,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;

    const [{ data: poRow, error: poErr }, { data: grnRow, error: grnErr }] = await Promise.all([
      sb.from('purchase_orders').select('*').eq('id', row.purchase_order_id).single(),
      sb.from('goods_receipts').select('*').eq('id', row.goods_receipt_id).single(),
    ]);
    if (poErr) throw new Error(poErr.message);
    if (grnErr) throw new Error(grnErr.message);

    return { purchaseOrder: toCamel<PurchaseOrder>(poRow), goodsReceipt: toCamel<GoodsReceipt>(grnRow) };
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
    const sb = await createServerSupabaseClient();
    const { data, error } = await sb.rpc('create_purchase_order', {
      p_supplier_id: input.supplierId,
      p_warehouse_id: input.warehouseId,
      p_product_id: input.productId,
      p_quantity: input.quantity,
      p_unit_cost: input.unitCost,
    });
    if (error) throw new Error(error.message);
    const poRow = Array.isArray(data) ? data[0] : data;
    return poWithLine(poRow);
  },
  async issue(poId) {
    const sb = await createServerSupabaseClient();
    const { data, error } = await sb.rpc('issue_purchase_order', { p_po_id: poId });
    if (error) throw new Error(error.message);
    const poRow = Array.isArray(data) ? data[0] : data;
    return poWithLine(poRow);
  },
  async receive(poId, quantity, _receivedBy) {
    const sb = await createServerSupabaseClient();
    const { data, error } = await sb.rpc('receive_purchase_order', {
      p_po_id: poId,
      p_quantity: quantity,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;

    const [{ data: poRow, error: poErr }, { data: grnRow, error: grnErr }] = await Promise.all([
      sb.from('purchase_orders').select('*').eq('id', row.purchase_order_id).single(),
      sb.from('goods_receipts').select('*').eq('id', row.goods_receipt_id).single(),
    ]);
    if (poErr) throw new Error(poErr.message);
    if (grnErr) throw new Error(grnErr.message);

    return {
      purchaseOrder: await poWithLine(poRow),
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
    const sb = await createServerSupabaseClient();
    const { data, error } = await sb.rpc('initiate_transfer', {
      p_from_warehouse_id: input.fromWarehouseId,
      p_to_warehouse_id: input.toWarehouseId,
      p_product_id: input.productId,
      p_quantity: input.quantity,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return toCamel<InterWarehouseTransfer>(row);
  },
  async complete(transferId, _completedBy) {
    const sb = await createServerSupabaseClient();
    const { data, error } = await sb.rpc('complete_transfer', { p_transfer_id: transferId });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return toCamel<InterWarehouseTransfer>(row);
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
    const sb = await createServerSupabaseClient();
    const { data, error } = await sb.rpc('request_adjustment', {
      p_warehouse_id: input.warehouseId,
      p_reason_code_id: input.reasonCodeId,
      p_product_id: input.productId,
      p_quantity_delta: input.quantityDelta,
      p_unit_cost: input.unitCost,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return toCamel<StockAdjustment>(row);
  },
  async decide(adjustmentId, decision, _decidedBy) {
    const sb = await createServerSupabaseClient();
    const { data, error } = await sb.rpc('decide_adjustment', {
      p_adjustment_id: adjustmentId,
      p_decision: decision,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return toCamel<StockAdjustment>(row);
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
    const sb = await createServerSupabaseClient();
    const { data, error } = await sb.rpc('create_sales_order', {
      p_customer_id: input.customerId,
      p_warehouse_id: input.warehouseId,
      p_product_id: input.productId,
      p_quantity: input.quantity,
      p_unit_price: input.unitPrice,
    });
    if (error) throw new Error(error.message);
    let row = Array.isArray(data) ? data[0] : data;

    // create_sales_order has no description parameter (Repair Item
    // requisitions need one) — set it with a follow-up update when supplied.
    if (input.description) {
      const { data: updated, error: updErr } = await sb
        .from('sales_orders')
        .update({ description: input.description })
        .eq('id', row.id)
        .select()
        .single();
      if (updErr) throw new Error(updErr.message);
      row = updated;
    }
    return toCamel<SalesOrder>(row);
  },
  async confirm(orderId) {
    const sb = await createServerSupabaseClient();
    const { data, error } = await sb.rpc('confirm_sales_order', { p_order_id: orderId });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return toCamel<SalesOrder>(row);
  },
  async dispatch(orderId, _dispatchedBy) {
    const sb = await createServerSupabaseClient();
    const { data, error } = await sb.rpc('dispatch_sales_order', { p_order_id: orderId });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return toCamel<SalesOrder>(row);
  },
  async cancel(orderId) {
    const sb = await createServerSupabaseClient();
    const { data, error } = await sb.rpc('cancel_sales_order', { p_order_id: orderId });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return toCamel<SalesOrder>(row);
  },
  async getStatus(orderId) {
    const { data } = await (await createServerSupabaseClient()).from('sales_orders').select('status').eq('id', orderId).maybeSingle();
    return (data?.status as SalesOrder['status']) ?? null;
  },
};

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const sbNotificationRepository: NotificationRepository = {
  async listForUser(userId) {
    // User-scoped client: RLS (notifications_select_own) is the real backstop
    // here, not just the .eq() filter - see the migration.
    const { data, error } = await (await createServerSupabaseClient())
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return toCamelArray<AppNotification>(data);
  },
  async markRead(id, userId) {
    const sb = await createServerSupabaseClient();
    const { data: existing } = await sb.from('notifications').select('read_at').eq('id', id).eq('user_id', userId).maybeSingle();
    if (!existing) return null;
    if (existing.read_at) return toCamel<AppNotification>(existing); // already read - idempotent, don't overwrite read_at
    const { data, error } = await sb
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toCamel<AppNotification>(data);
  },
  async createReturnReminderIfMissing(input: CreateReturnReminderInput) {
    // Service-role client: the caller whose page load triggers the reminder
    // sweep (src/lib/services/reminder-generation.ts) is very often not
    // input.userId, so this can't run as the requesting user's own session -
    // see the migration's comment on why there's no self-authored insert
    // policy for this table.
    const sb = getServiceSupabase();
    const { data: existing } = await sb
      .from('notifications')
      .select('id')
      .eq('type', 'return_reminder')
      .eq('user_id', input.userId)
      .eq('sales_order_id', input.salesOrderId)
      .maybeSingle();
    if (existing) return null;
    const { data, error } = await sb
      .from('notifications')
      .insert({
        user_id: input.userId,
        type: 'return_reminder',
        sales_order_id: input.salesOrderId,
        title: input.title,
        message: input.message,
        href: input.href,
      })
      .select()
      .single();
    if (error) {
      // Unique-violation race (two concurrent sweeps) - another insert won,
      // which is exactly the outcome we want, so treat it as "already exists".
      if (error.code === '23505') return null;
      throw new Error(error.message);
    }
    return toCamel<AppNotification>(data);
  },
};

// ---------------------------------------------------------------------------
// Invoices (dormant per §1.1 — still implemented against the real tables)
// ---------------------------------------------------------------------------

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
  async generateFromSalesOrder(salesOrderId, _createdBy) {
    const sb = await createServerSupabaseClient();
    const { data, error } = await sb.rpc('generate_invoice_from_sales_order', {
      p_sales_order_id: salesOrderId,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return toCamel<Invoice>(row);
  },
  async recordPayment(invoiceId, amount, _recordedBy) {
    const sb = await createServerSupabaseClient();
    const { data, error } = await sb.rpc('record_invoice_payment', {
      p_invoice_id: invoiceId,
      p_amount: amount,
    });
    if (error) throw new Error(error.message);
    const invRow = Array.isArray(data) ? data[0] : data;

    const { data: payRow, error: payErr } = await sb
      .from('invoice_payments')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('paid_at', { ascending: false })
      .limit(1)
      .single();
    if (payErr) throw new Error(payErr.message);

    return { invoice: toCamel<Invoice>(invRow), payment: toCamel<InvoicePayment>(payRow) };
  },
  async listPayments(invoiceId) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('invoice_payments')
      .select('*')
      .eq('invoice_id', invoiceId);
    if (error) throw new Error(error.message);
    return toCamelArray<InvoicePayment>(data);
  },
  async issueCreditNote(invoiceId, amount, reason, _issuedBy) {
    const sb = await createServerSupabaseClient();
    const { data, error } = await sb.rpc('issue_credit_note', {
      p_invoice_id: invoiceId,
      p_amount: amount,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    const cnRow = Array.isArray(data) ? data[0] : data;

    const { data: invRow, error: invErr } = await sb
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();
    if (invErr) throw new Error(invErr.message);

    return { invoice: toCamel<Invoice>(invRow), creditNote: toCamel<CreditNote>(cnRow) };
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

// ---------------------------------------------------------------------------
// Product Categories
// ---------------------------------------------------------------------------

export const sbCategoryRepository: CategoryRepository = {
  async list() {
    const { data, error } = await (await createServerSupabaseClient())
      .from('product_categories')
      .select('*')
      .order('name');
    if (error) throw new Error(error.message);
    return toCamelArray<ProductCategory>(data);
  },
  async getById(id) {
    const { data, error } = await (await createServerSupabaseClient())
      .from('product_categories')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toCamel<ProductCategory>(data) : null;
  },
};
