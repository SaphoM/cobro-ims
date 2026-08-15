'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { invoiceRepository } from '@/lib/data';

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error('Session expired.');
  return session;
}

export async function generateInvoiceAction(salesOrderId: string) {
  'use server';
  const session = await requireSession();
  await invoiceRepository.generateFromSalesOrder(salesOrderId, session.id);
  revalidatePath('/dashboard/sales');
  revalidatePath('/dashboard/invoices');
}

export interface RecordPaymentFormState {
  error: string | null;
  success: string | null;
}

export async function recordPaymentAction(
  _prevState: RecordPaymentFormState,
  formData: FormData
): Promise<RecordPaymentFormState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };

  const invoiceId = String(formData.get('invoiceId') ?? '');
  const amount = Number(formData.get('amount'));
  if (!invoiceId) return { error: 'Missing invoice.', success: null };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Payment amount must be a positive number.', success: null };
  }

  try {
    const { invoice } = await invoiceRepository.recordPayment(invoiceId, amount, session.id);
    revalidatePath('/dashboard/invoices');
    return {
      error: null,
      success: `Payment of R${amount.toFixed(2)} recorded — ${invoice.invoiceNumber} is now ${invoice.status.replace('_', ' ')}.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not record the payment.', success: null };
  }
}
