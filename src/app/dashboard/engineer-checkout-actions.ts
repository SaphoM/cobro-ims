'use server';

/**
 * Backs EngineerScanCard's "Scan" (checkout/collect) button - see
 * docs/ARCHITECTURE.md's "Engineer stations" section: "engineer comes and
 * scans to accept stock items" was the documented intent from day one, but
 * `dispatchSalesOrderAction` (the actual pickup action - see
 * src/app/dashboard/sales/actions.ts) was only ever reachable by clicking
 * "Accept" on a specific known row on /dashboard/sales. This resolves a
 * SCANNED barcode to which of the Engineer's own approved requisitions it
 * belongs, so the same existing action can be triggered from a scan instead.
 *
 * No new write path: this is a lookup only. The actual checkout still goes
 * through `dispatchSalesOrderAction` directly (see EngineerScanCard), which
 * re-checks everything itself (session, ownership) exactly as it already
 * does for the click-triggered "Accept" - a scanned barcode is not a new way
 * to bypass any check that already exists.
 */

import { getSession } from '@/lib/auth';
import { productRepository, salesOrderRepository, warehouseRepository } from '@/lib/data';
import { parseScanPayload } from '@/lib/scan-payload';

export interface CheckoutMatch {
  ok: boolean;
  message: string | null;
  orderId: string;
  orderNumber: string;
  productSku: string;
  productName: string;
  quantity: number;
  unitOfMeasure: string;
  fromLabel: string;
}

function noMatch(message: string): CheckoutMatch {
  return {
    ok: false,
    message,
    orderId: '',
    orderNumber: '',
    productSku: '',
    productName: '',
    quantity: 0,
    unitOfMeasure: '',
    fromLabel: '',
  };
}

/**
 * Finds the oldest of THIS session's own `confirmed` (approved, not yet
 * dispatched) requisitions whose product matches the scanned code - the
 * same "wrong item scanned" pattern every other scan point in this app uses
 * (GRN's matchBarcode, ReserveButton): a code that resolves to a product
 * with no matching pending pickup for this Engineer is refused with a clear
 * reason, never silently ignored or matched to someone else's requisition.
 */
export async function findMyCheckoutAction(scannedValue: string): Promise<CheckoutMatch> {
  const session = await getSession();
  if (!session) return noMatch('Your session has expired. Please sign in again.');

  const { barcode } = parseScanPayload(scannedValue);
  if (!barcode) return noMatch('Nothing was scanned.');

  const product = await productRepository.getByBarcode(barcode);
  if (!product) return noMatch(`No product matches barcode ${barcode}.`);

  const orders = await salesOrderRepository.list();
  const mine = orders
    .filter((o) => o.productId === product.id && o.status === 'confirmed' && o.createdBy === session.id)
    .sort((a, b) => (a.confirmedAt ?? '').localeCompare(b.confirmedAt ?? ''));

  const match = mine[0];
  if (!match) {
    return noMatch(
      `${product.sku} - ${product.name} doesn't match any of your approved requisitions waiting for pickup. ` +
        `Check /dashboard/sales, or ask Stores to approve your request first.`
    );
  }

  const source = await warehouseRepository.getById(match.warehouseId);
  const fromLabel = source ? (source.type === 'engineer_station' ? source.name : source.code) : 'Unknown location';

  return {
    ok: true,
    message: null,
    orderId: match.id,
    orderNumber: match.orderNumber,
    productSku: product.sku,
    productName: product.name,
    quantity: match.quantityOrdered,
    unitOfMeasure: product.unitOfMeasure,
    fromLabel,
  };
}
