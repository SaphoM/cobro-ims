'use server';

/**
 * Pricing: setting a product's price, and controlling whether roles other
 * than Admin can see money at all.
 *
 * Both are gated on `manage_pricing`, which only Admin holds. They are
 * separated from the catalogue's own actions because they answer to a
 * different authority: creating a product is a stores task, deciding what it
 * is worth (and who gets to know) is not.
 */

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { auditLogRepository, productRepository, settingsRepository } from '@/lib/data';
import { checkPermission } from '@/lib/permissions';

export interface PricingFormState {
  error: string | null;
  success: string | null;
}

/** Revalidates every surface that renders money, so a change lands everywhere at once. */
function revalidateCostSurfaces() {
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/products');
  revalidatePath('/dashboard/reports');
  revalidatePath('/dashboard/security');
}

export async function setProductPriceAction(
  _prevState: PricingFormState,
  formData: FormData
): Promise<PricingFormState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };

  const check = await checkPermission(session, 'manage_pricing');
  if (!check.allowed) {
    return { error: check.reason ?? 'Only an administrator can change prices.', success: null };
  }

  const productId = String(formData.get('productId') ?? '');
  const raw = String(formData.get('unitPrice') ?? '').trim();
  if (!productId) return { error: 'Pick a product first.', success: null };

  // An empty box clears the price rather than meaning zero - "not priced
  // yet" and "free" are different states and the model keeps them apart.
  const unitPrice = raw === '' ? null : Number(raw);
  if (unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
    return { error: 'Price must be zero or a positive number.', success: null };
  }

  try {
    const before = await productRepository.getById(productId);
    const product = await productRepository.setUnitPrice(productId, unitPrice);
    await auditLogRepository.write({
      tableName: 'products',
      recordId: product.id,
      action: 'update',
      changedBy: session.id,
      before: before ? { unitPrice: before.unitPrice } : null,
      after: { unitPrice: product.unitPrice },
    });
    revalidateCostSurfaces();
    return {
      error: null,
      success:
        unitPrice === null
          ? `Cleared the price on ${product.sku}.`
          : `${product.sku} price set to R ${unitPrice.toFixed(2)}.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not update the price.', success: null };
  }
}

export async function setCostVisibilityAction(showToAll: boolean): Promise<PricingFormState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };

  const check = await checkPermission(session, 'manage_pricing');
  if (!check.allowed) {
    return { error: check.reason ?? 'Only an administrator can change this.', success: null };
  }

  const settings = await settingsRepository.setShowCostsToAllRoles(showToAll);
  await auditLogRepository.write({
    tableName: 'app_settings',
    recordId: 'showCostsToAllRoles',
    action: 'update',
    changedBy: session.id,
    after: { showCostsToAllRoles: settings.showCostsToAllRoles },
  });
  revalidateCostSurfaces();

  return {
    error: null,
    success: settings.showCostsToAllRoles
      ? 'Prices and costs are now visible to every role.'
      : 'Prices and costs are now hidden from everyone except administrators.',
  };
}
