import { productRepository, transferRepository, warehouseRepository } from '@/lib/data';
import { TransferForm } from '@/app/dashboard/transfers/transfer-form';
import { completeTransferAction } from '@/app/dashboard/transfers/actions';

export default async function TransfersPage() {
  const [products, warehouses, transfers] = await Promise.all([
    productRepository.list(),
    warehouseRepository.list(),
    transferRepository.list(),
  ]);

  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Inter-warehouse transfers</h1>
        <p className="text-[0.86rem] text-text-muted">In-transit stock is out of the source ledger but not yet in the destination&apos;s.</p>
      </div>

      <TransferForm products={products} warehouses={warehouses} />

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">Transfers</h2>
        </div>
        {transfers.length === 0 ? (
          <p className="px-5 py-6 text-[0.85rem] text-text-faint">No transfers yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[0.86rem]">
              <thead>
                <tr className="text-left text-text-faint">
                  <th className="px-5 py-2.5 font-medium">Transfer</th>
                  <th className="px-5 py-2.5 font-medium">From</th>
                  <th className="px-5 py-2.5 font-medium">To</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t.id} className="border-t border-accent/[0.08]">
                    <td className="px-5 py-3 font-mono-brand text-[0.78rem] text-text">{t.transferNumber}</td>
                    <td className="px-5 py-3 text-text-muted">{warehouseById.get(t.fromWarehouseId)?.code}</td>
                    <td className="px-5 py-3 text-text-muted">{warehouseById.get(t.toWarehouseId)?.code}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.72rem] font-semibold ${
                          t.status === 'in_transit'
                            ? 'bg-accent/15 text-accent'
                            : 'bg-white/5 text-text-muted'
                        }`}
                      >
                        {t.status === 'in_transit' ? 'In transit' : 'Completed'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {t.status === 'in_transit' && (
                        <form action={completeTransferAction.bind(null, t.id)}>
                          <button type="submit" className="text-[0.8rem] font-semibold text-accent hover:text-accent-hover">
                            Mark received
                          </button>
                        </form>
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
