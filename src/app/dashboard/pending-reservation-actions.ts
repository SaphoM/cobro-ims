'use server';

/**
 * Backs ReserveButton.tsx - the Overview's "scan to reserve" shortcut for a
 * store row that has at least one pending (draft, not-yet-approved)
 * requisition against it. This is a read (who's waiting, for how much) -
 * the actual reservation still goes through the existing
 * `confirmSalesOrderAction` (src/app/dashboard/sales/actions.ts), the same
 * one write path /dashboard/sales's own Approve button uses. Nothing new is
 * introduced there; this only surfaces the same action one click closer to
 * the shelf, with a scan as the "am I looking at the right item" check
 * before it fires.
 */

import { getSession } from '@/lib/auth';
import {
  customerRepository,
  productRepository,
  salesOrderRepository,
  userRepository,
  warehouseRepository,
} from '@/lib/data';
import { requirePermission } from '@/lib/permissions';

export interface PendingRequisition {
  orderId: string;
  orderNumber: string;
  departmentName: string;
  quantity: number;
  requestedByName: string;
  createdAt: string;
}

export interface PendingReservationsResult {
  ok: boolean;
  message: string | null;
  productSku: string;
  productName: string;
  /** What a scan must resolve to (via parseScanPayload) before this row's
   *  requisitions can be reserved - null for a product with no barcode set,
   *  in which case scanning can never confirm it (see ReserveButton). */
  productBarcode: string | null;
  unitOfMeasure: string;
  warehouseLabel: string;
  requisitions: PendingRequisition[];
}

function empty(message: string): PendingReservationsResult {
  return {
    ok: false,
    message,
    productSku: '',
    productName: '',
    productBarcode: null,
    unitOfMeasure: '',
    warehouseLabel: '',
    requisitions: [],
  };
}

export async function getPendingReservationsAction(
  productId: string,
  warehouseId: string
): Promise<PendingReservationsResult> {
  const session = await getSession();
  if (!session) return empty('Your session has expired. Please sign in again.');
  try {
    // Same right confirmSalesOrderAction itself re-checks before actually
    // reserving - only someone who could approve gets to see who's waiting.
    await requirePermission(session, 'manage_sales_orders');
  } catch {
    return empty('Your role does not have permission to reserve stock.');
  }

  const [product, warehouse, orders, customers, users] = await Promise.all([
    productRepository.getById(productId),
    warehouseRepository.getById(warehouseId),
    salesOrderRepository.list(),
    customerRepository.list(),
    userRepository.list(),
  ]);
  if (!product) return empty('That product could not be found.');
  if (!warehouse) return empty('That warehouse could not be found.');

  const customerById = new Map(customers.map((c) => [c.id, c]));
  const userById = new Map(users.map((u) => [u.id, u]));

  const requisitions: PendingRequisition[] = orders
    .filter((o) => o.productId === productId && o.warehouseId === warehouseId && o.status === 'draft')
    .map((o) => ({
      orderId: o.id,
      orderNumber: o.orderNumber,
      departmentName: customerById.get(o.customerId)?.name ?? 'Unknown department',
      quantity: o.quantityOrdered,
      requestedByName: userById.get(o.createdBy)?.fullName ?? 'Unknown user',
      createdAt: o.createdAt,
    }))
    // Oldest first - whoever asked first should be the one Stores reaches
    // for first, all else equal.
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    ok: true,
    message: null,
    productSku: product.sku,
    productName: product.name,
    productBarcode: product.barcode,
    unitOfMeasure: product.unitOfMeasure,
    warehouseLabel: warehouse.type === 'engineer_station' ? warehouse.name : warehouse.code,
    requisitions,
  };
}
