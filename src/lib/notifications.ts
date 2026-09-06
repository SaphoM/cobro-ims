/**
 * Role-relevant "what needs my attention right now" items for the header
 * bell. Deliberately NOT a persisted notification feed (no `notifications`
 * table, no read/unread state, no timestamps to say "2 hours ago") - there
 * is no backend to persist or push them yet (see docs/ARCHITECTURE.md), and
 * inventing one here would be a second, competing source of truth for
 * exactly the kind of state this app already derives live from the ledger
 * everywhere else (see StockLedgerView, the Reserved-cell popover, the
 * Overview stat tiles). Instead this recomputes a small, current snapshot
 * from the same repositories every render - "how many things need action
 * right now", not "what happened".
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
  productRepository,
  purchaseOrderRepository,
  roleRepository,
  salesOrderRepository,
  stockLedgerRepository,
  warehouseRepository,
} from '@/lib/data';
import type { User } from '@/lib/domain/inventory';

export interface NotificationItem {
  id: string;
  message: string;
  href: string;
  /** 'warning' gets a red dot (something is wrong - e.g. stock below
   *  reorder point); 'default' gets the accent dot (routine, expected work
   *  waiting - an approval, a receipt to process). */
  tone: 'default' | 'warning';
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export async function getNotifications(session: User): Promise<NotificationItem[]> {
  const role = await roleRepository.getById(session.roleId);
  const roleName = role?.name;
  if (!roleName) return [];

  const items: NotificationItem[] = [];

  // Draft requisitions sourced from a real Store are Stores/Admin's to
  // approve (`manage_sales_orders`) - a peer-pickup draft sourced from an
  // Engineer's own station is that Engineer's to approve instead (see
  // requireApprovalRight in sales/actions.ts), so it's counted separately
  // below rather than here.
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
    }
  }

  return items;
}
