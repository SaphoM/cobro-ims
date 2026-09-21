/**
 * Role-relevant "what needs my attention right now" items for the header
 * bell, plus the user's persisted notification history.
 *
 * Two different kinds of thing live in the bell, deliberately not unified
 * into one system:
 *
 *  - `items` (NotificationItem[]): live GAUGES, recomputed from the same
 *    repositories every render (no persistence, no read state, no
 *    timestamp) - "how many things need action right now" (low stock count,
 *    requisitions awaiting approval, POs awaiting receiving). These aren't
 *    discrete events a person "reads" - they're the same kind of number as
 *    the Overview's stat tiles, just surfaced in the bell too.
 *  - `persisted` (AppNotification[]): real, individually addressable EVENTS
 *    - today just the Stores return reminder (src/lib/reminders.ts) - each
 *    with its own created_at, read_at and requisition reference, fetched
 *    from the `notifications` table (see supabase/migrations/
 *    20260918120000_notifications.sql) via notificationRepository. These
 *    are what "notification history" means: they survive being viewed.
 *
 * Content is scoped to what each role actually DOES in the confirmed Cobro
 * workflow, not to everything a permission technically allows. The clearest
 * case: Admin holds `manage_receiving` via `'*'`, but receiving is Stores'
 * physical job (Admin purchases; Stores receives, reserves and issues - see
 * permissions.ts) - so "purchase orders awaiting receiving" is a Stores
 * notification, not an Admin one, even though Admin could technically open
 * that page.
 */

import {
  notificationRepository,
  productRepository,
  purchaseOrderRepository,
  roleRepository,
  salesOrderRepository,
  stockLedgerRepository,
  userRepository,
  warehouseRepository,
} from '@/lib/data';
import { countStoresReturnReminders, STOCK_RETURN_REMINDER_HOURS } from '@/lib/reminders';
import { ensureStoresReturnReminders } from '@/lib/services/reminder-generation';
import { getNowMs } from '@/lib/now';
import type { AppNotification, StockLedgerEntry, User } from '@/lib/domain/inventory';

export interface NotificationItem {
  id: string;
  message: string;
  href: string;
  /** 'warning' gets a red dot (something is wrong - e.g. stock below
   *  reorder point); 'default' gets the accent dot (routine, expected work
   *  waiting - an approval, a receipt to process). */
  tone: 'default' | 'warning';
}

export interface Notifications {
  items: NotificationItem[];
  persisted: AppNotification[];
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export async function getNotifications(session: User): Promise<Notifications> {
  const role = await roleRepository.getById(session.roleId);
  const roleName = role?.name;
  if (!roleName) return { items: [], persisted: [] };

  const items: NotificationItem[] = [];

  // On-access sweep: creates any newly-eligible "Return item to Stores"
  // reminders (idempotent - see reminder-generation.ts). This app has no
  // cron/scheduled runtime, so an ordinary dashboard page load - which
  // always calls getNotifications() - stands in for one.
  const [, persisted] = await Promise.all([
    ensureStoresReturnReminders(),
    notificationRepository.listForUser(session.id),
  ]);

  // Draft requisitions sourced from a real Store are Stores/Admin's to
  // approve (`manage_sales_orders`) - a peer-pickup draft sourced from an
  // Engineer's own station is that Engineer's to approve instead (see
  // requireApprovalRight in sales/actions.ts), so it's counted separately
  // below rather than here.
  // How many requisitions across EVERY Engineer are currently
  // reminder-eligible - see src/lib/reminders.ts. `ledger`/`products` are
  // passed in rather than fetched here since the two callers below already
  // have them for their own low-stock/valuation checks.
  async function countStoresReturnReminderItems(ledger: StockLedgerEntry[]): Promise<number> {
    const [orders, warehouses] = await Promise.all([salesOrderRepository.list(), warehouseRepository.list()]);
    const stationIds = warehouses.filter((w) => w.type === 'engineer_station').map((w) => w.id);
    return countStoresReturnReminders(orders, ledger, warehouses, getNowMs(), stationIds);
  }

  async function countStoreSourcedApprovals(): Promise<number> {
    const [orders, warehouses] = await Promise.all([salesOrderRepository.list(), warehouseRepository.list()]);
    const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
    return orders.filter((o) => o.status === 'draft' && warehouseById.get(o.warehouseId)?.type !== 'engineer_station')
      .length;
  }

  if (roleName === 'admin') {
    // Low stock is Admin's purchasing trigger - the reason to raise a PO.
    const [ledger, products] = await Promise.all([stockLedgerRepository.listAll(), productRepository.list()]);
    const productById = new Map(products.map((p) => [p.id, p]));
    const lowStockCount = ledger.filter((entry) => {
      const product = productById.get(entry.productId);
      return product?.reorderPoint != null && entry.quantityOnHand < product.reorderPoint;
    }).length;
    if (lowStockCount > 0) {
      items.push({
        id: 'low-stock',
        message: `${plural(lowStockCount, 'item')} below reorder point`,
        href: '/dashboard',
        tone: 'warning',
      });
    }

    // Admin retains `manage_sales_orders` (approve/issue/cancel) - it's only
    // `create_requisitions` that's excluded - so store-sourced approvals are
    // still a real Admin action item.
    const pendingApprovals = await countStoreSourcedApprovals();
    if (pendingApprovals > 0) {
      items.push({
        id: 'pending-approvals',
        message: `${plural(pendingApprovals, 'requisition')} awaiting approval`,
        href: '/dashboard/sales',
        tone: 'default',
      });
    }

    const heldStockCount = await countStoresReturnReminderItems(ledger);
    if (heldStockCount > 0) {
      items.push({
        id: 'held-stock-reminders',
        message: `${plural(heldStockCount, 'requisition')} outstanding past ${STOCK_RETURN_REMINDER_HOURS} hours`,
        href: '/dashboard',
        tone: 'default',
      });
    }
  }

  if (roleName === 'stores_manager' || roleName === 'stores_clerk') {
    const pendingApprovals = await countStoreSourcedApprovals();
    if (pendingApprovals > 0) {
      items.push({
        id: 'pending-approvals',
        message: `${plural(pendingApprovals, 'requisition')} awaiting approval`,
        href: '/dashboard/sales',
        tone: 'default',
      });
    }

    const purchaseOrders = await purchaseOrderRepository.list();
    const awaitingReceiving = purchaseOrders.filter(
      (po) => po.status === 'issued' || po.status === 'partially_received'
    ).length;
    if (awaitingReceiving > 0) {
      items.push({
        id: 'awaiting-receiving',
        message: `${plural(awaitingReceiving, 'purchase order')} awaiting receiving`,
        href: '/dashboard/receiving',
        tone: 'default',
      });
    }

    // "Stores retains oversight" (§21 of the 8 September review) - Stores
    // is who initiates a return (see docs/ARCHITECTURE.md and
    // /dashboard/transfers), so they're who needs to know what's overdue
    // for one, not just each Engineer individually.
    const ledger = await stockLedgerRepository.listAll();
    const heldStockCount = await countStoresReturnReminderItems(ledger);
    if (heldStockCount > 0) {
      items.push({
        id: 'held-stock-reminders',
        message: `${plural(heldStockCount, 'requisition')} outstanding past ${STOCK_RETURN_REMINDER_HOURS} hours - use or return`,
        href: '/dashboard',
        tone: 'default',
      });
    }
  }

  if (roleName === 'engineer_requester') {
    const [orders, warehouses] = await Promise.all([salesOrderRepository.list(), warehouseRepository.list()]);
    const myStation = warehouses.find((w) => w.ownerUserId === session.id);

    const readyToCollect = orders.filter((o) => o.createdBy === session.id && o.status === 'confirmed').length;
    if (readyToCollect > 0) {
      items.push({
        id: 'ready-to-collect',
        message: `${plural(readyToCollect, 'requisition')} approved - ready to collect`,
        href: '/dashboard/sales',
        tone: 'default',
      });
    }

    if (myStation) {
      const awaitingMyApproval = orders.filter(
        (o) => o.status === 'draft' && o.warehouseId === myStation.id
      ).length;
      if (awaitingMyApproval > 0) {
        items.push({
          id: 'my-station-approvals',
          message: `${plural(awaitingMyApproval, 'pickup request')} from your station awaiting your approval`,
          href: '/dashboard/sales',
          tone: 'default',
        });
      }

      // §21's actual ask: prompt THIS Engineer to use or have unused stock
      // returned once it's sat on their own shelf a while - now a real,
      // individually addressable notification per requisition (`persisted`,
      // fetched above), not a rolled-up count - so it's not repeated here.
    }
  }

  // Supervisor and Team Leaders: "monitor outstanding Engineer-held stock"
  // (8 September review §5-§7). Same lightweight held-stock rollup Stores
  // and Admin get above, scoped the same way their pages are - a Team
  // Leader to their own `area`'s stations, a Supervisor to every station.
  // View-only: it links to the Overview where they can see the detail, it
  // does not imply any action they can take themselves.
  if (roleName === 'supervisor' || roleName === 'mechanical_team_leader' || roleName === 'electrical_team_leader') {
    const [orders, ledger, warehouses, users] = await Promise.all([
      salesOrderRepository.list(),
      stockLedgerRepository.listAll(),
      warehouseRepository.list(),
      userRepository.list(),
    ]);
    const areaByOwnerId = new Map(users.map((u) => [u.id, u.area]));
    const stationIds = warehouses
      .filter(
        (w) =>
          w.type === 'engineer_station' &&
          (roleName === 'supervisor' || areaByOwnerId.get(w.ownerUserId ?? '') === session.area)
      )
      .map((w) => w.id);
    const heldCount = countStoresReturnReminders(orders, ledger, warehouses, getNowMs(), stationIds);
    if (heldCount > 0) {
      items.push({
        id: 'held-stock-oversight',
        message:
          roleName === 'supervisor'
            ? `${plural(heldCount, 'requisition')} outstanding past ${STOCK_RETURN_REMINDER_HOURS} hours`
            : `${plural(heldCount, 'requisition')} outstanding past ${STOCK_RETURN_REMINDER_HOURS} hours in your team`,
        href: '/dashboard',
        tone: 'default',
      });
    }
  }

  return { items, persisted };
}
