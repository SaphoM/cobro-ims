'use server';

/**
 * Backs the click-through on the Store ledger's "Reserved" column.
 *
 * Reserved stock is physically present but already promised to an approved
 * requisition, so "120 reserved" on its own raises the obvious question the
 * number can't answer: promised to whom, and for what? This resolves that
 * back to the actual requisitions holding it.
 *
 * One honest caveat this deliberately surfaces rather than hides: the demo
 * dataset seeds opening reserved balances directly onto the ledger without
 * any originating requisition (see src/lib/data/mock/seed.ts), so a seeded
 * row genuinely has nothing to link to. Rather than showing an empty panel
 * that reads like a bug, the result reports the unattributed remainder
 * explicitly.
 */

import { getSession } from '@/lib/auth';
import {
  customerRepository,
  productRepository,
  salesOrderRepository,
  userRepository,
  warehouseRepository,
} from '@/lib/data';

export interface ReservationHolder {
  orderNumber: string;
  departmentName: string;
  quantity: number;
  requestedByName: string;
  status: string;
  createdAt: string;
  confirmedAt: string | null;
}

export interface ReservationDetail {
  ok: boolean;
  message: string | null;
  productSku: string;
  productName: string;
  unitOfMeasure: string;
  warehouseCode: string;
  warehouseName: string;
  /** The ledger's own reserved figure - the number the user clicked on. */
  totalReserved: number;
  holders: ReservationHolder[];
  /** Sum of `holders` quantities; may be less than totalReserved for seeded rows. */
  attributed: number;
  /** totalReserved - attributed. Opening-balance reserved with no requisition behind it. */
  unattributed: number;
}

function empty(message: string): ReservationDetail {
  return {
    ok: false,
    message,
    productSku: '',
    productName: '',
    unitOfMeasure: '',
    warehouseCode: '',
    warehouseName: '',
    totalReserved: 0,
    holders: [],
    attributed: 0,
    unattributed: 0,
  };
}

export async function getReservationDetailAction(
  productId: string,
  warehouseId: string,
  totalReserved: number
): Promise<ReservationDetail> {
  const session = await getSession();
  if (!session) return empty('Your session has expired. Please sign in again.');

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

  // 'confirmed' is the only status that holds a reservation: draft reserves
  // nothing, and dispatched/cancelled have already released it (see the
  // order-flow note on SalesOrderRepository).
  const holders: ReservationHolder[] = orders
    .filter(
      (o) =>
        o.productId === productId &&
        o.warehouseId === warehouseId &&
        o.status === 'confirmed'
    )
    .map((o) => ({
      orderNumber: o.orderNumber,
      departmentName: customerById.get(o.customerId)?.name ?? 'Unknown department',
      quantity: o.quantityOrdered,
      requestedByName: userById.get(o.createdBy)?.fullName ?? 'Unknown user',
      status: o.status,
      createdAt: o.createdAt,
      confirmedAt: o.confirmedAt,
    }))
    .sort((a, b) => b.quantity - a.quantity);

  const attributed = holders.reduce((sum, h) => sum + h.quantity, 0);

  return {
    ok: true,
    message: null,
    productSku: product.sku,
    productName: product.name,
    unitOfMeasure: product.unitOfMeasure,
    warehouseCode: warehouse.code,
    warehouseName: warehouse.name,
    totalReserved,
    holders,
    attributed,
    // Clamped at zero: a negative would only mean the ledger and the orders
    // have drifted apart, which is not something to render as a quantity.
    unattributed: Math.max(0, totalReserved - attributed),
  };
}
