'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { auditLogRepository, purchaseOrderRepository } from '@/lib/data';
import { hasPermission, requirePermission } from '@/lib/permissions';

export interface PurchaseOrderFormState {
  error: string | null;
  success: string | null;
}

export async function createPurchaseOrderAction(
  _prevState: PurchaseOrderFormState,
  formData: FormData
): Promise<PurchaseOrderFormState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };
  if (!(await hasPermission(session, 'manage_purchase_orders'))) {
    return { error: 'Your role does not have permission to create purchase orders.', success: null };
  }

  const supplierId = String(formData.get('supplierId') ?? '');
  const warehouseId = String(formData.get('warehouseId') ?? '');
  const productId = String(formData.get('productId') ?? '');
  const quantity = Number(formData.get('quantity'));
  const unitCost = Number(formData.get('unitCost'));

  if (!supplierId || !warehouseId || !productId) {
    return { error: 'Supplier, warehouse and product are required.', success: null };
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: 'Quantity must be a positive number.', success: null };
  }
  if (!Number.isFinite(unitCost) || unitCost < 0) {
    return { error: 'Unit cost must be zero or a positive number.', success: null };
  }

  try {
    const po = await purchaseOrderRepository.create({
      supplierId,
      warehouseId,
      productId,
      quantity,
      unitCost,
      createdBy: session.id,
    });
    revalidatePath('/dashboard/purchase-orders');
    return { error: null, success: `${po.poNumber} saved as a draft. Issue it to send to the supplier.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not create the purchase order.', success: null };
  }
}

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error('Session expired.');
  return session;
}

export async function issuePurchaseOrderAction(poId: string) {
  'use server';
  const session = await requireSession();
  await requirePermission(session, 'manage_purchase_orders');
  const po = await purchaseOrderRepository.issue(poId);
  await auditLogRepository.write({
    tableName: 'purchase_orders',
    recordId: poId,
    action: 'update',
    changedBy: session.id,
    after: po,
  });
  revalidatePath('/dashboard/purchase-orders');
}

export interface ReceiveLineFormState {
  error: string | null;
  success: string | null;
}

export async function receivePurchaseOrderAction(
  _prevState: ReceiveLineFormState,
  formData: FormData
): Promise<ReceiveLineFormState> {
  const session = await requireSession().catch(() => null);
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };
  // Receiving against a PO shares the same permission as ad-hoc quick-receive
  // (procurement or a warehouse clerk both plausibly do this on the floor).
  if (!(await hasPermission(session, 'manage_purchase_orders')) && !(await hasPermission(session, 'manage_receiving'))) {
    return { error: 'Your role does not have permission to receive against purchase orders.', success: null };
  }

  const poId = String(formData.get('poId') ?? '');
  const quantity = Number(formData.get('quantity'));
  if (!poId) return { error: 'Missing purchase order.', success: null };
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: 'Quantity received must be a positive number.', success: null };
  }

  try {
    const { purchaseOrder } = await purchaseOrderRepository.receive(poId, quantity, session.id);
    await auditLogRepository.write({
      tableName: 'purchase_orders',
      recordId: poId,
      action: 'update',
      changedBy: session.id,
      after: purchaseOrder,
    });
    revalidatePath('/dashboard/purchase-orders');
    revalidatePath('/dashboard');
    return {
      error: null,
      success: `Received ${quantity} on ${purchaseOrder.poNumber} — now ${purchaseOrder.status.replace('_', ' ')}.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not post the receipt.', success: null };
  }
}
