import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { stockValue } from '@/store/engine';
import { roles } from '@/store/seed';
import { hasPermission } from '@/store/permissions';
import { useCurrentUser, useStore, scopeFor, STORE_LOCATION_ID, type ActionResult } from '@/store/useStore';
import { inputClass, selectClass } from '@/ui/form-control-classes';
import { Feedback } from '@/ui/Feedback';
import { ScanRow, useScanRow } from '@/ui/ScanRow';
import { ScanToCount } from '@/ui/ScanToCount';
import { HelpPopup } from '@/ui/HelpPopup';
import type { SalesOrderStatus } from '@/store/types';

/**
 * Requisitions & transfers — the merged page.
 *
 * One page, one record list, but two business kinds preserved underneath:
 *   requisition  Store → Asset   (an ASK; can be partially fulfilled)
 *   transfer     Asset → Asset, or Asset → Store (a MOVE / a return)
 *
 * The kind is derived from the chosen source and destination rather than
 * asked for separately — picking Store as the source IS a requisition, and
 * anything leaving an asset IS a transfer. That keeps the form to one step
 * while keeping the records distinguishable for reporting and audit.
 *
 * Admin sees everything here and can raise nothing: the create form is
 * hidden for admin, and the store refuses the action anyway.
 */
export function RequisitionsTransfersPage() {
  const [searchParams] = useSearchParams();
  const barcode = searchParams.get('barcode');

  const session = useCurrentUser();
  const products = useStore((s) => s.products);
  const locations = useStore((s) => s.locations);
  const ledger = useStore((s) => s.ledger);
  const orders = useStore((s) => s.salesOrders);
  const createSalesOrder = useStore((s) => s.createSalesOrder);
  const confirmSalesOrder = useStore((s) => s.confirmSalesOrder);
  const fulfilSalesOrder = useStore((s) => s.fulfilSalesOrder);
  const cancelSalesOrder = useStore((s) => s.cancelSalesOrder);

  const [result, setResult] = useState<ActionResult | null>(null);
  const [rowResult, setRowResult] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const { message, matchBarcode, productSelectRef, quantityRef } = useScanRow(products, barcode);

  const roleName = session ? roles.find((r) => r.id === session.roleId)?.name ?? '' : '';
  const { focusLocationId } = scopeFor(session, roleName);
  // Admin holds neither permission — this is what hides the create form.
  const canInitiate =
    !!session && (hasPermission(session, 'manage_sales_orders') || hasPermission(session, 'manage_transfers'));

  const productById = new Map(products.map((p) => [p.id, p]));
  const locationById = new Map(locations.map((l) => [l.id, l]));
  const sorted = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  /**
   * Overview cards, scoped to the viewer: Admin sees the whole organisation,
   * Store sees the Store, an Engineer sees their own asset. Same three
   * measures the Overview page uses, so the cards stay consistent.
   */
  const cards = useMemo(() => {
    const rows = Object.values(ledger).filter(
      (e) => (focusLocationId ? e.warehouseId === focusLocationId : true) && e.quantityOnHand > 0
    );
    const skus = new Set(rows.map((r) => r.productId)).size;
    const value = rows.reduce((sum, r) => sum + stockValue(r), 0);
    const belowReorder = rows.filter((r) => {
      const p = productById.get(r.productId);
      return p?.reorderPoint != null && r.quantityOnHand < p.reorderPoint;
    }).length;
    const outstanding = orders
      .filter((o) => o.status === 'confirmed' || o.status === 'partially_fulfilled')
      .filter((o) => (focusLocationId ? o.toLocationId === focusLocationId || o.fromLocationId === focusLocationId : true))
      .reduce((sum, o) => sum + (o.quantityOrdered - o.quantityReceived), 0);
    return { skus, value, belowReorder, outstanding };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger, orders, focusLocationId, products]);

  const scopeLabel = focusLocationId ? locationById.get(focusLocationId)?.name ?? 'your location' : 'All locations';

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const fromLocationId = String(data.get('fromLocationId'));
    const toLocationId = String(data.get('toLocationId'));
    setPending(true);
    const r = createSalesOrder({
      // Source decides the business kind: from the Store it's a request for
      // stock; from an asset it's a physical move.
      kind: fromLocationId === STORE_LOCATION_ID ? 'requisition' : 'transfer',
      fromLocationId,
      toLocationId,
      productId: String(data.get('productId')),
      quantity: Number(data.get('quantity')),
      unitPrice: Number(data.get('unitPrice')),
    });
    setPending(false);
    setResult(r);
    if (r.ok) form.reset();
  }

  return (
    <div className="flex flex-col gap-6">
      <HelpPopup sectionKey="requisitions" />

      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Requisitions &amp; transfers</h1>
        <p className="text-[0.86rem] text-text-muted">
          Moving stock between the Store and assets. A requisition requests stock from the Store; a transfer
          moves it between assets, or returns it to the Store.
        </p>
      </div>

      {/* Same card component/markup as the Overview page, scoped to the viewer. */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={`SKUs — ${scopeLabel}`} value={cards.skus.toLocaleString()} />
        <StatTile
          label="Stock value"
          value={`R ${cards.value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <StatTile label="Below reorder point" value={cards.belowReorder.toString()} tone={cards.belowReorder > 0 ? 'warning' : 'default'} />
        <StatTile label="Outstanding units" value={cards.outstanding.toLocaleString()} tone={cards.outstanding > 0 ? 'warning' : 'default'} />
      </section>

      {canInitiate ? (
        <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
          <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">New requisition or transfer</h2>
          <p className="mb-4 text-[0.83rem] text-text-muted">
            Created as a draft — nothing is reserved until it&apos;s approved, and nothing moves until it&apos;s
            fulfilled. Choosing the Store as the source raises a requisition; any other source is a transfer.
          </p>

          <ScanRow onMatch={matchBarcode} message={message} />

          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <label className="flex flex-col gap-1.5">
              <span className="text-[0.75rem] font-semibold text-text-muted">From</span>
              <select name="fromLocationId" required defaultValue={STORE_LOCATION_ID} className={selectClass}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[0.75rem] font-semibold text-text-muted">To</span>
              <select
                name="toLocationId"
                required
                defaultValue={focusLocationId ?? locations.find((l) => l.kind === 'asset')?.id}
                className={selectClass}
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 lg:col-span-2">
              <span className="text-[0.75rem] font-semibold text-text-muted">Product</span>
              <select name="productId" required ref={productSelectRef} className={selectClass}>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[0.75rem] font-semibold text-text-muted">Quantity</span>
              <input ref={quantityRef} type="number" name="quantity" min="0.001" step="0.001" required placeholder="0" className={inputClass} />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[0.75rem] font-semibold text-text-muted">Unit value (R)</span>
              <input type="number" name="unitPrice" min="0" step="0.01" required placeholder="0.00" className={inputClass} />
            </label>

            <div className="flex items-end lg:col-span-6">
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
              >
                {pending ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>

          <Feedback result={result} />
        </div>
      ) : (
        <div className="rounded-xl border border-accent/30 bg-accent/[0.08] px-4 py-3 text-[0.82rem] text-accent">
          Admin is an oversight role — you can review every requisition and transfer below, but raising and
          fulfilling them is done by Engineers and the Store.
        </div>
      )}

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">Movements</h2>
          <p className="text-[0.83rem] text-text-muted">
            Store → Asset, Asset → Asset and Asset → Store, with requested, received and outstanding
            quantities tracked on every line.
          </p>
          <Feedback result={rowResult} />
        </div>
        {sorted.length === 0 ? (
          <p className="px-5 py-6 text-[0.85rem] text-text-faint">Nothing raised yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-[0.86rem]">
              <thead>
                <tr className="text-left text-text-faint">
                  <th className="px-5 py-2.5 font-medium">Ref</th>
                  <th className="px-5 py-2.5 font-medium">Type</th>
                  <th className="px-5 py-2.5 font-medium">Route</th>
                  <th className="px-5 py-2.5 font-medium">Product</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Requested</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Received</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Outstanding</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((o) => {
                  const product = productById.get(o.productId);
                  const outstanding = Math.round((o.quantityOrdered - o.quantityReceived) * 1000) / 1000;
                  const open = o.status === 'confirmed' || o.status === 'partially_fulfilled';
                  return (
                    <tr key={o.id} className="border-t border-accent/[0.08]">
                      <td className="px-5 py-3 font-mono-brand text-[0.78rem] text-text">{o.orderNumber}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${
                            o.kind === 'requisition' ? 'bg-accent/15 text-accent' : 'bg-white/5 text-text-muted'
                          }`}
                        >
                          {o.kind === 'requisition' ? 'Requisition' : 'Transfer'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-text-muted">
                        {locationById.get(o.fromLocationId)?.name} <span className="text-text-faint">→</span>{' '}
                        {locationById.get(o.toLocationId)?.name}
                      </td>
                      <td className="px-5 py-3 text-text-muted">
                        {product?.sku} <span className="text-text-faint">— {product?.name}</span>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-text">
                        {o.quantityOrdered.toLocaleString()} {product?.unitOfMeasure}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-text-muted">
                        {o.quantityReceived.toLocaleString()}
                      </td>
                      <td className={`px-5 py-3 text-right tabular-nums ${outstanding > 0 && open ? 'text-danger' : 'text-text-muted'}`}>
                        {outstanding > 0 ? outstanding.toLocaleString() : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <StatusPill status={o.status} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        {canInitiate && (
                          <div className="flex flex-col items-end gap-2">
                            {o.status === 'draft' && (
                              <div className="flex gap-3">
                                <button
                                  type="button"
                                  onClick={() => setRowResult(confirmSalesOrder(o.id))}
                                  className="text-[0.8rem] font-semibold text-accent hover:text-accent-hover"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRowResult(cancelSalesOrder(o.id))}
                                  className="text-[0.8rem] font-semibold text-text-faint hover:text-danger"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                            {open && (
                              <FulfilLine
                                orderId={o.id}
                                outstanding={outstanding}
                                unit={product?.unitOfMeasure ?? 'ea'}
                                expectedBarcode={product?.barcode ?? null}
                                onResult={setRowResult}
                                onCancel={() => setRowResult(cancelSalesOrder(o.id))}
                                fulfil={fulfilSalesOrder}
                              />
                            )}
                          </div>
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

/**
 * Partial-fulfilment control. The quantity is the ACTUAL amount handed over
 * and can be produced two ways — scanned (one increment per scan, USB or
 * camera) or typed — with the number itself always editable and always the
 * figure that gets posted. It's capped at the outstanding amount, and a
 * short entry leaves the record open with the shortfall still reserved.
 */
function FulfilLine({
  orderId,
  outstanding,
  unit,
  expectedBarcode,
  onResult,
  onCancel,
  fulfil,
}: {
  orderId: string;
  outstanding: number;
  unit: string;
  expectedBarcode: string | null;
  onResult: (r: ActionResult) => void;
  onCancel: () => void;
  fulfil: (id: string, qty: number) => ActionResult;
}) {
  const [pending, setPending] = useState(false);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <ScanToCount
        expectedBarcode={expectedBarcode}
        max={outstanding}
        unit={unit}
        pending={pending}
        submitLabel="Fulfil"
        onSubmit={(qty) => {
          setPending(true);
          onResult(fulfil(orderId, qty));
          setPending(false);
        }}
      />
      <button type="button" onClick={onCancel} className="text-[0.76rem] font-semibold text-text-faint hover:text-danger">
        Cancel
      </button>
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

function StatusPill({ status }: { status: SalesOrderStatus }) {
  const styles: Record<SalesOrderStatus, string> = {
    draft: 'bg-white/5 text-text-muted',
    confirmed: 'bg-accent/15 text-accent',
    partially_fulfilled: 'bg-accent/15 text-accent',
    dispatched: 'bg-white/5 text-text-muted',
    cancelled: 'bg-danger/15 text-[#f3a99a]',
  };
  const labels: Record<SalesOrderStatus, string> = {
    draft: 'Draft',
    confirmed: 'Approved',
    partially_fulfilled: 'Partially fulfilled',
    dispatched: 'Fulfilled',
    cancelled: 'Cancelled',
  };
  return <span className={`rounded-full px-2 py-0.5 text-[0.72rem] font-semibold ${styles[status]}`}>{labels[status]}</span>;
}
