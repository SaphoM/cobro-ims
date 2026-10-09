'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { auditLogRepository, productRepository } from '@/lib/data';
import { hasPermission } from '@/lib/permissions';
import { generateUniqueBarcode } from '@/lib/barcode-gen';

export interface CreateProductFormState {
  error: string | null;
  success: string | null;
  /** The barcode that ended up on the product — either the one the user
   *  supplied or the one the system generated. Populated on success only. */
  assignedBarcode?: string | null;
}

export async function createProductAction(
  _prevState: CreateProductFormState,
  formData: FormData
): Promise<CreateProductFormState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };
  if (!(await hasPermission(session, 'manage_catalogue'))) {
    return { error: 'Your role does not have permission to manage the product catalogue.', success: null };
  }

  const sku = String(formData.get('sku') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const unitOfMeasure = String(formData.get('unitOfMeasure') ?? '').trim();
  const categoryId = String(formData.get('categoryId') ?? '').trim() || null;
  const barcodeInput = String(formData.get('barcode') ?? '').trim();
  const reorderPointRaw = formData.get('reorderPoint');
  const reorderQuantityRaw = formData.get('reorderQuantity');
  const unitPriceRaw = String(formData.get('unitPrice') ?? '').trim();
  const packagingUom = String(formData.get('packagingUom') ?? '').trim() || null;
  const qtyPerPackageRaw = String(formData.get('qtyPerPackage') ?? '').trim();
  const defaultUnitCostRaw = String(formData.get('defaultUnitCost') ?? '').trim();

  if (!sku || !name || !unitOfMeasure) {
    return { error: 'SKU, name and unit of measure are required.', success: null };
  }

  // Packaging validation
  if (packagingUom && !qtyPerPackageRaw) {
    return { error: `When a packaging unit is set, the number of ${unitOfMeasure}s per ${packagingUom} is required.`, success: null };
  }
  const qtyPerPackage = qtyPerPackageRaw ? Number(qtyPerPackageRaw) : null;
  if (qtyPerPackage !== null && (!Number.isFinite(qtyPerPackage) || qtyPerPackage <= 0)) {
    return { error: 'Quantity per package must be a positive number.', success: null };
  }
  const defaultUnitCost = defaultUnitCostRaw === '' ? null : Number(defaultUnitCostRaw);
  if (defaultUnitCost !== null && (!Number.isFinite(defaultUnitCost) || defaultUnitCost < 0)) {
    return { error: 'Default unit cost must be zero or a positive number.', success: null };
  }

  // Auto-generate a barcode when the user hasn't supplied one. Read the
  // existing catalogue first so the generator can guarantee uniqueness.
  let barcode: string | null = barcodeInput || null;
  if (!barcode) {
    const existing = await productRepository.list();
    const usedBarcodes = new Set(existing.flatMap((p) => (p.barcode ? [p.barcode] : [])));
    barcode = generateUniqueBarcode(usedBarcodes);
  }

  try {
    const product = await productRepository.create({
      sku,
      name,
      unitOfMeasure,
      packagingUom,
      qtyPerPackage,
      defaultUnitCost,
      categoryId,
      barcode,
      reorderPoint: reorderPointRaw ? Number(reorderPointRaw) : null,
      reorderQuantity: reorderQuantityRaw ? Number(reorderQuantityRaw) : null,
      unitPrice: unitPriceRaw === '' ? null : Number(unitPriceRaw),
    });
    await auditLogRepository.write({
      tableName: 'products',
      recordId: product.id,
      action: 'insert',
      changedBy: session.id,
      after: product,
    });
    revalidatePath('/dashboard/products');
    const wasGenerated = !barcodeInput;
    return {
      error: null,
      success: `Added ${product.sku} - ${product.name}.${wasGenerated ? ` Barcode auto-assigned: ${product.barcode}` : ''}`,
      assignedBarcode: product.barcode,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not create product.', success: null };
  }
}

export async function updateProductAction(
  _prevState: CreateProductFormState,
  formData: FormData
): Promise<CreateProductFormState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };
  if (!(await hasPermission(session, 'manage_catalogue'))) {
    return { error: 'Your role does not have permission to manage the product catalogue.', success: null };
  }

  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const unitOfMeasure = String(formData.get('unitOfMeasure') ?? '').trim();
  const barcode = String(formData.get('barcode') ?? '').trim();
  const reorderPointRaw = formData.get('reorderPoint');
  const reorderQuantityRaw = formData.get('reorderQuantity');
  const categoryId = String(formData.get('categoryId') ?? '').trim() || null;
  const packagingUom = String(formData.get('packagingUom') ?? '').trim() || null;
  const qtyPerPackageRaw = String(formData.get('qtyPerPackage') ?? '').trim();
  const defaultUnitCostRaw = String(formData.get('defaultUnitCost') ?? '').trim();

  if (!id) return { error: 'Missing product reference.', success: null };
  if (!name || !unitOfMeasure) return { error: 'Name and unit of measure are required.', success: null };

  if (packagingUom && !qtyPerPackageRaw) {
    return { error: `When a packaging unit is set, the number of ${unitOfMeasure}s per ${packagingUom} is required.`, success: null };
  }
  const qtyPerPackage = qtyPerPackageRaw ? Number(qtyPerPackageRaw) : null;
  if (qtyPerPackage !== null && (!Number.isFinite(qtyPerPackage) || qtyPerPackage <= 0)) {
    return { error: 'Quantity per package must be a positive number.', success: null };
  }
  const defaultUnitCost = defaultUnitCostRaw === '' ? null : Number(defaultUnitCostRaw);
  if (defaultUnitCost !== null && (!Number.isFinite(defaultUnitCost) || defaultUnitCost < 0)) {
    return { error: 'Default unit cost must be zero or a positive number.', success: null };
  }

  try {
    const product = await productRepository.update(id, {
      name,
      unitOfMeasure,
      packagingUom,
      qtyPerPackage,
      defaultUnitCost,
      barcode: barcode || null,
      reorderPoint: reorderPointRaw ? Number(reorderPointRaw) : null,
      reorderQuantity: reorderQuantityRaw ? Number(reorderQuantityRaw) : null,
      categoryId,
    });
    await auditLogRepository.write({
      tableName: 'products',
      recordId: id,
      action: 'update',
      changedBy: session.id,
      after: product,
    });
    revalidatePath('/dashboard/products');
    return { error: null, success: `Updated ${product.sku} - ${product.name}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not update product.', success: null };
  }
}

export async function deleteProductAction(
  _prevState: CreateProductFormState,
  formData: FormData
): Promise<CreateProductFormState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };
  if (!(await hasPermission(session, 'manage_catalogue'))) {
    return { error: 'Your role does not have permission to manage the product catalogue.', success: null };
  }

  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Missing product reference.', success: null };

  try {
    await productRepository.delete(id);
    await auditLogRepository.write({
      tableName: 'products',
      recordId: id,
      action: 'delete',
      changedBy: session.id,
    });
    revalidatePath('/dashboard/products');
    return { error: null, success: 'Product deleted.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not delete product.', success: null };
  }
}
