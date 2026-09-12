'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { auditLogRepository, customerRepository } from '@/lib/data';
import { hasPermission } from '@/lib/permissions';

export interface CustomerFormState {
  error: string | null;
  success: string | null;
}

export async function createCustomerAction(
  _prevState: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };
  if (!(await hasPermission(session, 'manage_customers'))) {
    return { error: 'Your role does not have permission to manage departments.', success: null };
  }

  const name = String(formData.get('name') ?? '').trim();
  const contactEmail = String(formData.get('contactEmail') ?? '').trim();
  const contactPhone = String(formData.get('contactPhone') ?? '').trim();
  const address = String(formData.get('address') ?? '').trim();

  if (!name) return { error: 'Department name is required.', success: null };

  const customer = await customerRepository.create({
    name,
    contactEmail: contactEmail || null,
    contactPhone: contactPhone || null,
    address: address || null,
  });
  revalidatePath('/dashboard/customers');
  revalidatePath('/dashboard/sales');
  return { error: null, success: `Added ${customer.name}.` };
}

export async function updateCustomerAction(
  _prevState: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };
  if (!(await hasPermission(session, 'manage_customers'))) {
    return { error: 'Your role does not have permission to manage departments.', success: null };
  }

  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const contactEmail = String(formData.get('contactEmail') ?? '').trim();
  const contactPhone = String(formData.get('contactPhone') ?? '').trim();
  const address = String(formData.get('address') ?? '').trim();

  if (!id) return { error: 'Missing department reference.', success: null };
  if (!name) return { error: 'Department name is required.', success: null };

  try {
    const customer = await customerRepository.update(id, {
      name,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
      address: address || null,
    });
    await auditLogRepository.write({
      tableName: 'customers',
      recordId: id,
      action: 'update',
      changedBy: session.id,
      after: customer,
    });
    revalidatePath('/dashboard/customers');
    revalidatePath('/dashboard/sales');
    return { error: null, success: `Updated ${customer.name}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not update the department.', success: null };
  }
}

export async function deleteCustomerAction(
  _prevState: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };
  if (!(await hasPermission(session, 'manage_customers'))) {
    return { error: 'Your role does not have permission to manage departments.', success: null };
  }

  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Missing department reference.', success: null };

  try {
    await customerRepository.delete(id);
    await auditLogRepository.write({
      tableName: 'customers',
      recordId: id,
      action: 'delete',
      changedBy: session.id,
    });
    revalidatePath('/dashboard/customers');
    revalidatePath('/dashboard/sales');
    return { error: null, success: 'Department deleted.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not delete the department.', success: null };
  }
}
