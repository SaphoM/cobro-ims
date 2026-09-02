'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession, destroySession } from '@/lib/auth';
import { stockLedgerRepository, stockMovementRepository } from '@/lib/data';
import { checkPermission, type Permission } from '@/lib/permissions';
import { canSeeCosts } from '@/lib/costs';
import type { StockMovementType } from '@/lib/domain/inventory';

export interface RecordMovementFormState {
  error: string | null;
  success: string | null;
}

const OUTBOUND_TYPES: StockMovementType[] = ['dispatch', 'transfer_out', 'write_off'];

/**
 * The permission each movement type actually requires, rather than one
 * blanket check for all of them.
 *
 * This used to demand `approve_adjustments` (admin + 2FA) for every type,
 * because a single form that can post ANY type has to be gated at the level
 * of the most dangerous one it can reach. That was the right call when this
 * was a generic six-type form, but it also meant the Overview's primary
 * action - scan an item in - dead-ended behind a two-factor prompt for a
 * plain receipt, which is exactly the routine, low-risk operation the store
 * does all day.
 *
 * Gating per type keeps the hole closed while unblocking the common case:
 * a warehouse clerk can scan stock in and out (the same two permissions the
 * scan station on /dashboard/scan uses, so the two paths agree), but
 * write-offs and adjustments still require `approve_adjustments`, which is
 * MFA-gated in permissions.ts. Those two are the WAC-affecting types that
 * post with no second approver, and they stay locked down.
 */
const PERMISSION_BY_TYPE: Record<StockMovementType, Permission> = {
  receipt: 'manage_receiving',
  transfer_in: 'manage_receiving',
  dispatch: 'manage_sales_orders',
  transfer_out: 'manage_transfers',
  adjustment: 'approve_adjustments',
  write_off: 'approve_adjustments',
};

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
  const productId = String(formData.get('productId') ?? '');
  const warehouseId = String(formData.get('warehouseId') ?? '');
  const movementType = String(formData.get('movementType') ?? '') as StockMovementType;
  const quantityRaw = Number(formData.get('quantity'));
  const unitCostRaw = Number(formData.get('unitCost'));
  const batchRef = String(formData.get('batchRef') ?? '').trim();

  if (!productId || !warehouseId || !movementType) {
    return { error: 'Product, store and movement type are required.', success: null };
  }

  // Permission is checked against the type actually being posted, so the
  // movement type has to be read and validated first. An unrecognised type
  // is rejected outright rather than falling through to a default - a
  // missing entry here must never mean "no permission required".
  const requiredPermission = PERMISSION_BY_TYPE[movementType];
  if (!requiredPermission) {
    return { error: `"${movementType}" is not a movement type this app can post.`, success: null };
  }
  const permissionCheck = await checkPermission(session, requiredPermission);
  if (!permissionCheck.allowed) {
    return { error: permissionCheck.reason, success: null };
  }
  if (!Number.isFinite(quantityRaw) || quantityRaw <= 0) {
    return { error: 'Quantity must be a positive number - direction is set by the movement type.', success: null };
  }
  if (!Number.isFinite(unitCostRaw) || unitCostRaw < 0) {
    return { error: 'Unit cost must be zero or a positive number.', success: null };
  }

  /*
    When the caller may not see costs, the unit cost field is withheld from
    them entirely - so whatever arrived in the form is not a figure they
    chose and must not be trusted. Taking it at face value posts receipts at
    zero, which silently drags the location's weighted-average cost down and
    corrupts stock valuation.

    Instead the movement inherits the location's existing WAC, which is the
    correct value for stock arriving at a price this user isn't permitted to
    set. If there is no existing stock there is no WAC to inherit, and
    guessing zero would be exactly the corruption above - so that case is
    refused and pointed at someone who can set the price.
  */
  const costsVisible = await canSeeCosts(session);
  let unitCost = unitCostRaw;
  if (!costsVisible) {
    const existing = await stockLedgerRepository.get(productId, warehouseId);
    if (existing && existing.weightedAverageCost > 0) {
      unitCost = existing.weightedAverageCost;
    } else if (!OUTBOUND_TYPES.includes(movementType)) {
      return {
        error:
          'This is the first stock of this item at this store, so it needs a unit cost - and prices are hidden for your role. Ask an administrator to record this receipt, or to make prices visible.',
        success: null,
      };
    } else {
      unitCost = existing?.weightedAverageCost ?? 0;
    }
  }

  const signedQuantity = OUTBOUND_TYPES.includes(movementType) ? -quantityRaw : quantityRaw;

  try {
    const { ledger } = await stockMovementRepository.record({
      productId,
      warehouseId,
      movementType,
      quantity: signedQuantity,
      unitCost,
      referenceType: 'manual_entry',
      batchRef: batchRef || null,
      createdBy: session.id,
    });

    revalidatePath('/dashboard');
    return {
      error: null,
      success: costsVisible
        ? `Posted. New on-hand: ${ledger.quantityOnHand} @ WAC R${ledger.weightedAverageCost.toFixed(2)}.`
        : `Posted. New on-hand: ${ledger.quantityOnHand}.`,
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
