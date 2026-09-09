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
//
// Four roles matching Cobro's real operating structure (Admin / Stores
// Manager / Stores Clerk / Engineer-Requester) — not a generic ERP set.
// Migrated from the previous five: Procurement and Viewer are consolidated
// into Admin, Warehouse Clerk becomes Stores Clerk, and Stores Manager is
// new (there was no separate "manager" tier before). See
// docs/ARCHITECTURE.md §1 for the full rationale.
export const roles: Role[] = [
  { id: 'role-admin', name: 'admin', description: 'Admin', permissions: { '*': true }, createdAt: '2026-01-01T00:00:00Z' },
  {
    id: 'role-stores-manager',
    name: 'stores_manager',
    description: 'Stores Manager',
    permissions: {
      manage_purchase_orders: true,
      manage_receiving: true,
      manage_transfers: true,
      request_adjustments: true,
      create_requisitions: true,
      manage_sales_orders: true,
      view_reports: true,
      view_audit_log: true,
    },
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'role-stores-clerk',
    name: 'stores_clerk',
    description: 'Stores Clerk',
    permissions: {
      manage_purchase_orders: true,
      manage_receiving: true,
      manage_transfers: true,
      create_requisitions: true,
      manage_sales_orders: true,
      view_reports: true,
      view_audit_log: true,
    },
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'role-engineer',
    name: 'engineer_requester',
    description: 'Engineer / Requester',
    permissions: { create_requisitions: true, view_reports: true },
    createdAt: '2026-01-01T00:00:00Z',
  },
  // Added per the 8 September client review - team oversight only, no
  // approval authority (the meeting confirmed the roles exist, not that
  // they approve requisitions). See permissions.ts's ROLE_PERMISSIONS
  // comment for the full reasoning and the extension point if that changes.
  {
    id: 'role-mechanical-lead',
    name: 'mechanical_team_leader',
    description: 'Mechanical Team Leader',
    permissions: { view_requisitions: true, view_reports: true },
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'role-electrical-lead',
    name: 'electrical_team_leader',
    description: 'Electrical Team Leader',
    permissions: { view_requisitions: true, view_reports: true },
    createdAt: '2026-01-01T00:00:00Z',
  },
];

// Same four user IDs as before the role migration (only fullName/email/role/area
// changed) — nothing in seed data ever referenced these by role-specific
// meaning, so remapping in place preserves every ID any future seeded
// audit/requisition record could point at. See docs/ARCHITECTURE.md §1 for
// the exact old-role -> new-role mapping (Procurement/Viewer -> Admin,
// Warehouse Clerk -> Stores Clerk).
export const users: User[] = [
  {
    id: 'user-demo',
    email: 'demo@cobroconcrete.co.za',
    fullName: 'Demo Admin',
    roleId: 'role-admin',
    area: null,
    isActive: true,
    mfaEnrolled: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-procurement',
    email: 'storesmanager@cobroconcrete.co.za',
    fullName: 'Demo Stores Manager',
    roleId: 'role-stores-manager',
    area: null,
    isActive: true,
    mfaEnrolled: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-clerk',
    email: 'clerk@cobroconcrete.co.za',
    fullName: 'Demo Stores Clerk',
    roleId: 'role-stores-clerk',
    area: null,
    isActive: true,
    mfaEnrolled: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-viewer',
    email: 'engineer@cobroconcrete.co.za',
    fullName: 'Demo Engineer',
    roleId: 'role-engineer',
    area: 'Mechanical',
    isActive: true,
    mfaEnrolled: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  // Two more Engineers, seeded directly (rather than only reachable by
  // creating them live via /dashboard/users) so more-than-one engineer
  // station exists by default - the mock data layer resets on every server
  // restart, so a station created live during a session doesn't survive
  // one. Sign in with NEW_USER_DEFAULT_PASSWORD (src/lib/demo-credentials.ts) -
  // the same mock-auth path any admin-created user gets, these two just
  // aren't on the login page's quick-pick card since that's one account
  // per ROLE, not per person.
  {
    id: 'user-engineer-2',
    email: 'sarah.naidoo@cobroconcrete.co.za',
    fullName: 'Sarah Naidoo',
    roleId: 'role-engineer',
    area: 'Electrical',
    isActive: true,
    mfaEnrolled: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-engineer-3',
    email: 'karabo.dlamini@cobroconcrete.co.za',
    fullName: 'Karabo Dlamini',
    roleId: 'role-engineer',
    area: 'Workshop',
    isActive: true,
    mfaEnrolled: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  // On the login page's demo-account picker (see demo-credentials.ts) since
  // there's no existing Mechanical/Electrical team-leader-area coverage
  // otherwise reachable without creating one live via /dashboard/users.
  // Demo Engineer (area: Mechanical) and Sarah Naidoo (area: Electrical)
  // above are exactly what each of these should - and shouldn't - see.
  {
    id: 'user-lead-mechanical',
    email: 'mechlead@cobroconcrete.co.za',
    fullName: 'Demo Mechanical Lead',
    roleId: 'role-mechanical-lead',
    area: 'Mechanical',
    isActive: true,
    mfaEnrolled: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-lead-electrical',
    email: 'electlead@cobroconcrete.co.za',
    fullName: 'Demo Electrical Lead',
    roleId: 'role-electrical-lead',
    area: 'Electrical',
    isActive: true,
    mfaEnrolled: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

export const warehouses: Warehouse[] = [
  // A single physical Store - Cobro operates from one location. The
  // Pietermaritzburg and Richards Bay entries that used to sit alongside
  // this one are gone; their seeded stock was folded into this one's
  // ledger below rather than dropped, so total on-hand doesn't silently
  // change. Inter-store Transfers keeps its schema/UI (see
  // /dashboard/transfers) but has nothing to demo it against until a
  // second real Store exists - Engineer-station transfers (accept/peer
  // pickup) are unaffected, since those move between Warehouse rows of a
  // different type. See docs/ARCHITECTURE.md §1.
  { id: 'wh-dbn', code: 'DBN-FAC', name: 'Durban Store', address: 'Durban, KZN', isActive: true, type: 'store', ownerUserId: null, createdAt: '2026-01-01T00:00:00Z' },
  // Demo Engineer's own station - stock they've accepted from a store but
  // not yet used sits here. Auto-created the same way any new Engineer /
  // Requester gets one on account creation; seeded directly here only
  // because this demo user predates that code path. See Warehouse's doc
  // comment (src/lib/domain/inventory.ts) for the full workflow.
  { id: 'wh-station-engineer', code: 'ENG-STATION', name: "Demo Engineer's station", address: null, isActive: true, type: 'engineer_station', ownerUserId: 'user-viewer', createdAt: '2026-01-01T00:00:00Z' },
  // Two more Engineer stations, one per additional seeded Engineer above -
  // demonstrates the peer-pickup workflow (requisitioning an unused item
  // off another Engineer's station) without needing to create users live
  // first every time the mock server restarts.
  { id: 'wh-station-engineer-2', code: 'STA-SNAIDOO', name: "Sarah Naidoo's station", address: null, isActive: true, type: 'engineer_station', ownerUserId: 'user-engineer-2', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'wh-station-engineer-3', code: 'STA-KDLAMINI', name: "Karabo Dlamini's station", address: null, isActive: true, type: 'engineer_station', ownerUserId: 'user-engineer-3', createdAt: '2026-01-01T00:00:00Z' },
];

export const products: Product[] = [
  { id: 'prod-cem-42-5', sku: 'CEM-42.5-50KG', name: 'Cement 42.5N, 50kg bag', description: null, categoryId: null, unitOfMeasure: 'bag', barcode: '6001240912345', reorderPoint: 500, reorderQuantity: 1000, unitPrice: 118.0, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-block-140', sku: 'BLK-STD-140', name: 'Standard concrete block, 140mm', description: null, categoryId: null, unitOfMeasure: 'ea', barcode: '6001240912346', reorderPoint: 2000, reorderQuantity: 5000, unitPrice: 9.5, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-block-90', sku: 'BLK-STD-090', name: 'Standard concrete block, 90mm', description: null, categoryId: null, unitOfMeasure: 'ea', barcode: '6001240912347', reorderPoint: 2000, reorderQuantity: 5000, unitPrice: 7.25, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-paver-60', sku: 'PAV-60-CHARC', name: 'Interlocking paver 60mm, charcoal', description: null, categoryId: null, unitOfMeasure: 'm2', barcode: '6001240912348', reorderPoint: 300, reorderQuantity: 800, unitPrice: 189.0, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-aggregate-19', sku: 'AGG-19MM', name: 'Crushed stone aggregate, 19mm', description: null, categoryId: null, unitOfMeasure: 'ton', barcode: '6001240912349', reorderPoint: 50, reorderQuantity: 100, unitPrice: 520.0, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-rebar-y12', sku: 'REB-Y12-6M', name: 'Rebar Y12, 6m length', description: null, categoryId: null, unitOfMeasure: 'ea', barcode: '6001240912350', reorderPoint: 200, reorderQuantity: 500, unitPrice: 152.0, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

/** Initial stock ledger snapshot — as if this is the state after Discover-phase data migration. */
// Consolidated onto the single remaining Store: each product's former
// multi-store quantities are summed here, with the weighted-average cost
// re-blended across whatever quantity/cost pairs used to sit at each store
// (the same math applyMovement itself would do for a real inbound
// transfer) - so nothing was dropped or double-counted, just merged.
export const stockLedger: StockLedgerEntry[] = [
  // Was 1,840 @ R92.50 (DBN) + 410 @ R94.10 (PMB) = 2,250 @ R92.79 blended.
  { productId: 'prod-cem-42-5', warehouseId: 'wh-dbn', quantityOnHand: 2250, quantityReserved: 120, weightedAverageCost: 92.79, updatedAt: '2026-08-10T08:00:00Z' },
  // Was 12,400 @ R6.85 (DBN) + 1,850 @ R7.10 (RBB) = 14,250 @ R6.88 blended.
  { productId: 'prod-block-140', warehouseId: 'wh-dbn', quantityOnHand: 14250, quantityReserved: 2000, weightedAverageCost: 6.88, updatedAt: '2026-08-11T09:30:00Z' },
  { productId: 'prod-block-90', warehouseId: 'wh-dbn', quantityOnHand: 5200, quantityReserved: 0, weightedAverageCost: 5.4, updatedAt: '2026-08-11T09:30:00Z' },
  // Was entirely at PMB - moved here unchanged, no other quantity to blend with.
  { productId: 'prod-paver-60', warehouseId: 'wh-dbn', quantityOnHand: 265, quantityReserved: 40, weightedAverageCost: 148.2, updatedAt: '2026-08-07T10:00:00Z' },
  { productId: 'prod-aggregate-19', warehouseId: 'wh-dbn', quantityOnHand: 38, quantityReserved: 0, weightedAverageCost: 410, updatedAt: '2026-08-12T07:45:00Z' },
  // Was entirely at RBB - moved here unchanged, no other quantity to blend with.
  { productId: 'prod-rebar-y12', warehouseId: 'wh-dbn', quantityOnHand: 640, quantityReserved: 0, weightedAverageCost: 118.75, updatedAt: '2026-08-06T13:00:00Z' },
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
  // A Store can also be the requesting party on its own requisition (e.g.
  // replenishing its own counter/yard stock, not on behalf of an external
  // department) - one Customer record per physical Store so it's a normal,
  // correctly-typed option in the same "Requesting department" picker,
  // rather than a special case bolted onto the Store type. Add one here
  // for every entry in `warehouses` with type: 'store'.
  { id: 'cust-store-dbn', name: 'Durban Store (internal use)', contactEmail: null, contactPhone: null, address: 'Durban, KZN', isActive: true, createdAt: '2026-01-01T00:00:00Z' },
];

export const adjustmentReasonCodes: AdjustmentReasonCode[] = [
  { id: 'reason-breakage', code: 'BREAKAGE', description: 'Damaged in handling/storage', requiresApproval: true },
  { id: 'reason-count', code: 'CYCLE_COUNT', description: 'Physical stock take variance', requiresApproval: true },
  { id: 'reason-theft', code: 'THEFT_LOSS', description: 'Suspected theft or unexplained loss', requiresApproval: true },
  { id: 'reason-found', code: 'FOUND_STOCK', description: 'Stock found not on ledger', requiresApproval: true },
];
