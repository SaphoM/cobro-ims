import type { Warehouse } from '@/lib/domain/inventory';

/**
 * The one store in production is coded "DBN-FAC". The client wants that
 * shown simply as "Store" everywhere it's user-facing, without touching
 * warehouse.code itself - CSV export, bulk-import matching (see
 * bulk-import-actions.ts) and the audit log all still need the real code.
 * Engineer stations are unaffected: they already render their owner's
 * name (e.g. "Thabo Mokoena's station"), never their synthetic code.
 */
const STORE_CODE_LABELS: Record<string, string> = {
  'DBN-FAC': 'Store',
};

/** For call sites that have the full Warehouse row. */
export function formatWarehouseLabel(warehouse: Pick<Warehouse, 'type' | 'code' | 'name'>): string {
  if (warehouse.type === 'engineer_station') return warehouse.name;
  return STORE_CODE_LABELS[warehouse.code.toUpperCase()] ?? warehouse.code;
}

/**
 * For contexts that only have a bare code string and can't confirm the
 * warehouse's type (e.g. a report row already flattened to `warehouseCode`).
 * Station codes (which never match a known store code) pass through
 * unchanged, so this is safe to apply even where the code could belong to
 * either kind of warehouse.
 */
export function formatStoreCode(code: string): string {
  return STORE_CODE_LABELS[code.toUpperCase()] ?? code;
}
