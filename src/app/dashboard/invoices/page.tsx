import { customerRepository, invoiceRepository, salesOrderRepository } from '@/lib/data';
import { PaymentLine } from '@/app/dashboard/invoices/payment-line';
import { getNowMs } from '@/lib/now';
import type { InvoiceStatus } from '@/lib/domain/inventory';

export default async function InvoicesPage() {
  const [invoices, customers, orders] = await Promise.all([
    invoiceRepository.list(),
    customerRepository.list(),
    salesOrderRepository.list(),
  ]);

  const customerById = new Map(customers.map((c) => [c.id, c]));
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const now = getNowMs();

  const totalOutstanding = invoices
    .filter((i) => i.status === 'unpaid' || i.status === 'partially_paid')
    .reduce((sum, i) => sum + (i.total - i.amountPaid), 0);
  const overdueCount = invoices.filter(
    (i) => (i.status === 'unpaid' || i.status === 'partially_paid') && new Date(i.dueAt).getTime() < now
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Invoicing & billing</h1>
        <p className="text-[0.86rem] text-text-muted">
          One VAT-compliant invoice per dispatched sales order. Generate one from the{' '}
          <a href="/dashboard/sales" className="text-accent hover:underline">
            Sales & dispatch
          </a>{' '}
          page once an order is dispatched.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatTile
          label="Outstanding (unpaid + partial)"
          value={`R ${totalOutstanding.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <StatTile label="Overdue invoices" value={overdueCount.toString()} tone={overdueCount > 0 ? 'warning' : 'default'} />
      </section>

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">Invoices</h2>
        </div>
        {invoices.length === 0 ? (
          <p className="px-5 py-6 text-[0.85rem] text-text-faint">No invoices generated yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-[0.86rem]">
              <thead>
                <tr className="text-left text-text-faint">
                  <th className="px-5 py-2.5 font-medium">Invoice</th>
                  <th className="px-5 py-2.5 font-medium">Customer</th>
                  <th className="px-5 py-2.5 font-medium">Order</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Subtotal</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">VAT (15%)</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Total</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Due</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const outstanding = Math.round((inv.total - inv.amountPaid) * 100) / 100;
                  const dueDate = new Date(inv.dueAt);
                  const ageingDays = Math.floor((now - dueDate.getTime()) / (24 * 60 * 60 * 1000));
                  const isOverdue = (inv.status === 'unpaid' || inv.status === 'partially_paid') && ageingDays > 0;
                  return (
                    <tr key={inv.id} className="border-t border-accent/[0.08]">
                      <td className="px-5 py-3 font-mono-brand text-[0.78rem] text-text">{inv.invoiceNumber}</td>
                      <td className="px-5 py-3 text-text-muted">{customerById.get(inv.customerId)?.name}</td>
                      <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text-faint">
                        {orderById.get(inv.salesOrderId)?.orderNumber}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-text-muted">
                        R {inv.subtotal.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-text-muted">
                        R {inv.vatAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-text">
                        R {inv.total.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-text-muted">
                        {dueDate.toLocaleDateString('en-ZA')}
                        {isOverdue && (
                          <span className="ml-2 rounded-full bg-danger/15 px-2 py-0.5 text-[0.68rem] font-semibold text-[#f3a99a]">
                            {ageingDays}d overdue
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <StatusPill status={inv.status} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        {(inv.status === 'unpaid' || inv.status === 'partially_paid') && (
                          <PaymentLine invoiceId={inv.id} outstanding={outstanding} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatTile({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warning' }) {
  return (
    <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
      <div className="text-[0.78rem] font-semibold text-text-muted">{label}</div>
      <div className={`mt-1.5 font-display text-[1.6rem] font-medium tabular-nums ${tone === 'warning' && value !== '0' ? 'text-danger' : 'text-text'}`}>
        {value}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: InvoiceStatus }) {
  const styles: Record<InvoiceStatus, string> = {
    unpaid: 'bg-danger/15 text-[#f3a99a]',
    partially_paid: 'bg-accent/15 text-accent',
    paid: 'bg-white/5 text-text-muted',
    cancelled: 'bg-white/5 text-text-faint',
  };
  const labels: Record<InvoiceStatus, string> = {
    unpaid: 'Unpaid',
    partially_paid: 'Partially paid',
    paid: 'Paid',
    cancelled: 'Cancelled',
  };
  return <span className={`rounded-full px-2 py-0.5 text-[0.72rem] font-semibold ${styles[status]}`}>{labels[status]}</span>;
}
