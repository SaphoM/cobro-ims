'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { auditLogRepository, productRepository } from '@/lib/data';
import { hasPermission, requirePermission } from '@/lib/permissions';

export interface AddBomLineFormState {
  error: string | null;
  success: string | null;
}

export async function addBomLineAction(
  _prevState: AddBomLineFormState,
  formData: FormData
): Promise<AddBomLineFormState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };
  // BOM structure is part of the product catalogue, same permission as adding a product.
  if (!(await hasPermission(session, 'manage_catalogue'))) {
    return { error: 'Your role does not have permission to manage the product catalogue.', success: null };
  }

  const parentProductId = String(formData.get('parentProductId') ?? '');
  const componentProductId = String(formData.get('componentProductId') ?? '');
  const quantity = Number(formData.get('quantity'));

  if (!parentProductId || !componentProductId) {
    return { error: 'Parent and component products are both required.', success: null };
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: 'Quantity must be a positive number.', success: null };
  }

  try {
    const line = await productRepository.addBomLine({ parentProductId, componentProductId, quantity });
    await auditLogRepository.write({
      tableName: 'product_bom',
      recordId: line.id,
      action: 'insert',
      changedBy: session.id,
      after: line,
    });
    revalidatePath('/dashboard/bom');
    return { error: null, success: 'Component added to the BOM.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not add the component.', success: null };
  }
}

export async function removeBomLineAction(lineId: string) {
  'use server';
  const session = await getSession();
  if (!session) throw new Error('Session expired.');
  await requirePermission(session, 'manage_catalogue');
  await productRepository.removeBomLine(lineId);
  await auditLogRepository.write({
    tableName: 'product_bom',
    recordId: lineId,
    action: 'delete',
    changedBy: session.id,
  });
  revalidatePath('/dashboard/bom');
}
