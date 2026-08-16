'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession, destroySession } from '@/lib/auth';
import { stockMovementRepository } from '@/lib/data';
import { hasPermission } from '@/lib/permissions';
import type { StockMovementType } from '@/lib/domain/inventory';

export interface RecordMovementFormState {
  error: string | null;
  success: string | null;
}

const OUTBOUND_TYPES: StockMovementType[] = ['dispatch', 'transfer_out', 'write_off'];

export async function recordMovementAction(
  _prevState: RecordMovementFormState,
  formData: FormData
): Promise<RecordMovementFormState> {
  // Every mutating Server Function re-checks the session itself — never
  // trust that a form was only reachable from an authenticated page.
  const session = await getSession();
  if (!session) {
    return { error: 'Your session has expired. Please sign in again.', success: null };
  }
  // This generic form can post ANY movement type directly — including
  // write-offs and adjustments with no approval gate, unlike the dedicated
  // /dashboard/adjustments flow. Gating it behind the same permission as
  // approving adjustments (the most sensitive capability it overlaps with)
  // closes what would otherwise be an RBAC bypass for lower-privileged
  // roles. It stays admin-only rather than being removed, since it's still
  // useful for quickly proving the engine end-to-end.
  if (!(await hasPermission(session, 'approve_adjustments'))) {
    return {
      error: 'Your role does not have permission to post movements directly. Use the dedicated workflow pages instead.',
      success: null,
    };
  }

  const productId = String(formData.get('productId') ?? '');
  const warehouseId = String(formData.get('warehouseId') ?? '');
  const movementType = String(formData.get('movementType') ?? '') as StockMovementType;
  const quantityRaw = Number(formData.get('quantity'));
  const unitCostRaw = Number(formData.get('unitCost'));

  if (!productId || !warehouseId || !movementType) {
    return { error: 'Product, warehouse and movement type are required.', success: null };
  }
  if (!Number.isFinite(quantityRaw) || quantityRaw <= 0) {
    return { error: 'Quantity must be a positive number — direction is set by the movement type.', success: null };
  }
  if (!Number.isFinite(unitCostRaw) || unitCostRaw < 0) {
    return { error: 'Unit cost must be zero or a positive number.', success: null };
  }

  const signedQuantity = OUTBOUND_TYPES.includes(movementType) ? -quantityRaw : quantityRaw;

  try {
    const { ledger } = await stockMovementRepository.record({
      productId,
      warehouseId,
      movementType,
      quantity: signedQuantity,
      unitCost: unitCostRaw,
      referenceType: 'manual_entry',
      createdBy: session.id,
    });

    revalidatePath('/dashboard');
    return {
      error: null,
      success: `Posted. New on-hand: ${ledger.quantityOnHand} @ WAC R${ledger.weightedAverageCost.toFixed(2)}.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not record movement.', success: null };
  }
}

export async function signOutAction() {
  'use server';
  await destroySession();
  redirect('/login');
}
