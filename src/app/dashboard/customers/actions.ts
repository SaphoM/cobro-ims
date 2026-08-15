'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { customerRepository } from '@/lib/data';

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

  const name = String(formData.get('name') ?? '').trim();
  const contactEmail = String(formData.get('contactEmail') ?? '').trim();
  const contactPhone = String(formData.get('contactPhone') ?? '').trim();
  const address = String(formData.get('address') ?? '').trim();

  if (!name) return { error: 'Customer name is required.', success: null };

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
