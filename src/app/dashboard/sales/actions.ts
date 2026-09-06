'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import {
  auditLogRepository,
  productRepository,
  salesOrderRepository,
  stockLedgerRepository,
  warehouseRepository,
} from '@/lib/data';
import { hasPermission, requirePermission } from '@/lib/permissions';

export interface SalesOrderFormState {
  error: string | null;
  success: string | null;
}

/** Where else this product actually has stock, for the no-ledger-entry message above. */
async function stockElsewhere(productId: string, excludeWarehouseId: string): Promise<string> {
  const [warehouses, ledger] = await Promise.all([warehouseRepository.list(), stockLedgerRepository.listAll()]);
  const warehouseByCode = new Map(warehouses.map((w) => [w.id, w.code]));
  const elsewhere = ledger
    .filter((e) => e.productId === productId && e.warehouseId !== excludeWarehouseId && e.quantityOnHand > 0)
    .map((e) => ({ code: warehouseByCode.get(e.warehouseId) ?? e.warehouseId, quantityOnHand: e.quantityOnHand }))
    .sort((a, b) => b.quantityOnHand - a.quantityOnHand);

  if (elsewhere.length === 0) return 'No store currently holds any stock of it.';
  return `It does have stock at ${elsewhere.map((w) => `${w.code} (${w.quantityOnHand.toLocaleString()})`).join(', ')}.`;
}

export async function createSalesOrderAction(
  _prevState: SalesOrderFormState,
  formData: FormData
): Promise<SalesOrderFormState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };
  if (!(await hasPermission(session, 'create_requisitions'))) {
    return { error: 'Your role does not have permission to create requisitions.', success: null };
  }

  const customerId = String(formData.get('customerId') ?? '');
  const warehouseId = String(formData.get('warehouseId') ?? '');
  const productId = String(formData.get('productId') ?? '');
  const quantity = Number(formData.get('quantity'));
  const unitPrice = Number(formData.get('unitPrice'));

  if (!customerId || !warehouseId || !productId) {
    return { error: 'Requesting department, warehouse and product are required.', success: null };
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: 'Quantity must be a positive number.', success: null };
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return { error: 'Unit value must be zero or a positive number.', success: null };
  }

  /*
    A requisition raised for a product/store pair with no stock ledger entry
    will always fail later, at Approve, with a raw repository message ("No
    stock ledger entry to reserve against.") that names neither the product
    nor the store - the exact wall this used to let an operator walk into
    two steps after the point where it could have been caught. The Store
    field has no sensible default across every product (each item genuinely
    lives at different locations), so rather than guess, this checks up
    front and says which store to pick.
  */
  const [product, warehouse, existing] = await Promise.all([
    productRepository.getById(productId),
    warehouseRepository.getById(warehouseId),
    stockLedgerRepository.get(productId, warehouseId),
  ]);
  if (!product) return { error: 'That product could not be found.', success: null };
  if (!warehouse) return { error: 'That store could not be found.', success: null };
  if (!existing) {
    const elsewhere = await stockElsewhere(productId, warehouseId);
    return {
      error: `${product.sku} has no stock record at ${warehouse.code} - it can never be reserved there. ${elsewhere}`,
      success: null,
    };
  }

  try {
    const order = await salesOrderRepository.create({
      customerId,
      warehouseId,
      productId,
      quantity,
      unitPrice,
      createdBy: session.id,
    });
    revalidatePath('/dashboard/sales');
    return { error: null, success: `${order.orderNumber} created as a draft. Approve it to reserve stock.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not create the requisition.', success: null };
  }
}

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error('Session expired.');
  return session;
}

/**
 * Result shape for the row-level requisition actions.
 *
 * These used to return void and let repository errors propagate, which took
 * the whole page down with a server-error screen. The repository throws
 * messages written to be read by an operator - "Not enough available stock
 * to reserve that quantity." - so the useful thing to do with them is show
 * them, not crash. Approving more than is on hand is an ordinary thing to
 * try, not an exceptional one.
 */
export interface RequisitionActionState {
  error: string | null;
  success: string | null;
}

export async function confirmSalesOrderAction(
  orderId: string,
  _prevState: RequisitionActionState,
  _formData: FormData
): Promise<RequisitionActionState> {
  'use server';
  try {
    const session = await requireSession();
    await requirePermission(session, 'manage_sales_orders');
    const order = await salesOrderRepository.confirm(orderId);
    revalidatePath('/dashboard/sales');
    revalidatePath('/dashboard');
    return { error: null, success: `${order.orderNumber} approved - stock is now reserved.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not approve that requisition.', success: null };
  }
}

export async function dispatchSalesOrderAction(
  orderId: string,
  _prevState: RequisitionActionState,
  _formData: FormData
): Promise<RequisitionActionState> {
  'use server';
  try {
    const session = await requireSession();
    await requirePermission(session, 'manage_sales_orders');
    const order = await salesOrderRepository.dispatch(orderId, session.id);
    await auditLogRepository.write({
      tableName: 'sales_orders',
      recordId: orderId,
      action: 'update',
      changedBy: session.id,
      after: order,
    });
    revalidatePath('/dashboard/sales');
    revalidatePath('/dashboard');
    return { error: null, success: `${order.orderNumber} issued - stock has left the store.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not issue that requisition.', success: null };
  }
}

export async function cancelSalesOrderAction(
  orderId: string,
  _prevState: RequisitionActionState,
  _formData: FormData
): Promise<RequisitionActionState> {
  'use server';
  try {
    const session = await requireSession();
    await requirePermission(session, 'manage_sales_orders');
    const order = await salesOrderRepository.cancel(orderId);
    revalidatePath('/dashboard/sales');
    revalidatePath('/dashboard');
    return { error: null, success: `${order.orderNumber} cancelled - any reserved stock is released.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not cancel that requisition.', success: null };
  }
}
