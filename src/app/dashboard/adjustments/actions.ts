'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { auditLogRepository, productRepository, stockAdjustmentRepository, stockLedgerRepository } from '@/lib/data';
import { hasPermission, requirePermission } from '@/lib/permissions';
import { canSeeCosts } from '@/lib/costs';
import { resolveCatalogueUnitCost } from '@/lib/services/inventory-engine';

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
  if (!(await hasPermission(session, 'request_adjustments'))) {
    return { error: 'Your role does not have permission to request stock adjustments.', success: null };
  }

  const warehouseId = String(formData.get('warehouseId') ?? '');
  const reasonCodeId = String(formData.get('reasonCodeId') ?? '');
  const productId = String(formData.get('productId') ?? '');
  const direction = String(formData.get('direction') ?? 'missing');
  const quantityRaw = Number(formData.get('quantity'));

  if (!warehouseId || !reasonCodeId || !productId) {
    return { error: 'Store, reason and product are required.', success: null };
  }
  if (!Number.isFinite(quantityRaw) || quantityRaw <= 0) {
    return { error: 'Quantity must be a positive number - direction is set separately.', success: null };
  }

  /*
    Unit cost is never taken from the form, for any role: the Product
    Catalogue's Price column is the only place a product's cost can be
    changed (see pricing-actions.ts's setProductPriceAction). Resolution
    order: catalogue price → default unit cost → this location's existing
    WAC. A "missing" (write-off) adjustment doesn't need a NEW price - the
    engine values outbound movements at the ledger's current WAC regardless -
    so it falls back to 0 only when there's truly nothing to resolve (the
    approval step will refuse it for having no stock to remove anyway). A
    "found" adjustment is WAC-affecting (inbound), so it's refused outright
    when none of the three exist - guessing zero would corrupt the valuation.
  */
  const costsVisible = await canSeeCosts(session);
  const [product, existing] = await Promise.all([
    productRepository.getById(productId),
    stockLedgerRepository.get(productId, warehouseId),
  ]);
  const resolvedUnitCost = resolveCatalogueUnitCost(product, existing);
  let unitCost: number;
  if (resolvedUnitCost !== null) {
    unitCost = resolvedUnitCost;
  } else if (direction !== 'found') {
    unitCost = existing?.weightedAverageCost ?? 0;
  } else {
    return {
      error: costsVisible
        ? 'This item has no catalogue price, no default unit cost, and no existing stock at this store. Ask an administrator to set the price or default unit cost first.'
        : 'This item has no catalogue price set yet, and prices are hidden for your role. Ask an administrator to set the price first.',
      success: null,
    };
  }

  try {
    const adjustment = await stockAdjustmentRepository.request({
      warehouseId,
      reasonCodeId,
      productId,
      quantityDelta: direction === 'found' ? quantityRaw : -quantityRaw,
      unitCost,
      requestedBy: session.id,
    });
    await auditLogRepository.write({
      tableName: 'stock_adjustments',
      recordId: adjustment.id,
      action: 'insert',
      changedBy: session.id,
      after: adjustment,
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
  if (!session) throw new Error('Session expired.');
  // Deliberately the most locked-down permission in the matrix — admin only
  // in the current placeholder policy — since approving posts a real
  // WAC-affecting stock movement while rejecting doesn't.
  await requirePermission(session, 'approve_adjustments');

  const adjustment = await stockAdjustmentRepository.decide(adjustmentId, decision, session.id);
  await auditLogRepository.write({
    tableName: 'stock_adjustments',
    recordId: adjustmentId,
    action: 'update',
    changedBy: session.id,
    after: adjustment,
  });
  revalidatePath('/dashboard/adjustments');
  revalidatePath('/dashboard');
}
