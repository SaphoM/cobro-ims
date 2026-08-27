import { useState } from 'react';
import { useStore, type ActionResult } from '@/store/useStore';
import { inputClass } from '@/ui/form-control-classes';
import { Feedback } from '@/ui/Feedback';
import type { InvoiceStatus } from '@/store/types';

/**
 * DORMANT — ported exactly as the original left it.
 *
 * Cobro IMS is internal MRO stock control: you don't VAT-invoice your own
 * maintenance department, so this module was taken out of the navigation and
 * nothing creates an invoice any more. It was NOT deleted, per the standing
 * "don't delete, mark dormant" principle — the code still works if you visit
 * the route directly, in case a genuine external customer-billing module is
 * ever wanted as its own separate decision.
 *
 * Reachable here at /#/dashboard/invoices, absent from the sidebar.
 */
export function InvoicesPage() {
  const invoices = useStore((s) => s.invoices);
  const customers = useStore((s) => s.customers);
  const recordPayment = useStore((s) => s.recordPayment);
  const issueCreditNote = useStore((s) => s.issueCreditNote);
  const [result, setResult] = useState<ActionResult | null>(null);

  const customerById = new Map(customers.map((c) => [c.id, c]));
  const sorted = [...invoices].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  const outstanding = (i: (typeof invoices)[number]) =>
    Math.round((i.total - i.amountPaid - i.creditedAmount) * 100) / 100;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Invoicing &amp; billing</h1>
        <p className="text-[0.86rem] text-text-muted">
          VAT invoices, payments and credit notes against dispatched orders.
        </p>
      </div>

      <div className="rounded-xl border border-accent/30 bg-accent/[0.08] px-4 py-3 text-[0.82rem] text-accent">
        <strong>Dormant module.</strong> Cobro IMS is internal MRO stock control — you don&apos;t VAT-invoice
        your own maintenance department — so this page was removed from the navigation and nothing creates
        an invoice any more. The code is kept, not deleted, in case a genuine external customer-billing
        module is ever needed as its own separate decision.
      </div>

      <Feedback result={result} />

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">{sorted.length} invoices</h2>
        </div>
        {sorted.length === 0 ? (
          <p className="px-5 py-6 text-[0.85rem] text-text-faint">
            No invoices — nothing in the current workflow creates one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-[0.86rem]">
              <thead>
                <tr className="text-left text-text-faint">
                  <th className="px-5 py-2.5 font-medium">Invoice</th>
                  <th className="px-5 py-2.5 font-medium">Customer</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Subtotal</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">VAT</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Total</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Credited</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Outstanding</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((inv) => (
                  <tr key={inv.id} className="border-t border-accent/[0.08]">
                    <td className="px-5 py-3 font-mono-brand text-[0.78rem] text-text">{inv.invoiceNumber}</td>
                    <td className="px-5 py-3 text-text-muted">{customerById.get(inv.customerId)?.name}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-text-muted">R {inv.subtotal.toFixed(2)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-text-muted">R {inv.vatAmount.toFixed(2)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-text">R {inv.total.toFixed(2)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-text-muted">R {inv.creditedAmount.toFixed(2)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-text">R {outstanding(inv).toFixed(2)}</td>
                    <td className="px-5 py-3">
                      <StatusPill status={inv.status} />
                    </td>
                    <td className="px-5 py-3">
                      {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                        <div className="flex flex-col items-end gap-2">
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const form = e.currentTarget;
                              setResult(recordPayment(inv.id, Number(new FormData(form).get('amount'))));
                              form.reset();
                            }}
                            className="flex items-center gap-2"
                          >
                            <input type="number" name="amount" min="0.01" step="0.01" required placeholder="Amount" className={`${inputClass} w-28 text-right`} />
                            <button type="submit" className="h-9 rounded-lg bg-accent px-3 py-1.5 text-[0.78rem] font-bold text-ink hover:bg-accent-hover">
                              Pay
                            </button>
                          </form>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const form = e.currentTarget;
                              const data = new FormData(form);
                              setResult(issueCreditNote(inv.id, Number(data.get('amount')), String(data.get('reason') ?? '')));
                              form.reset();
                            }}
                            className="flex items-center gap-2"
                          >
                            <input name="reason" required placeholder="Reason" className={`${inputClass} w-28`} />
                            <input type="number" name="amount" min="0.01" step="0.01" required placeholder="Amount" className={`${inputClass} w-28 text-right`} />
                            <button
                              type="submit"
                              className="h-9 rounded-lg border border-accent/30 bg-surface-2 px-3 py-1.5 text-[0.78rem] font-semibold text-accent hover:bg-accent/10"
                            >
                              Credit
                            </button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: InvoiceStatus }) {
  const styles: Record<InvoiceStatus, string> = {
    unpaid: 'bg-accent/15 text-accent',
    partially_paid: 'bg-accent/15 text-accent',
    paid: 'bg-white/5 text-text-muted',
    cancelled: 'bg-danger/15 text-[#f3a99a]',
  };
  const labels: Record<InvoiceStatus, string> = {
    unpaid: 'Unpaid',
    partially_paid: 'Partially paid',
    paid: 'Paid',
    cancelled: 'Cancelled',
  };
  return <span className={`rounded-full px-2 py-0.5 text-[0.72rem] font-semibold ${styles[status]}`}>{labels[status]}</span>;
}
