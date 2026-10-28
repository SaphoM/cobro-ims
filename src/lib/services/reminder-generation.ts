/**
 * Generates persisted "Return item to Stores" notifications for every
 * currently-eligible requisition (see src/lib/reminders.ts).
 *
 * There is no cron/scheduled-job runtime in this app (see
 * docs/ARCHITECTURE.md), so this runs on-access instead: called once from
 * getNotifications() (src/lib/notifications.ts), which every dashboard page
 * load already invokes for the header bell. That makes an ordinary page
 * view this app's closest equivalent to a periodic sweep - it may run many
 * times after the 8-hour threshold is crossed for a given requisition, so
 * `createReturnReminderIfMissing` (backed by a unique index on (user_id,
 * sales_order_id) where type = 'return_reminder') is what keeps this
 * idempotent rather than the caller having to track what it already ran.
 */

import { notificationRepository, productRepository, salesOrderRepository, stockLedgerRepository, warehouseRepository } from '@/lib/data';
import { getStoresReturnReminderCandidates } from '@/lib/reminders';
import { getNowMs } from '@/lib/now';

export async function ensureStoresReturnReminders(): Promise<void> {
  const [orders, ledger, warehouses, products] = await Promise.all([
    salesOrderRepository.list(),
    stockLedgerRepository.listAll(),
    warehouseRepository.list(),
    productRepository.list(),
  ]);

  const candidates = getStoresReturnReminderCandidates(orders, ledger, warehouses, getNowMs());
  if (candidates.length === 0) return;

  const orderById = new Map(orders.map((o) => [o.id, o]));
  const productById = new Map(products.map((p) => [p.id, p]));

  await Promise.all(
    candidates.map((candidate) => {
      const order = orderById.get(candidate.salesOrderId);
      const product = productById.get(candidate.productId);
      if (!order || !product) return Promise.resolve();

      // Whole hours only - a fractional "8.4 hours" reads like a bug, not a
      // measurement, and nobody needs minute-level precision on an 8-hour
      // reminder.
      const hours = Math.floor(candidate.hoursOutstanding);
      const reasonSuffix = order.description ? ` Reason given at request: "${order.description}".` : '';
      return notificationRepository.createReturnReminderIfMissing({
        userId: candidate.requesterId,
        salesOrderId: candidate.salesOrderId,
        title: `Return ${product.name} to Stores`,
        message:
          `${candidate.quantityOnHand.toLocaleString('en-ZA')} ${product.unitOfMeasure} of ${product.name} (${product.sku}) ` +
          `from requisition ${order.orderNumber} has been sitting at your station for ${hours} hour${hours === 1 ? '' : 's'} ` +
          `without being used. Please return it to Stores if it is no longer needed.${reasonSuffix}`,
        href: '/dashboard/sales',
      });
    })
  );
}
