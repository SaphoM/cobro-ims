'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import {
  auditLogRepository,
  productRepository,
  receivingRepository,
  stockLedgerRepository,
} from '@/lib/data';
import { hasPermission } from '@/lib/permissions';
import { canSeeCosts } from '@/lib/costs';
import { resolveCatalogueUnitCost } from '@/lib/services/inventory-engine';

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
  if (!(await hasPermission(session, 'manage_receiving'))) {
    return { error: 'Your role does not have permission to receive stock.', success: null };
  }

  const supplierId = String(formData.get('supplierId') ?? '') || null;
  const warehouseId = String(formData.get('warehouseId') ?? '');
  const productId = String(formData.get('productId') ?? '');
  const quantity = Number(formData.get('quantity'));

  if (!warehouseId || !productId) {
    return { error: 'Warehouse and product are required.', success: null };
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: 'Quantity received must be a positive number.', success: null };
  }

  /*
    Unit cost is never taken from the form, for any role: the Product
    Catalogue's Price column is the only place a product's cost can be
    changed (see pricing-actions.ts's setProductPriceAction), so every
    receipt - Admin's included - is costed from the catalogue, never from
    whatever this request happened to submit. Resolution order: catalogue
    price → default unit cost (packaged items) → this location's existing
    WAC, and refused outright if none of the three exist. Never zero: a
    receipt posted at zero silently drags the location's weighted-average
    cost down and corrupts the valuation.
  */
  const costsVisible = await canSeeCosts(session);
  const [product, existing] = await Promise.all([
    productRepository.getById(productId),
    stockLedgerRepository.get(productId, warehouseId),
  ]);
  const unitCost = resolveCatalogueUnitCost(product, existing);
  if (unitCost === null) {
    return {
      error: costsVisible
        ? 'This item has no catalogue price, no default unit cost, and no existing stock at this store. Ask an administrator to set the price or default unit cost first.'
        : 'This is the first stock of this item at this store, so it needs a catalogue price — and prices are hidden for your role. Ask an administrator to set the price first.',
      success: null,
    };
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
    await auditLogRepository.write({
      tableName: 'goods_receipts',
      recordId: goodsReceipt.id,
      action: 'insert',
      changedBy: session.id,
      after: goodsReceipt,
    });
    revalidatePath('/dashboard/receiving');
    revalidatePath('/dashboard');
    return { error: null, success: `Posted ${goodsReceipt.grnNumber}. Stock ledger updated.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not post the receipt.', success: null };
  }
}
