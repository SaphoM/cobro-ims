'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { auditLogRepository, transferRepository } from '@/lib/data';
import { hasPermission, requirePermission } from '@/lib/permissions';

export interface TransferFormState {
  error: string | null;
  success: string | null;
}

export async function initiateTransferAction(
  _prevState: TransferFormState,
  formData: FormData
): Promise<TransferFormState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };
  if (!(await hasPermission(session, 'manage_transfers'))) {
    return { error: 'Your role does not have permission to initiate transfers.', success: null };
  }

  const fromWarehouseId = String(formData.get('fromWarehouseId') ?? '');
  const toWarehouseId = String(formData.get('toWarehouseId') ?? '');
  const productId = String(formData.get('productId') ?? '');
  const quantity = Number(formData.get('quantity'));

  if (!fromWarehouseId || !toWarehouseId || !productId) {
    return { error: 'Source, destination and product are required.', success: null };
  }
  if (fromWarehouseId === toWarehouseId) {
    return { error: 'Source and destination warehouse must be different.', success: null };
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: 'Quantity must be a positive number.', success: null };
  }

  try {
    const transfer = await transferRepository.initiate({
      fromWarehouseId,
      toWarehouseId,
      productId,
      quantity,
      initiatedBy: session.id,
    });
    await auditLogRepository.write({
      tableName: 'inter_warehouse_transfers',
      recordId: transfer.id,
      action: 'insert',
      changedBy: session.id,
      after: transfer,
    });
    revalidatePath('/dashboard/transfers');
    revalidatePath('/dashboard');
    return { error: null, success: `${transfer.transferNumber} is in transit. Complete it once it arrives.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not initiate the transfer.', success: null };
  }
}

export async function completeTransferAction(transferId: string) {
  'use server';
  const session = await getSession();
  if (!session) throw new Error('Session expired.');
  await requirePermission(session, 'manage_transfers');
  const transfer = await transferRepository.complete(transferId, session.id);
  await auditLogRepository.write({
    tableName: 'inter_warehouse_transfers',
    recordId: transferId,
    action: 'update',
    changedBy: session.id,
    after: transfer,
  });
  revalidatePath('/dashboard/transfers');
  revalidatePath('/dashboard');
}
