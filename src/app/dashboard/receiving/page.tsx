import { productRepository, receivingRepository, supplierRepository, warehouseRepository } from '@/lib/data';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { AccessDenied } from '@/components/access-denied';
import { ReceiveForm } from '@/app/dashboard/receiving/receive-form';

export default async function ReceivingPage({
  searchParams,
}: {
  searchParams: Promise<{ barcode?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    return <AccessDenied title="Goods receiving" message="Your session has expired. Please sign in again." />;
  }
  // Receiving is a Stores function - an Engineer requests stock, they don't
  // receive it in. Route-level gate; the receive action itself already
  // requires `manage_receiving` too.
  if (!(await hasPermission(session, 'manage_receiving'))) {
    return (
      <AccessDenied
        title="Goods receiving"
        message="Receiving stock is a Stores function. Your role does not have access to this page."
      />
    );
  }

  const { barcode } = await searchParams;
  const [suppliers, warehouses, products, receipts] = await Promise.all([
    supplierRepository.list(),
    warehouseRepository.list(),
    productRepository.list(),
    receivingRepository.listRecentReceipts(),
  ]);

  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Goods receiving</h1>
        <p className="text-[0.86rem] text-text-muted">PO-linked receipts, posted straight into the stock ledger.</p>
      </div>

      {/* Real physical stores only - goods from a supplier land in a store,
          never straight into an Engineer's personal station. */}
      <ReceiveForm
        suppliers={suppliers}
        warehouses={warehouses.filter((w) => w.type === 'store')}
        products={products}
        initialBarcode={barcode}
      />

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">Recent receipts</h2>
        </div>
        {receipts.length === 0 ? (
          <p className="px-5 py-6 text-[0.85rem] text-text-faint">No receipts posted yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[0.86rem]">
              <thead>
                <tr className="text-left text-text-faint">
                  <th className="px-5 py-2.5 font-medium">GRN</th>
                  <th className="px-5 py-2.5 font-medium">Store</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r) => (
                  <tr key={r.id} className="border-t border-accent/[0.08]">
                    <td className="px-5 py-3 font-mono-brand text-[0.78rem] text-text">{r.grnNumber}</td>
                    <td className="px-5 py-3 text-text-muted">{warehouseById.get(r.warehouseId)?.code ?? '-'}</td>
                    <td className="px-5 py-3 text-text-muted capitalize">{r.status}</td>
                    <td className="px-5 py-3 text-text-muted">
                      {r.receivedAt ? new Date(r.receivedAt).toLocaleString('en-ZA') : '-'}
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
