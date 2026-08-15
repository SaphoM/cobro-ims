'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { salesOrderRepository } from '@/lib/data';

export interface SalesOrderFormState {
  error: string | null;
  success: string | null;
}

export async function createSalesOrderAction(
  _prevState: SalesOrderFormState,
  formData: FormData
): Promise<SalesOrderFormState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };

  const customerId = String(formData.get('customerId') ?? '');
  const warehouseId = String(formData.get('warehouseId') ?? '');
  const productId = String(formData.get('productId') ?? '');
  const quantity = Number(formData.get('quantity'));
  const unitPrice = Number(formData.get('unitPrice'));

  if (!customerId || !warehouseId || !productId) {
    return { error: 'Customer, warehouse and product are required.', success: null };
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: 'Quantity must be a positive number.', success: null };
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return { error: 'Unit price must be zero or a positive number.', success: null };
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
    return { error: null, success: `${order.orderNumber} created as a draft. Confirm it to reserve stock.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not create the order.', success: null };
  }
}

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error('Session expired.');
  return session;
}

export async function confirmSalesOrderAction(orderId: string) {
  'use server';
  await requireSession();
  await salesOrderRepository.confirm(orderId);
  revalidatePath('/dashboard/sales');
  revalidatePath('/dashboard');
}

export async function dispatchSalesOrderAction(orderId: string) {
  'use server';
  const session = await requireSession();
  await salesOrderRepository.dispatch(orderId, session.id);
  revalidatePath('/dashboard/sales');
  revalidatePath('/dashboard');
}

export async function cancelSalesOrderAction(orderId: string) {
  'use server';
  await requireSession();
  await salesOrderRepository.cancel(orderId);
  revalidatePath('/dashboard/sales');
  revalidatePath('/dashboard');
}
