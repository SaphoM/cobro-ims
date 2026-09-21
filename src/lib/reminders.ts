/**
 * Stores return reminder — "stock issued to an Engineer that's sat unused
 * past a threshold should prompt a return" (8 September client review §21).
 *
 * Originally approximated as "ledger row untouched for 1 day" (any
 * checkout/use/transfer reset the clock). Revised: the threshold is now 8
 * hours, measured from the specific requisition's own request timestamp
 * (SalesOrder.createdAt) rather than the ledger row's last-touched time -
 * "when was this item requested", not "when did the ledger last change".
 * This also lets the reminder reference the exact requisition that caused
 * it (see AppNotification.salesOrderId), which a ledger-row-keyed reminder
 * never could - two requisitions for the same product/station are
 * indistinguishable at the ledger level.
 *
 * Eligibility still ultimately depends on the ledger: once the (product,
 * station) pair's quantityOnHand reaches 0, every dispatched requisition
 * for that pair stops being a candidate. This is a real limitation of the
 * flat (no per-batch/lot) schema: two outstanding requisitions for the same
 * product at the same station can't be told apart by the ledger, so a
 * *partial* use/return (quantity still > 0 afterward) can't tell which
 * specific requisition it applied to - both remain candidates until the
 * pair is fully cleared. Acceptable given the schema has never supported
 * batch-level tracking; each requisition still gets its own notification
 * row and its own read state either way.
 */

import type { SalesOrder, StockLedgerEntry, Warehouse } from '@/lib/domain/inventory';

export const STOCK_RETURN_REMINDER_HOURS = 8;

export interface StoresReturnReminderCandidate {
  salesOrderId: string;
  productId: string;
  /** The requisition's creator, who owns the station the item is sitting at - the reminder's recipient. */
  requesterId: string;
  /** SalesOrder.createdAt - the request timestamp the 8-hour window is measured from. */
  requestedAt: string;
  hoursOutstanding: number;
  /** Still sitting at the requester's station right now - what the notification tells them to return. */
  quantityOnHand: number;
}

/**
 * Every dispatched requisition, across every Engineer, that's been
 * outstanding 8+ hours and still has stock on hand at the requester's own
 * station - pure function over already-fetched data (same convention every
 * report builder in src/lib/services/reports.ts follows).
 */
export function getStoresReturnReminderCandidates(
  orders: SalesOrder[],
  ledger: StockLedgerEntry[],
  warehouses: Warehouse[],
  nowMs: number
): StoresReturnReminderCandidate[] {
  const stationByOwnerId = new Map(
    warehouses.filter((w) => w.type === 'engineer_station' && w.ownerUserId).map((w) => [w.ownerUserId as string, w])
  );
  const ledgerByKey = new Map(ledger.map((e) => [`${e.productId}::${e.warehouseId}`, e]));

  return orders
    .filter((o) => o.status === 'dispatched')
    .map((o): StoresReturnReminderCandidate | null => {
      // Only requisitions dispatched to the requester's OWN station hold
      // stock they personally need to return/use - a plain Store-to-Store
      // or Store-to-department dispatch has nothing for that person to hold.
      const station = stationByOwnerId.get(o.createdBy);
      if (!station) return null;

      const entry = ledgerByKey.get(`${o.productId}::${station.id}`);
      if (!entry || entry.quantityOnHand <= 0) return null; // already used or returned

      const requestedAtMs = new Date(o.createdAt).getTime();
      const hoursOutstanding = (nowMs - requestedAtMs) / (60 * 60 * 1000);
      if (hoursOutstanding < STOCK_RETURN_REMINDER_HOURS) return null;

      return {
        salesOrderId: o.id,
        productId: o.productId,
        requesterId: o.createdBy,
        requestedAt: o.createdAt,
        hoursOutstanding,
        quantityOnHand: entry.quantityOnHand,
      };
    })
    .filter((c): c is StoresReturnReminderCandidate => c !== null)
    .sort((a, b) => b.hoursOutstanding - a.hoursOutstanding);
}

/** Stores/Admin/Supervisor oversight rollup - how many requisitions across relevant stations are currently reminder-eligible, scoped by caller to whichever station set they oversee. */
export function countStoresReturnReminders(
  orders: SalesOrder[],
  ledger: StockLedgerEntry[],
  warehouses: Warehouse[],
  nowMs: number,
  stationWarehouseIds?: string[]
): number {
  const candidates = getStoresReturnReminderCandidates(orders, ledger, warehouses, nowMs);
  if (!stationWarehouseIds) return candidates.length;
  const stationIdByOwnerId = new Map(
    warehouses.filter((w) => w.type === 'engineer_station' && w.ownerUserId).map((w) => [w.ownerUserId as string, w.id])
  );
  const stationIds = new Set(stationWarehouseIds);
  return candidates.filter((c) => {
    const stationId = stationIdByOwnerId.get(c.requesterId);
    return stationId != null && stationIds.has(stationId);
  }).length;
}
