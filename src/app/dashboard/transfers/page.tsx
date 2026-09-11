import { productRepository, transferRepository, warehouseRepository } from '@/lib/data';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { AccessDenied } from '@/components/access-denied';
import { TransferForm } from '@/app/dashboard/transfers/transfer-form';
import { completeTransferAction } from '@/app/dashboard/transfers/actions';
import { ScanToReceiveButton } from '@/app/dashboard/transfers/scan-to-receive-button';
import type { Warehouse } from '@/lib/domain/inventory';

// Same name-for-a-station/code-for-a-store convention every other picker in
// the app uses - a station's auto-generated code (e.g. STA-A1B2C3D4) means
// nothing in a history table where a Stores-initiated Engineer-station
// return (see TransferForm's "From" picker) is exactly what this needs to
// show clearly.
function warehouseLabel(w: Warehouse | undefined): string {
  if (!w) return '-';
  return w.type === 'engineer_station' ? w.name : w.code;
}

export default async function TransfersPage() {
  const session = await getSession();
  if (!session) {
    return <AccessDenied title="Inter-store transfers" message="Your session has expired. Please sign in again." />;
  }
  // Engineers don't move inventory between stores - that's Stores' job.
  if (!(await hasPermission(session, 'manage_transfers'))) {
    return (
      <AccessDenied
        title="Inter-store transfers"
        message="Moving stock between stores is a Stores function. Your role does not have access to this page."
      />
    );
  }

  const [products, warehouses, transfers] = await Promise.all([
    productRepository.list(),
    warehouseRepository.list(),
    transferRepository.list(),
  ]);

  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  const productById = new Map(products.map((p) => [p.id, p]));
  // What each transfer actually IS - see TransferRepository.getLine's own
  // doc comment for why this still answers after completion, not just
  // in-transit.
  const lineByTransferId = new Map(
    await Promise.all(transfers.map(async (t) => [t.id, await transferRepository.getLine(t.id)] as const))
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Inter-store transfers</h1>
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
            <table className="w-full min-w-[780px] border-collapse text-[0.86rem]">
              <thead>
                <tr className="text-left text-text-faint">
                  <th className="px-5 py-2.5 font-medium">Transfer</th>
                  <th className="px-5 py-2.5 font-medium">Product</th>
                  <th className="px-5 py-2.5 font-medium">From</th>
                  <th className="px-5 py-2.5 font-medium">To</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => {
                  const fromWarehouse = warehouseById.get(t.fromWarehouseId);
                  const line = lineByTransferId.get(t.id);
                  const product = line ? productById.get(line.productId) : undefined;
                  // A RETURN is a transfer whose source is an Engineer's own
                  // station - the shape requestReturnToStoresAction always
                  // creates. A plain store-to-store transfer (Admin/Stores
                  // moving stock between stores) is not a return and keeps
                  // the simple, ungated completion it always had.
                  const isReturn = fromWarehouse?.type === 'engineer_station';
                  return (
                    <tr key={t.id} className="border-t border-accent/[0.08]">
                      <td className="px-5 py-3 font-mono-brand text-[0.78rem] text-text">{t.transferNumber}</td>
                      <td className="px-5 py-3 text-text-muted">
                        {product ? (
                          <>
                            <span className="text-text">{product.sku}</span>
                            {line && (
                              <span className="ml-1.5 text-text-faint">
                                · {line.quantity.toLocaleString()} {product.unitOfMeasure}
                              </span>
                            )}
                          </>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-5 py-3 text-text-muted">{warehouseLabel(fromWarehouse)}</td>
                      <td className="px-5 py-3 text-text-muted">{warehouseLabel(warehouseById.get(t.toWarehouseId))}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[0.72rem] font-semibold ${
                            t.status === 'in_transit'
                              ? 'bg-accent/15 text-accent-strong'
                              : 'bg-neutral-soft text-text-muted'
                          }`}
                        >
                          {t.status === 'in_transit' ? 'In transit' : 'Completed'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {t.status === 'in_transit' &&
                          (isReturn && line && product ? (
                            <ScanToReceiveButton
                              transferId={t.id}
                              productSku={product.sku}
                              productName={product.name}
                              productBarcode={product.barcode}
                              quantity={line.quantity}
                              unitOfMeasure={product.unitOfMeasure}
                              fromLabel={warehouseLabel(fromWarehouse)}
                            />
                          ) : (
                            <form action={completeTransferAction.bind(null, t.id)}>
                              <button
                                type="submit"
                                className="text-[0.8rem] font-semibold text-accent-strong hover:text-accent-hover"
                              >
                                Mark received
                              </button>
                            </form>
                          ))}
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
