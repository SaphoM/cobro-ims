/**
 * Mock seed data — a plausible slice of a small KZN concrete manufacturer's
 * catalogue and stock, standing in for a real Supabase project during the
 * Foundation phase. Product names/SKUs are illustrative, not Cobro's real
 * catalogue (that's a Discover-phase input to gather from the client).
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
} from '@/lib/domain/inventory';

// Permission keys mirror src/lib/permissions.ts's Permission type — kept as
// plain strings here (not imported) so seed data has no dependency on
// business logic. The actual matrix enforced at runtime lives in
// permissions.ts; what's stored on each role here is descriptive/seed data,
// matching it by convention. See docs/ARCHITECTURE.md §5.2 — this whole
// matrix is a placeholder pending Cobro confirmation, not settled policy.
export const roles: Role[] = [
  { id: 'role-admin', name: 'admin', description: 'Full system access', permissions: { '*': true }, createdAt: '2026-01-01T00:00:00Z' },
  {
    id: 'role-warehouse',
    name: 'warehouse_clerk',
    description: 'Receiving, transfers, stock-take requests, sales dispatch',
    permissions: { manage_receiving: true, manage_transfers: true, request_adjustments: true, manage_sales_orders: true, view_reports: true },
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'role-procurement',
    name: 'procurement',
    description: 'Purchase orders & suppliers',
    permissions: { manage_purchase_orders: true, manage_suppliers: true, manage_receiving: true, view_reports: true },
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'role-viewer',
    name: 'viewer',
    description: 'Read-only dashboards & reports',
    permissions: { view_reports: true },
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
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-clerk',
    email: 'clerk@cobroconcrete.co.za',
    fullName: 'Demo Warehouse Clerk',
    roleId: 'role-warehouse',
    isActive: true,
    mfaEnrolled: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-procurement',
    email: 'procurement@cobroconcrete.co.za',
    fullName: 'Demo Procurement',
    roleId: 'role-procurement',
    isActive: true,
    mfaEnrolled: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-viewer',
    email: 'viewer@cobroconcrete.co.za',
    fullName: 'Demo Viewer',
    roleId: 'role-viewer',
    isActive: true,
    mfaEnrolled: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

export const warehouses: Warehouse[] = [
  { id: 'wh-dbn', code: 'DBN-FAC', name: 'Durban Factory', address: 'Durban, KZN', isActive: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'wh-pmb', code: 'PMB-WH', name: 'Pietermaritzburg Warehouse', address: 'Pietermaritzburg, KZN', isActive: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'wh-rbb', code: 'RBB-DEP', name: 'Richards Bay Depot', address: 'Richards Bay, KZN', isActive: true, createdAt: '2026-01-01T00:00:00Z' },
];

export const products: Product[] = [
  { id: 'prod-cem-42-5', sku: 'CEM-42.5-50KG', name: 'Cement 42.5N, 50kg bag', description: null, categoryId: null, unitOfMeasure: 'bag', barcode: '6001240912345', reorderPoint: 500, reorderQuantity: 1000, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-block-140', sku: 'BLK-STD-140', name: 'Standard concrete block, 140mm', description: null, categoryId: null, unitOfMeasure: 'ea', barcode: '6001240912346', reorderPoint: 2000, reorderQuantity: 5000, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-block-90', sku: 'BLK-STD-090', name: 'Standard concrete block, 90mm', description: null, categoryId: null, unitOfMeasure: 'ea', barcode: '6001240912347', reorderPoint: 2000, reorderQuantity: 5000, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-paver-60', sku: 'PAV-60-CHARC', name: 'Interlocking paver 60mm, charcoal', description: null, categoryId: null, unitOfMeasure: 'm2', barcode: '6001240912348', reorderPoint: 300, reorderQuantity: 800, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-aggregate-19', sku: 'AGG-19MM', name: 'Crushed stone aggregate, 19mm', description: null, categoryId: null, unitOfMeasure: 'ton', barcode: '6001240912349', reorderPoint: 50, reorderQuantity: 100, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-rebar-y12', sku: 'REB-Y12-6M', name: 'Rebar Y12, 6m length', description: null, categoryId: null, unitOfMeasure: 'ea', barcode: '6001240912350', reorderPoint: 200, reorderQuantity: 500, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

/** Initial stock ledger snapshot — as if this is the state after Discover-phase data migration. */
export const stockLedger: StockLedgerEntry[] = [
  { productId: 'prod-cem-42-5', warehouseId: 'wh-dbn', quantityOnHand: 1840, quantityReserved: 120, weightedAverageCost: 92.5, updatedAt: '2026-08-10T08:00:00Z' },
  { productId: 'prod-cem-42-5', warehouseId: 'wh-pmb', quantityOnHand: 410, quantityReserved: 0, weightedAverageCost: 94.1, updatedAt: '2026-08-09T14:00:00Z' },
  { productId: 'prod-block-140', warehouseId: 'wh-dbn', quantityOnHand: 12400, quantityReserved: 2000, weightedAverageCost: 6.85, updatedAt: '2026-08-11T09:30:00Z' },
  { productId: 'prod-block-140', warehouseId: 'wh-rbb', quantityOnHand: 1850, quantityReserved: 0, weightedAverageCost: 7.1, updatedAt: '2026-08-08T11:00:00Z' },
  { productId: 'prod-block-90', warehouseId: 'wh-dbn', quantityOnHand: 5200, quantityReserved: 0, weightedAverageCost: 5.4, updatedAt: '2026-08-11T09:30:00Z' },
  { productId: 'prod-paver-60', warehouseId: 'wh-pmb', quantityOnHand: 265, quantityReserved: 40, weightedAverageCost: 148.2, updatedAt: '2026-08-07T10:00:00Z' },
  { productId: 'prod-aggregate-19', warehouseId: 'wh-dbn', quantityOnHand: 38, quantityReserved: 0, weightedAverageCost: 410, updatedAt: '2026-08-12T07:45:00Z' },
  { productId: 'prod-rebar-y12', warehouseId: 'wh-rbb', quantityOnHand: 640, quantityReserved: 0, weightedAverageCost: 118.75, updatedAt: '2026-08-06T13:00:00Z' },
];

export const suppliers: Supplier[] = [
  { id: 'sup-natal-cement', name: 'Natal Cement Distributors', contactEmail: 'orders@natalcement.co.za', contactPhone: '031 555 0142', address: 'Pinetown, KZN', isActive: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'sup-kzn-aggregates', name: 'KZN Aggregates & Quarries', contactEmail: 'sales@kznaggregates.co.za', contactPhone: '031 555 0199', address: 'Camperdown, KZN', isActive: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'sup-steel-supply', name: 'Steel Supply Co.', contactEmail: 'accounts@steelsupply.co.za', contactPhone: '033 555 0177', address: 'Pietermaritzburg, KZN', isActive: true, createdAt: '2026-01-01T00:00:00Z' },
];

export const customers: Customer[] = [
  { id: 'cust-thabo-construction', name: 'Thabo Construction', contactEmail: 'procurement@thaboconstruction.co.za', contactPhone: '031 555 0301', address: 'Umlazi, KZN', isActive: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'cust-kzn-builders', name: 'KZN Builders Merchant', contactEmail: 'orders@kznbuilders.co.za', contactPhone: '033 555 0288', address: 'Pietermaritzburg, KZN', isActive: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'cust-msunduzi-dev', name: 'Msunduzi Developments', contactEmail: 'accounts@msunduzidev.co.za', contactPhone: '033 555 0412', address: 'Msunduzi, KZN', isActive: true, createdAt: '2026-01-01T00:00:00Z' },
];

export const adjustmentReasonCodes: AdjustmentReasonCode[] = [
  { id: 'reason-breakage', code: 'BREAKAGE', description: 'Damaged in handling/storage', requiresApproval: true },
  { id: 'reason-count', code: 'CYCLE_COUNT', description: 'Physical stock take variance', requiresApproval: true },
  { id: 'reason-theft', code: 'THEFT_LOSS', description: 'Suspected theft or unexplained loss', requiresApproval: true },
  { id: 'reason-found', code: 'FOUND_STOCK', description: 'Stock found not on ledger', requiresApproval: true },
];
