'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { stockAdjustmentRepository } from '@/lib/data';

export interface AdjustmentFormState {
  error: string | null;
  success: string | null;
}

export async function requestAdjustmentAction(
  _prevState: AdjustmentFormState,
  formData: FormData
): Promise<AdjustmentFormState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };

  const warehouseId = String(formData.get('warehouseId') ?? '');
  const reasonCodeId = String(formData.get('reasonCodeId') ?? '');
  const productId = String(formData.get('productId') ?? '');
  const direction = String(formData.get('direction') ?? 'missing');
  const quantityRaw = Number(formData.get('quantity'));
  const unitCostRaw = Number(formData.get('unitCost'));

  if (!warehouseId || !reasonCodeId || !productId) {
    return { error: 'Warehouse, reason and product are required.', success: null };
  }
  if (!Number.isFinite(quantityRaw) || quantityRaw <= 0) {
    return { error: 'Quantity must be a positive number — direction is set separately.', success: null };
  }
  if (!Number.isFinite(unitCostRaw) || unitCostRaw < 0) {
    return { error: 'Unit cost must be zero or a positive number.', success: null };
  }

  try {
    const adjustment = await stockAdjustmentRepository.request({
      warehouseId,
      reasonCodeId,
      productId,
      quantityDelta: direction === 'found' ? quantityRaw : -quantityRaw,
      unitCost: unitCostRaw,
      requestedBy: session.id,
    });
    revalidatePath('/dashboard/adjustments');
    return { error: null, success: `${adjustment.adjustmentNumber} submitted for approval.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not submit the adjustment.', success: null };
  }
}

export async function decideAdjustmentAction(adjustmentId: string, decision: 'approved' | 'rejected') {
  'use server';
  const session = await getSession();
  if (!session) return;
  await stockAdjustmentRepository.decide(adjustmentId, decision, session.id);
  revalidatePath('/dashboard/adjustments');
  revalidatePath('/dashboard');
}
