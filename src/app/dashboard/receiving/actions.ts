'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { receivingRepository } from '@/lib/data';

export interface ReceiveFormState {
  error: string | null;
  success: string | null;
}

export async function receiveStockAction(
  _prevState: ReceiveFormState,
  formData: FormData
): Promise<ReceiveFormState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };

  const supplierId = String(formData.get('supplierId') ?? '');
  const warehouseId = String(formData.get('warehouseId') ?? '');
  const productId = String(formData.get('productId') ?? '');
  const quantity = Number(formData.get('quantity'));
  const unitCost = Number(formData.get('unitCost'));

  if (!supplierId || !warehouseId || !productId) {
    return { error: 'Supplier, warehouse and product are required.', success: null };
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: 'Quantity received must be a positive number.', success: null };
  }
  if (!Number.isFinite(unitCost) || unitCost < 0) {
    return { error: 'Unit cost must be zero or a positive number.', success: null };
  }

  try {
    const { goodsReceipt } = await receivingRepository.quickReceive({
      supplierId,
      warehouseId,
      productId,
      quantity,
      unitCost,
      receivedBy: session.id,
    });
    revalidatePath('/dashboard/receiving');
    revalidatePath('/dashboard');
    return { error: null, success: `Posted ${goodsReceipt.grnNumber}. Stock ledger updated.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not post the receipt.', success: null };
  }
}
