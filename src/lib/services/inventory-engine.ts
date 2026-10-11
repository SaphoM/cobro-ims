/**
 * The inventory engine — the one place stock-quantity and cost math happens.
 * Every workflow that touches stock (GRN receiving, dispatch, inter-warehouse
 * transfer, adjustment/write-off) must go through `applyMovement`, never
 * mutate a stock_ledger row directly. That's what makes the ledger snapshot
 * a true derivation of the append-only stock_movements log, and what makes
 * the audit trail meaningful.
 *
 * Costing method: Weighted-Average-Cost (WAC), per the RFQ Scope of Work
 * (not a Claude Code assumption — it's an explicit RFQ requirement).
 *
 * Pure functions only in this file — no I/O, no repository calls — so the
 * costing math can be unit-tested in isolation from persistence.
 */

import type { Product, StockLedgerEntry, StockMovementType } from '@/lib/domain/inventory';

export interface MovementInput {
  productId: string;
  warehouseId: string;
  movementType: StockMovementType;
  quantity: number; // signed: positive = stock in, negative = stock out
  unitCost: number; // cost of THIS movement (e.g. GRN line cost, or transfer's carried WAC)
}

const INBOUND_TYPES: StockMovementType[] = ['receipt', 'transfer_in'];

export function isInboundMovement(type: StockMovementType): boolean {
  return INBOUND_TYPES.includes(type);
}

/**
 * Applies one signed stock movement to a ledger snapshot and returns the
 * new snapshot. Does not persist anything — callers (repositories) own that.
 *
 * WAC rule:
 *  - Inbound movement (receipt, transfer_in, or a positive adjustment):
 *      new_wac = ((old_qty * old_wac) + (movement_qty * movement_unit_cost)) / new_qty
 *  - Outbound movement (dispatch, transfer_out, write_off, or a negative
 *    adjustment): quantity decreases; WAC is unchanged — the cost of what
 *    left is valued at the ledger's current WAC, not the movement's own
 *    unitCost field (which for outbound movements typically just mirrors
 *    the current WAC for reporting/COGS purposes).
 */
export function applyMovement(
  current: StockLedgerEntry | null,
  movement: MovementInput
): StockLedgerEntry {
  const base: StockLedgerEntry = current ?? {
    productId: movement.productId,
    warehouseId: movement.warehouseId,
    quantityOnHand: 0,
    quantityReserved: 0,
    weightedAverageCost: 0,
    updatedAt: new Date().toISOString(),
  };

  const isInbound = movement.quantity > 0;
  const newQuantity = base.quantityOnHand + movement.quantity;

  if (newQuantity < -1e-9) {
    throw new Error(
      `Movement would drive ${movement.productId} at ${movement.warehouseId} negative ` +
        `(on hand ${base.quantityOnHand}, movement ${movement.quantity}). Blocked.`
    );
  }

  let newWac = base.weightedAverageCost;
  if (isInbound) {
    newWac =
      newQuantity > 0
        ? (base.quantityOnHand * base.weightedAverageCost + movement.quantity * movement.unitCost) /
          newQuantity
        : 0;
  } else if (newQuantity === 0) {
    // Fully depleted — reset WAC so the next inbound movement starts clean
    // rather than carrying a stale average forward.
    newWac = 0;
  }

  return {
    ...base,
    quantityOnHand: round3(newQuantity),
    weightedAverageCost: round4(newWac),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * The single source of truth for what a unit of stock costs when posting a
 * movement or valuing stock on hand — the Product Catalogue's price is
 * authoritative everywhere else in the app, never a value typed into a
 * receiving/PO/adjustment/scan form.
 *
 * Resolution order: catalogue price (`unitPrice`, the Price column on the
 * Product Catalogue) → catalogue default unit cost (the per-base-unit cost
 * captured at product setup, mainly for packaged products) → this location's
 * existing weighted-average cost (so stock already on the ledger doesn't
 * revalue to zero the moment a price is missing). Returns null only when
 * none of the three exist — there is truly no cost to post or value at.
 */
export function resolveCatalogueUnitCost(
  product: Pick<Product, 'unitPrice' | 'defaultUnitCost'> | null | undefined,
  existingLedgerEntry: Pick<StockLedgerEntry, 'weightedAverageCost'> | null | undefined
): number | null {
  if (product?.unitPrice != null && product.unitPrice > 0) return product.unitPrice;
  if (product?.defaultUnitCost != null && product.defaultUnitCost > 0) return product.defaultUnitCost;
  if (existingLedgerEntry && existingLedgerEntry.weightedAverageCost > 0) return existingLedgerEntry.weightedAverageCost;
  return null;
}

/**
 * Stock on hand valued at the Product Catalogue's current price, not the
 * ledger's own (historical) weighted-average cost — so a price change in the
 * catalogue is reflected immediately, without waiting for a new receipt.
 * Falls back to the ledger's WAC only when the product has no catalogue
 * price at all, so already-stocked, never-priced items don't revalue to
 * zero.
 */
export function stockValue(entry: StockLedgerEntry, product?: Pick<Product, 'unitPrice' | 'defaultUnitCost'>): number {
  const unitCost = resolveCatalogueUnitCost(product, entry) ?? 0;
  return round2(entry.quantityOnHand * unitCost);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}
function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
