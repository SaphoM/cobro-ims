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

  const supplierId = String(formData.get('supplierId') ?? '');
  const warehouseId = String(formData.get('warehouseId') ?? '');
  const productId = String(formData.get('productId') ?? '');
  const quantity = Number(formData.get('quantity'));
  const unitCostRaw = Number(formData.get('unitCost'));

  if (!supplierId || !warehouseId || !productId) {
    return { error: 'Supplier, warehouse and product are required.', success: null };
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: 'Quantity received must be a positive number.', success: null };
  }
  if (!Number.isFinite(unitCostRaw) || unitCostRaw < 0) {
    return { error: 'Unit cost must be zero or a positive number.', success: null };
  }

  /*
    Same rule as recordMovementAction: what stock cost is a pricing decision
    (`manage_pricing`, Admin only), so a non-Admin's submitted unit cost is
    discarded here rather than merely made read-only in the form. Their
    receipt is costed from the product's catalogue price - exactly the figure
    the read-only display shows them - falling back to what the stock is
    already carried at here, and refused outright if there is neither. Never
    zero: a receipt posted at zero silently drags the location's
    weighted-average cost down and corrupts the valuation.
  */
  const costsVisible = await canSeeCosts(session);
  const canEditPrice = await hasPermission(session, 'manage_pricing');
  let unitCost = unitCostRaw;
  if (!canEditPrice) {
    const [product, existing] = await Promise.all([
      productRepository.getById(productId),
      stockLedgerRepository.get(productId, warehouseId),
    ]);
    if (product?.unitPrice != null && product.unitPrice > 0) {
      unitCost = product.unitPrice;
    } else if (existing && existing.weightedAverageCost > 0) {
      unitCost = existing.weightedAverageCost;
    } else {
      return {
        error: costsVisible
          ? 'This item has no catalogue price and no stock at this store yet, so there is no cost to receive it at. Ask an administrator to set the price first.'
          : 'This is the first stock of this item at this store, so it needs a unit cost - and prices are hidden for your role. Ask an administrator to post this receipt, or to make prices visible.',
        success: null,
      };
    }
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
