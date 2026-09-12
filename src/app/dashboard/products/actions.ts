'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { auditLogRepository, productRepository } from '@/lib/data';
import { hasPermission } from '@/lib/permissions';

export interface CreateProductFormState {
  error: string | null;
  success: string | null;
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
  const barcode = String(formData.get('barcode') ?? '').trim();
  const reorderPointRaw = formData.get('reorderPoint');
  const reorderQuantityRaw = formData.get('reorderQuantity');
  const unitPriceRaw = String(formData.get('unitPrice') ?? '').trim();

  if (!sku || !name || !unitOfMeasure) {
    return { error: 'SKU, name and unit of measure are required.', success: null };
  }

  try {
    const product = await productRepository.create({
      sku,
      name,
      unitOfMeasure,
      barcode: barcode || null,
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
    return { error: null, success: `Added ${product.sku} - ${product.name}.` };
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

  if (!id) return { error: 'Missing product reference.', success: null };
  if (!name || !unitOfMeasure) return { error: 'Name and unit of measure are required.', success: null };

  try {
    const product = await productRepository.update(id, {
      name,
      unitOfMeasure,
      barcode: barcode || null,
      reorderPoint: reorderPointRaw ? Number(reorderPointRaw) : null,
      reorderQuantity: reorderQuantityRaw ? Number(reorderQuantityRaw) : null,
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
