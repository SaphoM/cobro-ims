/**
 * Unit of Measure definitions for the COBRO IMS product catalogue.
 *
 * Three categories drive what conditional fields the Add/Edit Product form
 * shows (see new-product-form.tsx):
 *
 *   'count'    — individually countable items, potentially packaged.
 *                May have packagingUom + qtyPerPackage + defaultUnitCost.
 *   'measure'  — measurement-based units (length, area, volume, weight).
 *                Have a cost per measurement unit; no per-item packaging.
 *   'container'— products defined BY their container (bag, drum, roll, sheet).
 *                Optionally have a content quantity for valuation purposes.
 *
 * Packaging UOMs (box, pack, pallet, etc.) appear in a separate packaging
 * dropdown; they are never the stock UOM themselves.
 */

export type UomCategory = 'count' | 'measure' | 'container';

export interface UomDefinition {
  value: string;
  label: string;
  category: UomCategory;
  /** Human-readable hint shown beneath the UOM field */
  hint: string;
}

export const STOCK_UOMS: UomDefinition[] = [
  // Count UOMs
  { value: 'ea',   label: 'Each (ea)',    category: 'count',   hint: 'Individual countable item. Add packaging if it comes in boxes, packs, or pallets.' },
  { value: 'pair', label: 'Pair',         category: 'count',   hint: 'Items sold or tracked in pairs (default 2 per pair). Add packaging if pairs are packed in boxes.' },
  { value: 'set',  label: 'Set',          category: 'count',   hint: 'A predefined set of components. Use BOM to define what is in the set.' },
  { value: 'kit',  label: 'Kit',          category: 'count',   hint: 'A kit of components. Use BOM to list component quantities.' },
  // Measurement UOMs
  { value: 'kg',   label: 'Kilogram (kg)', category: 'measure', hint: 'Track stock in kilograms. Unit cost is per kilogram.' },
  { value: 'ton',  label: 'Ton (t)',       category: 'measure', hint: 'Track stock in metric tons. Unit cost is per ton.' },
  { value: 'm',    label: 'Metre (m)',     category: 'measure', hint: 'Track stock in metres. Unit cost is per metre.' },
  { value: 'mm',   label: 'Millimetre (mm)', category: 'measure', hint: 'Track stock in millimetres. Unit cost is per millimetre.' },
  { value: 'm2',   label: 'Square metre (m²)', category: 'measure', hint: 'Track stock in square metres. Unit cost is per m².' },
  { value: 'm3',   label: 'Cubic metre (m³)', category: 'measure', hint: 'Track stock in cubic metres. Unit cost is per m³.' },
  { value: 'l',    label: 'Litre (L)',     category: 'measure', hint: 'Track stock in litres. Unit cost is per litre.' },
  // Container UOMs — the product IS the container
  { value: 'bag',   label: 'Bag',    category: 'container', hint: 'Stock is tracked as whole bags (e.g. 50kg cement bag). Specify contents if the bag holds a countable quantity.' },
  { value: 'roll',  label: 'Roll',   category: 'container', hint: 'Stock is tracked as whole rolls. Specify length per roll for valuation.' },
  { value: 'sheet', label: 'Sheet',  category: 'container', hint: 'Stock is tracked as whole sheets. Specify dimensions if needed for valuation.' },
  { value: 'drum',  label: 'Drum',   category: 'container', hint: 'Stock is tracked as whole drums. Specify capacity per drum for valuation.' },
];

/** UOMs that can be used as the PACKAGING unit (i.e. the purchase/storage container). */
export const PACKAGING_UOMS: string[] = [
  'box', 'pack', 'bag', 'pallet', 'drum', 'roll', 'sheet', 'carton',
];

/** Packaging UOM display labels */
export const PACKAGING_UOM_LABELS: Record<string, string> = {
  box:    'Box',
  pack:   'Pack',
  bag:    'Bag',
  pallet: 'Pallet',
  drum:   'Drum',
  roll:   'Roll',
  sheet:  'Sheet',
  carton: 'Carton',
};

export function getUomDef(value: string): UomDefinition | undefined {
  return STOCK_UOMS.find((u) => u.value === value);
}

/** Returns true when this stock UOM can meaningfully have a per-unit count packaging. */
export function supportsPackaging(uom: string): boolean {
  const def = getUomDef(uom);
  // Count UOMs always support packaging (e.g. bolts → box of 100).
  // Container UOMs optionally support a content qty (e.g. bag of 100 nuts).
  // Measurement UOMs don't: you can't say "1 box = 5 kg" without an explicit
  // density — that relationship is not a simple count conversion.
  return def?.category === 'count' || def?.category === 'container';
}

/**
 * Calculates the indicative package value from individual-unit cost and
 * packaging quantity. Returns null if either input is missing or invalid.
 * This is a display/validation helper only — never used as the authoritative
 * cost for stock movements.
 */
export function calcPackageValue(unitCost: number | null, qtyPerPackage: number | null): number | null {
  if (unitCost == null || qtyPerPackage == null) return null;
  if (unitCost < 0 || qtyPerPackage <= 0) return null;
  return Math.round(unitCost * qtyPerPackage * 100) / 100;
}

/**
 * Converts a package quantity to individual stock-unit quantity.
 * Returns null if the product has no packaging configured.
 */
export function packagesToStockUnits(
  packageQty: number,
  qtyPerPackage: number | null
): number | null {
  if (qtyPerPackage == null || qtyPerPackage <= 0) return null;
  return Math.round(packageQty * qtyPerPackage * 1000) / 1000;
}
