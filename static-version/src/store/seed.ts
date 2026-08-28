/**
 * Mock seed data — a plausible slice of a small KZN concrete manufacturer's
 * catalogue and stock.
 *
 * LOCATION MODEL: Cobro runs ONE physical store. The three warehouses this
 * data used to carry (DBN-FAC, PMB-WH, RBB-DEP) have been consolidated into
 * that single Store, with each product's quantity summed and its
 * weighted-average cost re-derived across the merged holdings — so no stock
 * value was invented or lost in the consolidation. Everything else that holds
 * stock is an ASSET (a machine or workshop where stock is used).
 */

import type {
  AdjustmentReasonCode,
  Customer,
  Product,
  Role,
  StockLedgerEntry,
  Supplier,
  User,
  Warehouse,
} from '@/store/types';

/**
 * Three roles, per the current spec:
 *  - admin    — oversight only. Explicitly CANNOT requisition or transfer.
 *  - engineer — works at an asset; requests, transfers and returns stock.
 *  - store    — runs the Store; fulfils requisitions, receives returns.
 * The matrix enforced at runtime lives in permissions.ts; what's stored here
 * is descriptive seed data matching it by convention.
 */
export const roles: Role[] = [
  { id: 'role-admin', name: 'admin', description: 'Oversight — view everything, initiate nothing', permissions: { '*': true }, createdAt: '2026-01-01T00:00:00Z' },
  {
    id: 'role-engineer',
    name: 'engineer',
    description: 'Asset engineer — requisition, transfer, return',
    permissions: { manage_sales_orders: true, manage_transfers: true, request_adjustments: true, view_reports: true },
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'role-store',
    name: 'store',
    description: 'Store — fulfil requisitions, receive stock',
    permissions: { manage_receiving: true, manage_purchase_orders: true, manage_suppliers: true, manage_sales_orders: true, manage_transfers: true, view_reports: true },
    createdAt: '2026-01-01T00:00:00Z',
  },
];

export const users: User[] = [
  {
    id: 'user-demo',
    email: 'demo@cobroconcrete.co.za',
    fullName: 'Demo Admin',
    roleId: 'role-admin',
    isActive: true,
    mfaEnrolled: false,
    assetId: null, // oversight role — not tied to one asset
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-engineer',
    email: 'engineer@cobroconcrete.co.za',
    fullName: 'Demo Engineer',
    roleId: 'role-engineer',
    isActive: true,
    mfaEnrolled: false,
    assetId: 'asset-machine-5', // engineers work AT an asset
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-store',
    email: 'store@cobroconcrete.co.za',
    fullName: 'Demo Store',
    roleId: 'role-store',
    isActive: true,
    mfaEnrolled: false,
    assetId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

/** The single Store. Referenced directly by workflows that must start/end here. */
export const STORE_LOCATION_ID = 'loc-store';

/**
 * All stock locations — the one Store plus every asset. Assets are seeded
 * from the spec's own examples (Machine 5, Electrical Workshop, Mechanical
 * Workshop) because the previous seed held customer companies, which are not
 * assets in any meaningful sense. Cobro's real asset register replaces these.
 */
export const warehouses: Warehouse[] = [
  { id: STORE_LOCATION_ID, code: 'STORE', name: 'Main Store', description: 'Central stores — all incoming stock is received here', kind: 'store', address: 'Durban, KZN', isActive: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'asset-machine-5', code: 'MACHINE-5', name: 'Machine 5', description: 'Production line machine 5', kind: 'asset', address: null, isActive: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'asset-electrical', code: 'ELEC-WS', name: 'Electrical Workshop', description: 'Electrical maintenance workshop', kind: 'asset', address: null, isActive: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'asset-mechanical', code: 'MECH-WS', name: 'Mechanical Workshop', description: 'Mechanical maintenance workshop', kind: 'asset', address: null, isActive: true, createdAt: '2026-01-01T00:00:00Z' },
];

export const products: Product[] = [
  { id: 'prod-cem-42-5', sku: 'CEM-42.5-50KG', name: 'Cement 42.5N, 50kg bag', description: null, categoryId: null, unitOfMeasure: 'bag', barcode: '6001240912345', reorderPoint: 500, reorderQuantity: 1000, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-block-140', sku: 'BLK-STD-140', name: 'Standard concrete block, 140mm', description: null, categoryId: null, unitOfMeasure: 'ea', barcode: '6001240912346', reorderPoint: 2000, reorderQuantity: 5000, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-block-90', sku: 'BLK-STD-090', name: 'Standard concrete block, 90mm', description: null, categoryId: null, unitOfMeasure: 'ea', barcode: '6001240912347', reorderPoint: 2000, reorderQuantity: 5000, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-paver-60', sku: 'PAV-60-CHARC', name: 'Interlocking paver 60mm, charcoal', description: null, categoryId: null, unitOfMeasure: 'm2', barcode: '6001240912348', reorderPoint: 300, reorderQuantity: 800, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-aggregate-19', sku: 'AGG-19MM', name: 'Crushed stone aggregate, 19mm', description: null, categoryId: null, unitOfMeasure: 'ton', barcode: '6001240912349', reorderPoint: 50, reorderQuantity: 100, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-rebar-y12', sku: 'REB-Y12-6M', name: 'Rebar Y12, 6m length', description: null, categoryId: null, unitOfMeasure: 'ea', barcode: '6001240912350', reorderPoint: 200, reorderQuantity: 500, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

/**
 * Opening stock, all at the Store. Consolidated from the previous
 * three-warehouse seed by summing quantities and re-deriving WAC across the
 * merged holdings:
 *   cement    1,840 @ 92.50 + 410 @ 94.10 -> 2,250 @ 92.7916
 *   block-140 12,400 @ 6.85 + 1,850 @ 7.10 -> 14,250 @ 6.8825
 * The other four products existed at a single location, so they carry over
 * untouched. Reservations carry over as-is.
 *
 * ONE deliberate addition: a small, deliberately AGED holding at Machine 5
 * (`lastInboundAt` ~40 days back) so idle-stock detection has something to
 * find on first load. Without it that feature is invisible until someone
 * performs a movement and waits.
 */
export const stockLedger: StockLedgerEntry[] = [
  { productId: 'prod-cem-42-5', warehouseId: STORE_LOCATION_ID, quantityOnHand: 2250, quantityReserved: 120, weightedAverageCost: 92.7916, lastInboundAt: '2026-08-10T08:00:00Z', updatedAt: '2026-08-10T08:00:00Z' },
  { productId: 'prod-block-140', warehouseId: STORE_LOCATION_ID, quantityOnHand: 14250, quantityReserved: 2000, weightedAverageCost: 6.8825, lastInboundAt: '2026-08-11T09:30:00Z', updatedAt: '2026-08-11T09:30:00Z' },
  { productId: 'prod-block-90', warehouseId: STORE_LOCATION_ID, quantityOnHand: 5200, quantityReserved: 0, weightedAverageCost: 5.4, lastInboundAt: '2026-08-11T09:30:00Z', updatedAt: '2026-08-11T09:30:00Z' },
  { productId: 'prod-paver-60', warehouseId: STORE_LOCATION_ID, quantityOnHand: 265, quantityReserved: 40, weightedAverageCost: 148.2, lastInboundAt: '2026-08-07T10:00:00Z', updatedAt: '2026-08-07T10:00:00Z' },
  { productId: 'prod-aggregate-19', warehouseId: STORE_LOCATION_ID, quantityOnHand: 38, quantityReserved: 0, weightedAverageCost: 410, lastInboundAt: '2026-08-12T07:45:00Z', updatedAt: '2026-08-12T07:45:00Z' },
  { productId: 'prod-rebar-y12', warehouseId: STORE_LOCATION_ID, quantityOnHand: 640, quantityReserved: 0, weightedAverageCost: 118.75, lastInboundAt: '2026-08-06T13:00:00Z', updatedAt: '2026-08-06T13:00:00Z' },
  // Aged demo holding so idle-stock detection is visible immediately.
  { productId: 'prod-rebar-y12', warehouseId: 'asset-machine-5', quantityOnHand: 25, quantityReserved: 0, weightedAverageCost: 118.75, lastInboundAt: '2026-07-18T09:00:00Z', updatedAt: '2026-07-18T09:00:00Z' },
];

export const suppliers: Supplier[] = [
  { id: 'sup-natal-cement', name: 'Natal Cement Distributors', contactEmail: 'orders@natalcement.co.za', contactPhone: '031 555 0142', address: 'Pinetown, KZN', isActive: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'sup-kzn-aggregates', name: 'KZN Aggregates & Quarries', contactEmail: 'sales@kznaggregates.co.za', contactPhone: '031 555 0199', address: 'Camperdown, KZN', isActive: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'sup-steel-supply', name: 'Steel Supply Co.', contactEmail: 'accounts@steelsupply.co.za', contactPhone: '033 555 0177', address: 'Pietermaritzburg, KZN', isActive: true, createdAt: '2026-01-01T00:00:00Z' },
];

/**
 * Departments are gone — assets replaced them, and assets live in
 * `warehouses` above because they hold stock. This empty list remains only
 * so the dormant invoicing module (unreachable from navigation, kept rather
 * than deleted) still type-checks.
 */
export const customers: Customer[] = [];

export const adjustmentReasonCodes: AdjustmentReasonCode[] = [
  { id: 'reason-breakage', code: 'BREAKAGE', description: 'Damaged in handling/storage', requiresApproval: true },
  { id: 'reason-count', code: 'CYCLE_COUNT', description: 'Physical stock take variance', requiresApproval: true },
  { id: 'reason-theft', code: 'THEFT_LOSS', description: 'Suspected theft or unexplained loss', requiresApproval: true },
  { id: 'reason-found', code: 'FOUND_STOCK', description: 'Stock found not on ledger', requiresApproval: true },
];

/** How long stock may sit at an asset before it's flagged idle. */
export const IDLE_STOCK_DAYS = 30;
