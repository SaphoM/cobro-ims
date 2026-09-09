/**
 * Reminder FOUNDATION only — 8 September client review §21: "reminders
 * encouraging Engineers to use or return stock", explicitly not a full
 * workflow yet (no confirmed frequency, no confirmed escalation, no
 * confirmed Team Leader involvement — see docs/ARCHITECTURE.md §5 for the
 * open item). Deliberately lightweight, not a new notification platform:
 * this recomputes live from the SAME stock ledger every other stat on this
 * app already reads (StockLedgerView, the Overview's Station view, the
 * Reserved-cell popover) — no new table, no persisted "reminder" record,
 * no read/unread state. Surfaced through the existing notification bell
 * (src/lib/notifications.ts), not a new UI surface.
 *
 * "Stock issued to Engineer -> remains held -> reminder becomes eligible"
 * (§21) is approximated here as: stock currently on hand at that Engineer's
 * station, last touched (StockLedgerEntry.updatedAt) more than
 * `STOCK_HELD_REMINDER_DAYS` ago. There is no per-batch/lot tracking in this
 * schema, so "last touched" is the ledger row's own timestamp - the most
 * recent movement of ANY kind (checkout in, a partial use, a peer transfer)
 * resets the clock, which is the right behaviour: stock someone is actively
 * working through shouldn't nag them, only stock that has sat untouched.
 */

import type { Product, StockLedgerEntry } from '@/lib/domain/inventory';

/**
 * Placeholder, not settled policy - the 8 September meeting requested
 * reminders but did not confirm a frequency. A single named constant here
 * (rather than a number buried inside the filter logic below) is the
 * "configurable in future" the meeting asked for without building a
 * settings screen this app has no other precedent for (see src/lib/areas.ts
 * for the same reasoning applied to the factory-area list). Promote to a
 * repository-backed, Admin-editable setting once Cobro confirms the real
 * number - src/lib/costs.ts's single show-costs toggle is the shape to
 * follow when that happens.
 */
export const STOCK_HELD_REMINDER_DAYS = 14;

export interface HeldStockReminder {
  productId: string;
  productSku: string;
  productName: string;
  quantityOnHand: number;
  daysHeld: number;
}

/**
 * Stock sitting at one Engineer's station longer than the reminder window -
 * pure function over already-fetched data (same convention every report
 * builder in src/lib/services/reports.ts follows), so callers control what
 * "now" and what data set means rather than this reaching into repositories
 * itself.
 */
export function getHeldStockReminders(
  stationWarehouseId: string,
  ledger: StockLedgerEntry[],
  products: Product[],
  nowMs: number
): HeldStockReminder[] {
  const productById = new Map(products.map((p) => [p.id, p]));

  return ledger
    .filter((entry) => entry.warehouseId === stationWarehouseId && entry.quantityOnHand > 0)
    .map((entry) => {
      const product = productById.get(entry.productId);
      const daysHeld = Math.floor((nowMs - new Date(entry.updatedAt).getTime()) / (24 * 60 * 60 * 1000));
      return product && daysHeld >= STOCK_HELD_REMINDER_DAYS
        ? { productId: entry.productId, productSku: product.sku, productName: product.name, quantityOnHand: entry.quantityOnHand, daysHeld }
        : null;
    })
    .filter((r): r is HeldStockReminder => r !== null)
    .sort((a, b) => b.daysHeld - a.daysHeld);
}

/**
 * Stores-facing oversight rollup: how many (product, station) pairs across
 * EVERY Engineer are currently reminder-eligible - "Stores retains
 * oversight" (§21), without Stores needing to open each Engineer's station
 * individually to find out. Same threshold, same pure-function shape.
 */
export function countHeldStockReminders(
  stationWarehouseIds: string[],
  ledger: StockLedgerEntry[],
  products: Product[],
  nowMs: number
): number {
  return stationWarehouseIds.reduce(
    (sum, id) => sum + getHeldStockReminders(id, ledger, products, nowMs).length,
    0
  );
}
