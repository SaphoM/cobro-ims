'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession, signOut } from '@/lib/auth';
import { formatCurrency } from '@/lib/ui/currency';
import {
  auditLogRepository,
  productRepository,
  stockLedgerRepository,
  stockMovementRepository,
  transferRepository,
  warehouseRepository,
} from '@/lib/data';
import { checkPermission, hasPermission, type Permission } from '@/lib/permissions';
import { canSeeCosts } from '@/lib/costs';
import { resolveCatalogueUnitCost } from '@/lib/services/inventory-engine';
import type { StockMovementType } from '@/lib/domain/inventory';

export interface RecordMovementFormState {
  error: string | null;
  success: string | null;
}

const OUTBOUND_TYPES: StockMovementType[] = ['dispatch', 'transfer_out', 'write_off', 'usage'];

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
 * a warehouse clerk can scan stock in and out via the Scan button on this
 * form (`manage_receiving`/`manage_sales_orders`, the same two permissions
 * the standalone scan station used before it was removed), but write-offs
 * and adjustments still require `approve_adjustments`, which is MFA-gated
 * in permissions.ts. Those two are the WAC-affecting types that post with
 * no second approver, and they stay locked down.
 */
const PERMISSION_BY_TYPE: Record<StockMovementType, Permission> = {
  receipt: 'manage_receiving',
  transfer_in: 'manage_receiving',
  dispatch: 'manage_sales_orders',
  transfer_out: 'manage_transfers',
  adjustment: 'approve_adjustments',
  write_off: 'approve_adjustments',
  // Not actually selectable from this generic form (see MOVEMENT_LABELS in
  // record-movement-form.tsx) - 'usage' is only ever posted by an Engineer's
  // own "Use" scan on the Overview scan station, which checks station
  // ownership directly rather than a role permission. This entry exists
  // only so PERMISSION_BY_TYPE stays exhaustively typed; `approve_adjustments`
  // is a deliberately unreachable-in-practice fallback, never meant to be hit.
  usage: 'approve_adjustments',
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

  /*
    Unit cost is never taken from the form, for any role: the Product
    Catalogue's Price column is the only place a product's cost can be
    changed (see pricing-actions.ts's setProductPriceAction), so every
    movement - Admin's included - is costed from the catalogue, never from
    whatever this request happened to submit. Resolution order: catalogue
    price → default unit cost → this location's existing WAC.

    Inbound movements (receipt/transfer_in) are refused outright when none of
    the three exist - guessing zero would silently drag the location's
    weighted-average cost down and corrupt the valuation. Outbound movements
    (dispatch/transfer_out/write_off/usage) never need a NEW price - they
    just record what's already leaving at its current carried cost - so they
    fall back to 0 only in the (practically unreachable) case of an outbound
    movement with no existing stock, which the engine blocks anyway.
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
  } else if (OUTBOUND_TYPES.includes(movementType)) {
    unitCost = existing?.weightedAverageCost ?? 0;
  } else {
    return {
      error: costsVisible
        ? 'This item has no catalogue price and no stock at this store yet, so there is no cost to record it at. Ask an administrator to set the price first.'
        : 'This is the first stock of this item at this store, so it needs a catalogue price - and prices are hidden for your role. Ask an administrator to set the price first.',
      success: null,
    };
  }

  const signedQuantity = OUTBOUND_TYPES.includes(movementType) ? -quantityRaw : quantityRaw;

  try {
    const { movement, ledger } = await stockMovementRepository.record({
      productId,
      warehouseId,
      movementType,
      quantity: signedQuantity,
      unitCost,
      referenceType: 'manual_entry',
      batchRef: batchRef || null,
      createdBy: session.id,
    });

    // Every other mutating path in the app (adjustments, requisitions, the
    // old scan station) writes its own audit entry - `stockMovementRepository
    // .record` itself doesn't do this for any caller, by design, so it was
    // missing here specifically. Scan-in/out from this form is a real stock
    // movement like any other and needs the same who/what/when trail.
    await auditLogRepository.write({
      tableName: 'stock_movements',
      recordId: movement.id,
      action: 'insert',
      changedBy: session.id,
      after: movement,
    });

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/audit-log');
    return {
      error: null,
      success: costsVisible
        ? `Posted. New on-hand: ${ledger.quantityOnHand} @ WAC ${formatCurrency(ledger.weightedAverageCost)}.`
        : `Posted. New on-hand: ${ledger.quantityOnHand}.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not record movement.', success: null };
  }
}

export interface RequestReturnFormState {
  error: string | null;
  success: string | null;
}

/**
 * "Return to Stores" - an Engineer putting unused stock at THEIR OWN
 * station in transit back to Stores. Reuses the existing inter-warehouse
 * transfer model exactly as-is (no new ledger, no new status - see
 * `InterWarehouseTransfer` / transferRepository): this posts the same
 * `transfer_out` a Stores-initiated transfer would, the stock leaves the
 * station's on-hand immediately, and it sits `in_transit` — not available
 * to anyone — until Stores completes it from the existing /dashboard/transfers
 * page. This action does not, and cannot, complete a transfer itself;
 * completing one still requires `manage_transfers`, which this role does not
 * hold. See `request_stock_return` in permissions.ts for the full reasoning.
 */
export async function requestReturnToStoresAction(
  _prevState: RequestReturnFormState,
  formData: FormData
): Promise<RequestReturnFormState> {
  const session = await getSession();
  if (!session) {
    return { error: 'Your session has expired. Please sign in again.', success: null };
  }
  if (!(await hasPermission(session, 'request_stock_return'))) {
    return { error: 'Your role does not have permission to return stock to Stores.', success: null };
  }

  const productId = String(formData.get('productId') ?? '');
  const quantityRaw = Number(formData.get('quantity'));
  if (!productId) {
    return { error: 'Product is required.', success: null };
  }
  if (!Number.isFinite(quantityRaw) || quantityRaw <= 0) {
    return { error: 'Quantity must be a positive number.', success: null };
  }

  // The source is always the CALLER'S OWN station - never a warehouseId
  // taken from the client. This is what keeps `request_stock_return` safe
  // to grant broadly to Engineers: the permission says "you may return your
  // own stock", and this is what actually enforces "your own", not someone
  // else's station or an arbitrary warehouse.
  const myStation = await warehouseRepository.getByOwner(session.id);
  if (!myStation) {
    return { error: "You don't have a station to return stock from.", success: null };
  }

  const [warehouses, ledgerEntry, product] = await Promise.all([
    warehouseRepository.list(),
    stockLedgerRepository.get(productId, myStation.id),
    productRepository.getById(productId),
  ]);
  // Exactly one `type: 'store'` warehouse exists in this deployment - the
  // same assumption src/app/dashboard/receiving/receive-form.tsx makes
  // ("Store isn't gated here: it's either the one real store...").
  const store = warehouses.find((w) => w.type === 'store');
  if (!store) {
    return { error: 'No store is configured to receive returned stock.', success: null };
  }

  // Reserved stock at this station is already committed to a pending
  // peer-pickup requisition sourced from it (see dashboard/page.tsx) -
  // returning it out from under that pickup would silently break it, so
  // only the UNRESERVED portion is returnable. `transferRepository.initiate`
  // itself only checks raw on-hand, so this narrower guard lives here.
  const returnable = Math.max((ledgerEntry?.quantityOnHand ?? 0) - (ledgerEntry?.quantityReserved ?? 0), 0);
  if (quantityRaw > returnable + 1e-9) {
    return {
      error: `Only ${returnable.toLocaleString('en-ZA')} ${product?.unitOfMeasure ?? 'unit(s)'} at your station ${
        returnable === 1 ? 'is' : 'are'
      } unreserved and returnable.`,
      success: null,
    };
  }

  try {
    const transfer = await transferRepository.initiate({
      fromWarehouseId: myStation.id,
      toWarehouseId: store.id,
      productId,
      quantity: quantityRaw,
      initiatedBy: session.id,
    });
    await auditLogRepository.write({
      tableName: 'inter_warehouse_transfers',
      recordId: transfer.id,
      action: 'insert',
      changedBy: session.id,
      after: transfer,
    });
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/transfers');
    revalidatePath('/dashboard/audit-log');
    return {
      error: null,
      success: `${transfer.transferNumber} sent to Stores - it's in transit until Stores completes the return.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not request the return.', success: null };
  }
}

export async function signOutAction() {
  'use server';
  await signOut();
  redirect('/login');
}
