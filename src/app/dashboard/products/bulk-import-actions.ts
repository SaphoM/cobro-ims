'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { auditLogRepository, productRepository, stockMovementRepository, warehouseRepository } from '@/lib/data';
import { hasPermission } from '@/lib/permissions';
import { parseCsv } from '@/lib/csv';

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
  if (!(await hasPermission(session, 'manage_catalogue'))) {
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
  }[] = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 2; // +1 for the header row, +1 to make it 1-indexed
    const sku = row.sku?.trim();
    const name = row.name?.trim();
    const unitOfMeasure = row.unit_of_measure?.trim();
    const barcode = row.barcode?.trim() || null;
    const reorderPointRaw = row.reorder_point?.trim();
    const reorderQuantityRaw = row.reorder_quantity?.trim();

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

    toCreate.push({ sku, name, unitOfMeasure, barcode, reorderPoint, reorderQuantity });
  });

  if (rowErrors.length > 0) {
    return {
      error: `${rowErrors.length} problem${rowErrors.length === 1 ? '' : 's'} found - nothing was imported. Fix these and re-upload:`,
      success: null,
      rowErrors,
    };
  }

  const created = [];
  for (const input of toCreate) {
    created.push(await productRepository.create(input));
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
  if (!(await hasPermission(session, 'manage_catalogue'))) {
    return { error: 'Your role does not have permission to manage the product catalogue.', success: null };
  }

  const { text, error: readError } = await readUploadedCsv(formData);
  if (readError) return { error: readError, success: null };

  const { headers, rows } = parseCsv(text);
  const required = ['sku', 'warehouse_code', 'quantity_on_hand', 'unit_cost'];
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

  const [products, warehouses] = await Promise.all([productRepository.list(), warehouseRepository.list()]);
  const productBySku = new Map(products.map((p) => [p.sku, p]));
  const warehouseByCode = new Map(warehouses.map((w) => [w.code, w]));
  const seenPairsInFile = new Map<string, number>(); // "sku|warehouseCode" -> first row number

  const rowErrors: string[] = [];
  const toPost: { productId: string; warehouseId: string; quantity: number; unitCost: number }[] = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    const sku = row.sku?.trim();
    const warehouseCode = row.warehouse_code?.trim();
    const quantityRaw = row.quantity_on_hand?.trim();
    const unitCostRaw = row.unit_cost?.trim();

    if (!sku) rowErrors.push(`Row ${rowNumber}: sku is required.`);
    if (!warehouseCode) rowErrors.push(`Row ${rowNumber}: warehouse_code is required.`);
    if (!quantityRaw) rowErrors.push(`Row ${rowNumber}: quantity_on_hand is required.`);
    if (!unitCostRaw) rowErrors.push(`Row ${rowNumber}: unit_cost is required.`);
    if (!sku || !warehouseCode || !quantityRaw || !unitCostRaw) return;

    const product = productBySku.get(sku);
    if (!product) {
      rowErrors.push(`Row ${rowNumber}: sku "${sku}" doesn't match any product - import the product file first, or check for a typo.`);
    }
    const warehouse = warehouseByCode.get(warehouseCode);
    if (!warehouse) {
      rowErrors.push(`Row ${rowNumber}: warehouse_code "${warehouseCode}" doesn't match any store - check the confirmed location codes with X Spark.`);
    }

    const quantity = Number(quantityRaw);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      rowErrors.push(`Row ${rowNumber}: quantity_on_hand must be a positive number, got "${quantityRaw}".`);
    }
    const unitCost = Number(unitCostRaw);
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      rowErrors.push(`Row ${rowNumber}: unit_cost must be zero or a positive number, got "${unitCostRaw}".`);
    }

    const pairKey = `${sku}|${warehouseCode}`;
    if (seenPairsInFile.has(pairKey)) {
      rowErrors.push(
        `Row ${rowNumber}: sku "${sku}" at "${warehouseCode}" is a duplicate of row ${seenPairsInFile.get(pairKey)} in this file - combine them into one row.`
      );
    } else {
      seenPairsInFile.set(pairKey, rowNumber);
    }

    if (product && warehouse && Number.isFinite(quantity) && quantity > 0 && Number.isFinite(unitCost) && unitCost >= 0) {
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
