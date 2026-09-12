'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { auditLogRepository, supplierRepository } from '@/lib/data';
import { hasPermission } from '@/lib/permissions';

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
  if (!(await hasPermission(session, 'manage_suppliers'))) {
    return { error: 'Your role does not have permission to manage suppliers.', success: null };
  }

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

export async function updateSupplierAction(
  _prevState: SupplierFormState,
  formData: FormData
): Promise<SupplierFormState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };
  if (!(await hasPermission(session, 'manage_suppliers'))) {
    return { error: 'Your role does not have permission to manage suppliers.', success: null };
  }

  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const contactEmail = String(formData.get('contactEmail') ?? '').trim();
  const contactPhone = String(formData.get('contactPhone') ?? '').trim();
  const address = String(formData.get('address') ?? '').trim();

  if (!id) return { error: 'Missing supplier reference.', success: null };
  if (!name) return { error: 'Supplier name is required.', success: null };

  try {
    const supplier = await supplierRepository.update(id, {
      name,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
      address: address || null,
    });
    await auditLogRepository.write({
      tableName: 'suppliers',
      recordId: id,
      action: 'update',
      changedBy: session.id,
      after: supplier,
    });
    revalidatePath('/dashboard/suppliers');
    revalidatePath('/dashboard/receiving');
    return { error: null, success: `Updated ${supplier.name}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not update the supplier.', success: null };
  }
}

export async function deleteSupplierAction(
  _prevState: SupplierFormState,
  formData: FormData
): Promise<SupplierFormState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };
  if (!(await hasPermission(session, 'manage_suppliers'))) {
    return { error: 'Your role does not have permission to manage suppliers.', success: null };
  }

  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Missing supplier reference.', success: null };

  try {
    await supplierRepository.delete(id);
    await auditLogRepository.write({
      tableName: 'suppliers',
      recordId: id,
      action: 'delete',
      changedBy: session.id,
    });
    revalidatePath('/dashboard/suppliers');
    revalidatePath('/dashboard/receiving');
    return { error: null, success: 'Supplier deleted.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not delete the supplier.', success: null };
  }
}
