import {
  adjustmentReasonRepository,
  productRepository,
  stockAdjustmentRepository,
  warehouseRepository,
} from '@/lib/data';
import { getSession } from '@/lib/auth';
import { AdjustmentForm } from '@/app/dashboard/adjustments/adjustment-form';
import { decideAdjustmentAction } from '@/app/dashboard/adjustments/actions';

export default async function AdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ barcode?: string }>;
}) {
  const { barcode } = await searchParams;
  const [session, products, warehouses, reasonCodes, adjustments] = await Promise.all([
    getSession(),
    productRepository.list(),
    warehouseRepository.list(),
    adjustmentReasonRepository.list(),
    stockAdjustmentRepository.list(),
  ]);

  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  const reasonById = new Map(reasonCodes.map((r) => [r.id, r]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Write-offs & adjustments</h1>
        <p className="text-[0.86rem] text-text-muted">Reason-coded, approval-gated stock corrections.</p>
      </div>

      {session && !session.mfaEnrolled && (
        <div className="rounded-xl border border-accent/30 bg-accent/[0.08] px-4 py-3 text-[0.82rem] text-accent-strong">
          Approving or rejecting requires 2FA. Enable it under{' '}
          <a href="/dashboard/security" className="font-semibold underline">
            Security
          </a>{' '}
          first - requesting an adjustment doesn&apos;t need it.
        </div>
      )}

      <AdjustmentForm products={products} warehouses={warehouses} reasonCodes={reasonCodes} initialBarcode={barcode} />

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">Adjustment requests</h2>
        </div>
        {adjustments.length === 0 ? (
          <p className="px-5 py-6 text-[0.85rem] text-text-faint">No adjustments requested yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[0.86rem]">
              <thead>
                <tr className="text-left text-text-faint">
                  <th className="px-5 py-2.5 font-medium">Adjustment</th>
                  <th className="px-5 py-2.5 font-medium">Store</th>
                  <th className="px-5 py-2.5 font-medium">Reason</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((a) => (
                  <tr key={a.id} className="border-t border-accent/[0.08]">
                    <td className="px-5 py-3 font-mono-brand text-[0.78rem] text-text">{a.adjustmentNumber}</td>
                    <td className="px-5 py-3 text-text-muted">{warehouseById.get(a.warehouseId)?.code}</td>
                    <td className="px-5 py-3 text-text-muted">{reasonById.get(a.reasonCodeId)?.code}</td>
                    <td className="px-5 py-3">
                      <StatusPill status={a.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      {a.status === 'pending_approval' && (
                        <div className="flex justify-end gap-3">
                          <form action={decideAdjustmentAction.bind(null, a.id, 'approved')}>
                            <button type="submit" className="text-[0.8rem] font-semibold text-accent-strong hover:text-accent-hover">
                              Approve
                            </button>
                          </form>
                          <form action={decideAdjustmentAction.bind(null, a.id, 'rejected')}>
                            <button type="submit" className="text-[0.8rem] font-semibold text-text-faint hover:text-danger">
                              Reject
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

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending_approval: 'bg-accent/15 text-accent-strong',
    approved: 'bg-neutral-soft text-text-muted',
    rejected: 'bg-danger/15 text-danger-text',
  };
  const labels: Record<string, string> = {
    pending_approval: 'Pending approval',
    approved: 'Approved',
    rejected: 'Rejected',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[0.72rem] font-semibold ${styles[status] ?? ''}`}>
      {labels[status] ?? status}
    </span>
  );
}
