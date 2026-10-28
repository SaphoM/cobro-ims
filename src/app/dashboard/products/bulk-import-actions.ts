'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { auditLogRepository, productRepository, stockLedgerRepository, stockMovementRepository, warehouseRepository } from '@/lib/data';
import { hasPermission } from '@/lib/permissions';
import { parseCsv } from '@/lib/csv';
import { generateUniqueBarcode } from '@/lib/barcode-gen';
import { resolveCatalogueUnitCost } from '@/lib/services/inventory-engine';

/**
 * Server-side halves of the two upload forms in bulk-import-form.tsx - see
 * public/templates/README.txt for the format both files are documented to
 * follow, and docs/ARCHITECTURE.md §5.7 for the validation checklist this
 * implements: required fields, SKU uniqueness, numeric quantities,
 * duplicates, and referential integrity between the two files.
 *
 * Both actions validate EVERY row before writing ANYTHING - a file with one
 * bad row fails as a whole, with every problem listed at once, rather than
 * importing 40 good rows and silently skipping a 41st. Re-running an upload
 * is cheap; a half-imported catalogue that someone has to notice and clean
 * up by hand is not. Matches the README's own "wrong data is harder to spot
 * and fix once it's loaded" framing.
 */

export interface BulkImportFormState {
  error: string | null;
  success: string | null;
  /** Row-level problems, one string per row, shown as a bulleted list under
   *  `error` - a single paragraph can't hold "Row 4: ..." for a dozen rows
   *  legibly. Empty/absent whenever `error` is a plain top-level message
   *  (no file chosen, wrong permission, etc.) instead of a validation batch. */
  rowErrors?: string[];
}

// No exported constant here - a 'use server' module may only export async
// functions, so the shared `{ error: null, success: null }` initial state
// lives in bulk-import-form.tsx (the one client component that needs it)
// instead.

async function readUploadedCsv(formData: FormData): Promise<{ text: string; error: string | null }> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { text: '', error: 'Choose a CSV file to upload first.' };
  }
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return { text: '', error: `"${file.name}" doesn't look like a CSV file - export as .csv and try again.` };
  }
  return { text: await file.text(), error: null };
}

export async function importProductsAction(
  _prevState: BulkImportFormState,
  formData: FormData
): Promise<BulkImportFormState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };
  if (!(await hasPermission(session, 'create_products')) && !(await hasPermission(session, 'manage_catalogue'))) {
    return { error: 'Your role does not have permission to manage the product catalogue.', success: null };
  }

  const { text, error: readError } = await readUploadedCsv(formData);
  if (readError) return { error: readError, success: null };

  const { headers, rows } = parseCsv(text);
  const required = ['sku', 'name', 'unit_of_measure'];
  const missingColumns = required.filter((c) => !headers.includes(c));
  if (missingColumns.length > 0) {
    return {
      error: `This file is missing required column(s): ${missingColumns.join(', ')}. Download the template again if you're not sure of the exact column names.`,
      success: null,
    };
  }
  if (rows.length === 0) {
    return { error: 'That file has no data rows to import - only a header (or nothing at all).', success: null };
  }

  const existingProducts = await productRepository.list();
  const existingSkus = new Set(existingProducts.map((p) => p.sku.toLowerCase()));
  const existingBarcodes = new Set(existingProducts.filter((p) => p.barcode).map((p) => p.barcode as string));
  const seenSkusInFile = new Map<string, number>(); // lower-cased sku -> first row number
  const seenBarcodesInFile = new Map<string, number>();

  const rowErrors: string[] = [];
  const toCreate: {
    sku: string;
    name: string;
    unitOfMeasure: string;
    barcode: string | null;
    reorderPoint: number | null;
    reorderQuantity: number | null;
    packagingUom: string | null;
    qtyPerPackage: number | null;
    defaultUnitCost: number | null;
  }[] = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 2; // +1 for the header row, +1 to make it 1-indexed
    const sku = row.sku?.trim();
    const name = row.name?.trim();
    const unitOfMeasure = row.unit_of_measure?.trim();
    const barcode = row.barcode?.trim() || null;
    const reorderPointRaw = row.reorder_point?.trim();
    const reorderQuantityRaw = row.reorder_quantity?.trim();
    const packagingUom = row.packaging_uom?.trim() || null;
    const qtyPerPackageRaw = row.qty_per_package?.trim();
    const defaultUnitCostRaw = row.default_unit_cost?.trim();

    if (!sku) rowErrors.push(`Row ${rowNumber}: sku is required.`);
    if (!name) rowErrors.push(`Row ${rowNumber}: name is required.`);
    if (!unitOfMeasure) rowErrors.push(`Row ${rowNumber}: unit_of_measure is required.`);
    if (!sku || !name || !unitOfMeasure) return;

    const skuKey = sku.toLowerCase();
    if (existingSkus.has(skuKey)) {
      rowErrors.push(`Row ${rowNumber}: sku "${sku}" already exists in the catalogue.`);
    } else if (seenSkusInFile.has(skuKey)) {
      rowErrors.push(`Row ${rowNumber}: sku "${sku}" is a duplicate of row ${seenSkusInFile.get(skuKey)} in this file.`);
    } else {
      seenSkusInFile.set(skuKey, rowNumber);
    }

    if (barcode) {
      if (existingBarcodes.has(barcode)) {
        rowErrors.push(`Row ${rowNumber}: barcode "${barcode}" is already assigned to another product.`);
      } else if (seenBarcodesInFile.has(barcode)) {
        rowErrors.push(`Row ${rowNumber}: barcode "${barcode}" is a duplicate of row ${seenBarcodesInFile.get(barcode)} in this file.`);
      } else {
        seenBarcodesInFile.set(barcode, rowNumber);
      }
    }

    let reorderPoint: number | null = null;
    if (reorderPointRaw) {
      reorderPoint = Number(reorderPointRaw);
      if (!Number.isFinite(reorderPoint) || reorderPoint < 0) {
        rowErrors.push(`Row ${rowNumber}: reorder_point must be a positive number, got "${reorderPointRaw}".`);
      }
    }
    let reorderQuantity: number | null = null;
    if (reorderQuantityRaw) {
      reorderQuantity = Number(reorderQuantityRaw);
      if (!Number.isFinite(reorderQuantity) || reorderQuantity < 0) {
        rowErrors.push(`Row ${rowNumber}: reorder_quantity must be a positive number, got "${reorderQuantityRaw}".`);
      }
    }

    // Packaging validation: qty_per_package is required when packaging_uom is set.
    let qtyPerPackage: number | null = null;
    if (packagingUom && !qtyPerPackageRaw) {
      rowErrors.push(`Row ${rowNumber}: qty_per_package is required when packaging_uom is set.`);
    } else if (qtyPerPackageRaw) {
      qtyPerPackage = Number(qtyPerPackageRaw);
      if (!Number.isFinite(qtyPerPackage) || qtyPerPackage <= 0) {
        rowErrors.push(`Row ${rowNumber}: qty_per_package must be a positive number, got "${qtyPerPackageRaw}".`);
        qtyPerPackage = null;
      }
    }

    let defaultUnitCost: number | null = null;
    if (defaultUnitCostRaw) {
      defaultUnitCost = Number(defaultUnitCostRaw);
      if (!Number.isFinite(defaultUnitCost) || defaultUnitCost < 0) {
        rowErrors.push(`Row ${rowNumber}: default_unit_cost must be zero or a positive number, got "${defaultUnitCostRaw}".`);
        defaultUnitCost = null;
      }
    }

    toCreate.push({ sku, name, unitOfMeasure, barcode, reorderPoint, reorderQuantity, packagingUom, qtyPerPackage, defaultUnitCost });
  });

  if (rowErrors.length > 0) {
    return {
      error: `${rowErrors.length} problem${rowErrors.length === 1 ? '' : 's'} found - nothing was imported. Fix these and re-upload:`,
      success: null,
      rowErrors,
    };
  }

  // Auto-assign barcodes for rows that didn't supply one. Build a combined
  // set of all existing + already-assigned-in-this-batch barcodes so each
  // generated code is unique across the whole import run, not just against
  // the catalogue at the time of the check.
  const allUsedBarcodes = new Set([
    ...existingBarcodes,
    ...toCreate.flatMap((r) => (r.barcode ? [r.barcode] : [])),
  ]);
  const toCreateWithBarcodes = toCreate.map((row) => {
    if (row.barcode) return row;
    const generated = generateUniqueBarcode(allUsedBarcodes);
    allUsedBarcodes.add(generated);
    return { ...row, barcode: generated };
  });

  const created = [];
  for (const input of toCreateWithBarcodes) {
    created.push(await productRepository.create({
      ...input,
      packagingUom: input.packagingUom ?? null,
      qtyPerPackage: input.qtyPerPackage ?? null,
      defaultUnitCost: input.defaultUnitCost ?? null,
    }));
  }

  await auditLogRepository.write({
    tableName: 'products',
    recordId: `bulk-import-${Date.now()}`,
    action: 'insert',
    changedBy: session.id,
    after: { count: created.length, skus: created.map((p) => p.sku) },
  });

  revalidatePath('/dashboard/products');
  return { error: null, success: `Imported ${created.length} product${created.length === 1 ? '' : 's'}.` };
}

export async function importOpeningStockAction(
  _prevState: BulkImportFormState,
  formData: FormData
): Promise<BulkImportFormState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };
  if (!(await hasPermission(session, 'create_products')) && !(await hasPermission(session, 'manage_catalogue'))) {
    return { error: 'Your role does not have permission to manage the product catalogue.', success: null };
  }

  const { text, error: readError } = await readUploadedCsv(formData);
  if (readError) return { error: readError, success: null };

  const { headers, rows } = parseCsv(text);
  const required = ['sku', 'warehouse_code', 'quantity_on_hand'];
  const missingColumns = required.filter((c) => !headers.includes(c));
  if (missingColumns.length > 0) {
    return {
      error: `This file is missing required column(s): ${missingColumns.join(', ')}. Download the template again if you're not sure of the exact column names.`,
      success: null,
    };
  }
  if (rows.length === 0) {
    return { error: 'That file has no data rows to import - only a header (or nothing at all).', success: null };
  }

  const [products, warehouses, ledger] = await Promise.all([
    productRepository.list(),
    warehouseRepository.list(),
    stockLedgerRepository.listAll(),
  ]);
  const productBySku = new Map(products.map((p) => [p.sku, p]));
  const warehouseByCode = new Map(warehouses.map((w) => [w.code, w]));
  const ledgerByPair = new Map(ledger.map((entry) => [`${entry.productId}::${entry.warehouseId}`, entry]));
  const seenPairsInFile = new Map<string, number>(); // "sku|warehouseCode" -> first row number

  const rowErrors: string[] = [];
  const toPost: { productId: string; warehouseId: string; quantity: number; unitCost: number }[] = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    const sku = row.sku?.trim();
    const warehouseCode = row.warehouse_code?.trim();
    const quantityRaw = row.quantity_on_hand?.trim();
    const qtyInPackagesRaw = row.quantity_in_packages?.trim();

    if (!sku) rowErrors.push(`Row ${rowNumber}: sku is required.`);
    if (!warehouseCode) rowErrors.push(`Row ${rowNumber}: warehouse_code is required.`);
    // Must supply exactly one of quantity_on_hand or quantity_in_packages, not both.
    if (quantityRaw && qtyInPackagesRaw) {
      rowErrors.push(`Row ${rowNumber}: supply either quantity_on_hand (individual units) or quantity_in_packages, not both.`);
    }
    if (!quantityRaw && !qtyInPackagesRaw) rowErrors.push(`Row ${rowNumber}: quantity_on_hand (or quantity_in_packages) is required.`);
    if (!sku || !warehouseCode || (!quantityRaw && !qtyInPackagesRaw)) return;

    const product = productBySku.get(sku);
    if (!product) {
      rowErrors.push(`Row ${rowNumber}: sku "${sku}" doesn't match any product - import the product file first, or check for a typo.`);
    }
    const warehouse = warehouseByCode.get(warehouseCode);
    if (!warehouse) {
      rowErrors.push(`Row ${rowNumber}: warehouse_code "${warehouseCode}" doesn't match any store - check the confirmed location codes with X Spark.`);
    }

    let quantity: number;
    if (qtyInPackagesRaw) {
      // quantity_in_packages convenience: convert packages → individual units using the product's qtyPerPackage.
      const pkgs = Number(qtyInPackagesRaw);
      if (!Number.isFinite(pkgs) || pkgs <= 0) {
        rowErrors.push(`Row ${rowNumber}: quantity_in_packages must be a positive number, got "${qtyInPackagesRaw}".`);
        return;
      }
      if (!product) return; // already reported above
      if (!product.qtyPerPackage || product.qtyPerPackage <= 0) {
        rowErrors.push(`Row ${rowNumber}: quantity_in_packages was supplied but "${sku}" has no qty_per_package configured — use quantity_on_hand in individual units instead.`);
        return;
      }
      quantity = Math.round(pkgs * product.qtyPerPackage * 1000) / 1000;
    } else {
      quantity = Number(quantityRaw);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        rowErrors.push(`Row ${rowNumber}: quantity_on_hand must be a positive number, got "${quantityRaw}".`);
        return;
      }
    }

    const pairKey = `${sku}|${warehouseCode}`;
    if (seenPairsInFile.has(pairKey)) {
      rowErrors.push(
        `Row ${rowNumber}: sku "${sku}" at "${warehouseCode}" is a duplicate of row ${seenPairsInFile.get(pairKey)} in this file - combine them into one row.`
      );
    } else {
      seenPairsInFile.set(pairKey, rowNumber);
    }

    if (!product || !warehouse) return;

    /*
      Unit cost is never read from this file: the Product Catalogue's Price
      column is the only place a product's cost can be changed (see
      pricing-actions.ts's setProductPriceAction), so opening stock is costed
      from the catalogue, exactly like every other receiving path. Resolution
      order: catalogue price → default unit cost → any stock already on the
      ledger for this product/warehouse pair (a re-run import, say).
    */
    const unitCost = resolveCatalogueUnitCost(product, ledgerByPair.get(`${product.id}::${warehouse.id}`));
    if (unitCost === null) {
      rowErrors.push(
        `Row ${rowNumber}: "${sku}" has no catalogue price or default unit cost set - set one on the Product Catalogue first, or add it to the product import file.`
      );
      return;
    }

    if (quantity > 0) {
      toPost.push({ productId: product.id, warehouseId: warehouse.id, quantity, unitCost });
    }
  });

  if (rowErrors.length > 0) {
    return {
      error: `${rowErrors.length} problem${rowErrors.length === 1 ? '' : 's'} found - nothing was imported. Fix these and re-upload:`,
      success: null,
      rowErrors,
    };
  }

  for (const input of toPost) {
    await stockMovementRepository.record({
      productId: input.productId,
      warehouseId: input.warehouseId,
      movementType: 'adjustment',
      quantity: input.quantity,
      unitCost: input.unitCost,
      referenceType: 'bulk_import',
      batchRef: 'Opening stock import',
      createdBy: session.id,
    });
  }

  await auditLogRepository.write({
    tableName: 'stock_movements',
    recordId: `bulk-import-${Date.now()}`,
    action: 'insert',
    changedBy: session.id,
    after: { count: toPost.length, referenceType: 'bulk_import' },
  });

  revalidatePath('/dashboard/products');
  revalidatePath('/dashboard');
  return { error: null, success: `Posted opening stock for ${toPost.length} row${toPost.length === 1 ? '' : 's'}.` };
}
