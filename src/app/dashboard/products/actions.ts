'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { productRepository } from '@/lib/data';

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

  const sku = String(formData.get('sku') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const unitOfMeasure = String(formData.get('unitOfMeasure') ?? '').trim();
  const barcode = String(formData.get('barcode') ?? '').trim();
  const reorderPointRaw = formData.get('reorderPoint');
  const reorderQuantityRaw = formData.get('reorderQuantity');

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
    });
    revalidatePath('/dashboard/products');
    return { error: null, success: `Added ${product.sku} — ${product.name}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not create product.', success: null };
  }
}
