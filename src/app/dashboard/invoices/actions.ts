'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { auditLogRepository, invoiceRepository } from '@/lib/data';
import { hasPermission, requirePermission } from '@/lib/permissions';

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error('Session expired.');
  return session;
}

export async function generateInvoiceAction(salesOrderId: string) {
  'use server';
  const session = await requireSession();
  await requirePermission(session, 'manage_invoices');
  const invoice = await invoiceRepository.generateFromSalesOrder(salesOrderId, session.id);
  await auditLogRepository.write({
    tableName: 'invoices',
    recordId: invoice.id,
    action: 'insert',
    changedBy: session.id,
    after: invoice,
  });
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
  if (!(await hasPermission(session, 'manage_invoices'))) {
    return { error: 'Your role does not have permission to record payments.', success: null };
  }

  const invoiceId = String(formData.get('invoiceId') ?? '');
  const amount = Number(formData.get('amount'));
  if (!invoiceId) return { error: 'Missing invoice.', success: null };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Payment amount must be a positive number.', success: null };
  }

  try {
    const { invoice, payment } = await invoiceRepository.recordPayment(invoiceId, amount, session.id);
    await auditLogRepository.write({
      tableName: 'invoice_payments',
      recordId: payment.id,
      action: 'insert',
      changedBy: session.id,
      after: payment,
    });
    revalidatePath('/dashboard/invoices');
    return {
      error: null,
      success: `Payment of R${amount.toFixed(2)} recorded — ${invoice.invoiceNumber} is now ${invoice.status.replace('_', ' ')}.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not record the payment.', success: null };
  }
}
