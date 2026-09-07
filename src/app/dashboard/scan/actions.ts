'use server';

/**
 * Server Functions behind the scan station (`/dashboard/scan`).
 *
 * These are the only things on the page that touch stock. A scan-in posts a
 * real `receipt` movement and a scan-out posts a real `dispatch` movement,
 * both through `stockMovementRepository.record` — the same single write path
 * GRN receiving, requisition issuing, transfers and write-offs go through, so
 * the ledger snapshot and weighted-average cost are re-derived by the
 * inventory engine rather than being poked directly. Every posted movement is
 * stamped `referenceType: 'scan_station'` so the audit log shows where it came
 * from.
 *
 * Like every other mutating action in the app, these re-check the session and
 * the caller's permission themselves rather than trusting that the form was
 * only reachable from an authenticated page.
 */

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { parseScanPayload } from '@/lib/scan-payload';
import {
  auditLogRepository,
  productRepository,
  stockLedgerRepository,
  stockMovementRepository,
  warehouseRepository,
} from '@/lib/data';
import { checkPermission, type Permission } from '@/lib/permissions';
import { canSeeCosts } from '@/lib/costs';
import type { Product } from '@/lib/domain/inventory';

export type ScanDirection = 'in' | 'out' | 'use';

export interface ScanStockRow {
  warehouseId: string;
  warehouseCode: string;
  quantityOnHand: number;
  quantityReserved: number;
  weightedAverageCost: number;
}

export interface ScanProductView {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  unitOfMeasure: string;
  reorderPoint: number | null;
  /** The product's standing price. Null when unpriced, or withheld when the caller may not see costs. */
  unitPrice: number | null;
  /** False when this caller is not permitted to see money - the UI shows a placeholder rather than a number. */
  costsVisible: boolean;
  rows: ScanStockRow[];
  totalOnHand: number;
}

export interface ScanPosted {
  movementId: string;
  direction: ScanDirection;
  quantity: number;
  warehouseId: string;
  warehouseCode: string;
  unitCost: number;
  onHandAfter: number;
  wacAfter: number;
}

export interface ScanResult {
  ok: boolean;
  message: string;
  barcode: string;
  /** Populated whenever the barcode resolved, whether or not a movement posted. */
  product: ScanProductView | null;
  /** Only set when a stock movement was actually written. */
  posted: ScanPosted | null;
  /**
   * True only when the barcode was well-formed but matched no catalogue
   * product - specifically not true for a permission denial, an expired
   * session, or a bad quantity/warehouse. The UI uses this (rather than
   * inferring "not found" from `!product` + a non-empty barcode, or worse,
   * from matching the message text) to show its "not a recognised Cobro
   * product" panel only for a genuine catalogue miss, never for a scan that
   * *did* match a real product but was blocked for some other reason.
   */
  notFound: boolean;
  /**
   * True only for the specific Scan IN failure where the product has no
   * existing stock at that warehouse (so there's no weighted-average cost
   * to fall back on) and no unit cost was supplied. Without this, an
   * operator's only feedback is the error text - which they'll often miss
   * mid-scan - and the natural response is to just rescan the same barcode,
   * which fails identically every time until they happen to notice the
   * message and go find the Unit cost field themselves. The UI uses this
   * flag to focus that field directly instead.
   */
  needsUnitCost: boolean;
}

/**
 * USB scanners emulate a keyboard and often append a carriage return, a
 * newline, or a tab as their "end of scan" suffix; camera decodes can carry
 * leading/trailing whitespace from the symbol's payload. Strip all of it so a
 * scan and a typed barcode resolve identically.
 */
function normaliseScan(raw: string): string {
  // A Cobro label may wrap the barcode with extra fields (supplier, today) -
  // unwrap it so a delivery label looks up the same product a bare barcode
  // does. Anything that isn't a Cobro payload comes back unchanged, which is
  // every manufacturer barcode. See src/lib/scan-payload.ts.
  return parseScanPayload(raw).barcode;
}

function failure(message: string, barcode = '', extra: Partial<Pick<ScanResult, 'notFound' | 'needsUnitCost'>> = {}): ScanResult {
  return { ok: false, message, barcode, product: null, posted: null, notFound: false, needsUnitCost: false, ...extra };
}

/**
 * Where else this product actually has stock, for the scan-out failure
 * messages below. "Only 0 on hand, can't scan out 5" is technically
 * accurate but leaves the real question - is this the wrong warehouse, or
 * is the item genuinely out of stock everywhere? - for the operator to go
 * find out themselves. This answers it in the same message.
 */
async function stockElsewhere(productId: string, excludeWarehouseId: string): Promise<string> {
  const [warehouses, ledger] = await Promise.all([warehouseRepository.list(), stockLedgerRepository.listAll()]);
  const warehouseByCode = new Map(warehouses.map((w) => [w.id, w.code]));
  const elsewhere = ledger
    .filter((e) => e.productId === productId && e.warehouseId !== excludeWarehouseId && e.quantityOnHand > 0)
    .map((e) => ({ code: warehouseByCode.get(e.warehouseId) ?? e.warehouseId, quantityOnHand: e.quantityOnHand }))
    .sort((a, b) => b.quantityOnHand - a.quantityOnHand);

  if (elsewhere.length === 0) return 'No warehouse currently holds any stock of it.';
  return `It does have stock at ${elsewhere.map((w) => `${w.code} (${w.quantityOnHand.toLocaleString()})`).join(', ')}.`;
}

async function buildProductView(product: Product): Promise<ScanProductView> {
  const [warehouses, ledger] = await Promise.all([
    warehouseRepository.list(),
    stockLedgerRepository.listAll(),
  ]);
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

  const rows: ScanStockRow[] = ledger
    .filter((entry) => entry.productId === product.id)
    .map((entry) => ({
      warehouseId: entry.warehouseId,
      warehouseCode: warehouseById.get(entry.warehouseId)?.code ?? entry.warehouseId,
      quantityOnHand: entry.quantityOnHand,
      quantityReserved: entry.quantityReserved,
      weightedAverageCost: entry.weightedAverageCost,
    }))
    .sort((a, b) => a.warehouseCode.localeCompare(b.warehouseCode));

  // Costs are withheld at the source rather than hidden in the UI: if the
  // caller may not see money, the numbers never leave the server, so they
  // cannot be read out of the network response either.
  const session = await getSession();
  const costsVisible = await canSeeCosts(session);

  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    barcode: product.barcode,
    unitOfMeasure: product.unitOfMeasure,
    reorderPoint: product.reorderPoint,
    unitPrice: costsVisible ? product.unitPrice : null,
    costsVisible,
    rows: costsVisible ? rows : rows.map((r) => ({ ...r, weightedAverageCost: 0 })),
    totalOnHand: rows.reduce((sum, row) => sum + row.quantityOnHand, 0),
  };
}

/** Resolve a scanned barcode to a product and its stock, without posting anything. */
export async function lookupBarcodeAction(rawBarcode: string): Promise<ScanResult> {
  const session = await getSession();
  if (!session) return failure('Your session has expired. Please sign in again.');

  const barcode = normaliseScan(rawBarcode);
  if (!barcode) return failure('Nothing was scanned.');

  const product = await productRepository.getByBarcode(barcode);
  if (!product) {
    return { ok: false, message: `No product matches barcode ${barcode}.`, barcode, product: null, posted: null, notFound: true, needsUnitCost: false };
  }

  const view = await buildProductView(product);
  return {
    ok: true,
    message: `${product.sku} - ${product.name}`,
    barcode,
    product: view,
    posted: null,
    notFound: false,
    needsUnitCost: false,
  };
}

export interface PostScanInput {
  barcode: string;
  direction: ScanDirection;
  warehouseId: string;
  quantity: number;
  /** Scan-in only. Omitted/zero falls back to the ledger's current WAC. */
  unitCost?: number | null;
}

/**
 * Posts one scan as a real stock movement.
 *
 * Permission mapping is deliberate: scanning stock IN is the receiving
 * capability (`manage_receiving`), scanning stock OUT is the issuing
 * capability (`manage_sales_orders`, which is what the repurposed
 * Requisitions module uses). A warehouse clerk holds both; procurement can
 * only scan in; a viewer can do neither.
 *
 * "Use" (an Engineer consuming stock at their own station) isn't gated by a
 * role permission at all - it's gated by ownership. Any signed-in user may
 * post a `usage` movement, but only at the ONE warehouse that is their own
 * station (`warehouse.ownerUserId === session.id`), which the scan station
 * enforces client-side by never letting that picker point anywhere else in
 * Use mode. This check is the real boundary, not that client behaviour.
 */
export async function postScanAction(input: PostScanInput): Promise<ScanResult> {
  const session = await getSession();
  if (!session) return failure('Your session has expired. Please sign in again.');

  const barcode = normaliseScan(input.barcode);
  if (!barcode) return failure('Nothing was scanned.');

  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return failure('Quantity per scan must be a positive number.', barcode);
  }

  const product = await productRepository.getByBarcode(barcode);
  if (!product) {
    return { ok: false, message: `No product matches barcode ${barcode}.`, barcode, product: null, posted: null, notFound: true, needsUnitCost: false };
  }

  const warehouse = await warehouseRepository.getById(input.warehouseId);
  if (!warehouse) return failure('Pick a warehouse before scanning.', barcode);

  if (input.direction === 'use') {
    if (warehouse.ownerUserId !== session.id) {
      return failure('You can only record usage at your own station.', barcode);
    }
  } else {
    const permission: Permission = input.direction === 'in' ? 'manage_receiving' : 'manage_sales_orders';
    const permissionCheck = await checkPermission(session, permission);
    if (!permissionCheck.allowed) {
      return failure(permissionCheck.reason ?? 'You do not have permission to do that.', barcode);
    }
  }

  const existing = await stockLedgerRepository.get(product.id, warehouse.id);

  let unitCost: number;
  if (input.direction === 'in') {
    const supplied = Number(input.unitCost);
    if (Number.isFinite(supplied) && supplied > 0) {
      unitCost = supplied;
    } else if (existing && existing.weightedAverageCost > 0) {
      // No cost typed — carry the location's current weighted-average cost so
      // the receipt doesn't silently value this stock at zero.
      unitCost = existing.weightedAverageCost;
    } else {
      return failure(
        `${product.sku} has no stock at ${warehouse.code} yet, so there's no weighted-average cost to fall back on - enter a unit cost before scanning it in.`,
        barcode,
        { needsUnitCost: true }
      );
    }
  } else {
    // Outbound movements are valued at the ledger's current WAC; the engine
    // ignores this field for the cost calculation, but it's what makes the
    // movement row meaningful for COGS/reporting.
    unitCost = existing?.weightedAverageCost ?? 0;

    const onHand = existing?.quantityOnHand ?? 0;
    if (onHand < quantity) {
      // The engine blocks this too, but its message is built for developers
      // (raw UUIDs). Caught here so the floor sees SKUs and warehouse codes -
      // and, more importantly, the two distinct situations this covers get
      // two distinct messages rather than one generic "not enough stock"
      // line. Zero on hand almost always means "wrong warehouse selected",
      // not "genuinely out of stock" - the two need different next actions
      // from the operator, so the message says which one this is and names
      // where the stock actually sits, if it sits anywhere.
      const verb = input.direction === 'use' ? 'use' : 'scan out';
      const elsewhere = input.direction === 'use' ? '' : ` ${await stockElsewhere(product.id, warehouse.id)}`;
      if (onHand === 0) {
        return failure(
          input.direction === 'use'
            ? `Nothing of ${product.sku} is sitting at your station right now - there's nothing to record as used.`
            : `${product.sku} has no stock at ${warehouse.code} - there's nothing here to scan out. Double-check ` +
                `${warehouse.code} is the right warehouse before scanning again.${elsewhere}`,
          barcode
        );
      }
      return failure(
        `Only ${onHand.toLocaleString()} ${product.unitOfMeasure} of ${product.sku} on hand at ${warehouse.code} - ` +
          `${verb === 'use' ? 'using' : 'scanning out'} ${quantity.toLocaleString()} would take it negative. Lower Qty ` +
          `per scan to ${onHand.toLocaleString()} or less, or split it across multiple scans.${elsewhere}`,
        barcode
      );
    }
  }

  try {
    const movementType = input.direction === 'in' ? 'receipt' : input.direction === 'use' ? 'usage' : 'dispatch';
    const { movement, ledger } = await stockMovementRepository.record({
      productId: product.id,
      warehouseId: warehouse.id,
      movementType,
      quantity: input.direction === 'in' ? quantity : -quantity,
      unitCost,
      referenceType: 'scan_station',
      createdBy: session.id,
    });

    await auditLogRepository.write({
      tableName: 'stock_movements',
      recordId: movement.id,
      action: 'insert',
      changedBy: session.id,
      after: movement,
    });

    // Not revalidating /dashboard/scan itself: the station holds its own
    // client state (mode, session log, focus) and re-rendering it mid-scan
    // would fight the operator.
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/reports');
    revalidatePath('/dashboard/audit-log');

    const directionLabel = input.direction === 'in' ? 'IN' : input.direction === 'use' ? 'USED' : 'OUT';
    return {
      ok: true,
      message: `${directionLabel} ${quantity.toLocaleString()} ${product.unitOfMeasure} · ${product.sku} @ ${warehouse.code}`,
      barcode,
      product: await buildProductView(product),
      notFound: false,
      needsUnitCost: false,
      posted: {
        movementId: movement.id,
        direction: input.direction,
        quantity,
        warehouseId: warehouse.id,
        warehouseCode: warehouse.code,
        unitCost,
        onHandAfter: ledger.quantityOnHand,
        wacAfter: ledger.weightedAverageCost,
      },
    };
  } catch (err) {
    return failure(err instanceof Error ? err.message : 'Could not post that scan.', barcode);
  }
}
