'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { supplierRepository } from '@/lib/data';

export interface SupplierFormState {
  error: string | null;
  success: string | null;
}

export async function createSupplierAction(
  _prevState: SupplierFormState,
  formData: FormData
): Promise<SupplierFormState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };

  const name = String(formData.get('name') ?? '').trim();
  const contactEmail = String(formData.get('contactEmail') ?? '').trim();
  const contactPhone = String(formData.get('contactPhone') ?? '').trim();
  const address = String(formData.get('address') ?? '').trim();

  if (!name) return { error: 'Supplier name is required.', success: null };

  const supplier = await supplierRepository.create({
    name,
    contactEmail: contactEmail || null,
    contactPhone: contactPhone || null,
    address: address || null,
  });
  revalidatePath('/dashboard/suppliers');
  revalidatePath('/dashboard/receiving');
  return { error: null, success: `Added ${supplier.name}.` };
}
