import { useState } from 'react';
import { stockValue } from '@/store/engine';
import { useStore, type ActionResult } from '@/store/useStore';
import { inputClass } from '@/ui/form-control-classes';
import { Feedback } from '@/ui/Feedback';
import { HelpPopup } from '@/ui/HelpPopup';

/**
 * Assets — the operational locations (machines, workshops) where stock is
 * used. This replaces the old Departments page.
 *
 * The important difference from Departments: an asset HOLDS STOCK. It's a
 * real location in the ledger, not just a name attached to a request. So
 * this page shows each asset's current holdings alongside its name and
 * description.
 */
export function AssetsPage() {
  const locations = useStore((s) => s.locations);
  const ledger = useStore((s) => s.ledger);
  const products = useStore((s) => s.products);
  const createAsset = useStore((s) => s.createAsset);
  const updateAsset = useStore((s) => s.updateAsset);

  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const assets = locations.filter((l) => l.kind === 'asset').sort((a, b) => a.name.localeCompare(b.name));
  const productById = new Map(products.map((p) => [p.id, p]));

  /** Current holdings at one asset, so the page shows what's actually there. */
  function holdingsFor(assetId: string) {
    return Object.values(ledger)
      .filter((e) => e.warehouseId === assetId && e.quantityOnHand > 0)
      .map((e) => ({ entry: e, product: productById.get(e.productId) }));
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setPending(true);
    const r = createAsset({ name: String(data.get('name')), description: String(data.get('description') ?? '') });
    setPending(false);
    setResult(r);
    if (r.ok) form.reset();
  }

  function handleUpdate(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const r = updateAsset(id, { name: String(data.get('name')), description: String(data.get('description') ?? '') });
    setResult(r);
    if (r.ok) setEditingId(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <HelpPopup sectionKey="assets" />

      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Assets</h1>
        <p className="text-[0.86rem] text-text-muted">
          The machines and workshops where stock is used. Each asset is a stock location in its own right —
          stock moves from the Store to an asset, between assets, and back to the Store.
        </p>
      </div>

      <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
        <h2 className="mb-4 font-display text-[1.05rem] font-medium text-text">Add an asset</h2>
        <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1.5 lg:col-span-2">
            <span className="text-[0.75rem] font-semibold text-text-muted">Asset name</span>
            <input name="name" required placeholder="Machine 5" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5 lg:col-span-2">
            <span className="text-[0.75rem] font-semibold text-text-muted">Asset description</span>
            <input name="description" placeholder="Production line machine 5" className={inputClass} />
          </label>
          <div className="flex items-end lg:col-span-4">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
            >
              {pending ? 'Adding…' : 'Add asset'}
            </button>
          </div>
        </form>
        <Feedback result={result} />
      </div>

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">{assets.length} assets</h2>
        </div>
        {assets.length === 0 ? (
          <p className="px-5 py-6 text-[0.85rem] text-text-faint">No assets yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[0.86rem]">
              <thead>
                <tr className="text-left text-text-faint">
                  <th className="px-5 py-2.5 font-medium">Asset</th>
                  <th className="px-5 py-2.5 font-medium">Description</th>
                  <th className="px-5 py-2.5 font-medium">Stock held</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Value</th>
                  <th className="px-5 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => {
                  const holdings = holdingsFor(a.id);
                  const value = holdings.reduce((sum, h) => sum + stockValue(h.entry), 0);
                  if (editingId === a.id) {
                    return (
                      <tr key={a.id} className="border-t border-accent/[0.08]">
                        <td colSpan={5} className="px-5 py-3">
                          <form onSubmit={(e) => handleUpdate(e, a.id)} className="flex flex-wrap items-end gap-3">
                            <label className="flex flex-1 min-w-[160px] flex-col gap-1.5">
                              <span className="text-[0.75rem] font-semibold text-text-muted">Asset name</span>
                              <input name="name" required defaultValue={a.name} className={inputClass} />
                            </label>
                            <label className="flex flex-[2] min-w-[200px] flex-col gap-1.5">
                              <span className="text-[0.75rem] font-semibold text-text-muted">Asset description</span>
                              <input name="description" defaultValue={a.description ?? ''} className={inputClass} />
                            </label>
                            <button
                              type="submit"
                              className="h-9 rounded-lg bg-accent px-4 py-1.5 text-[0.82rem] font-bold text-ink hover:bg-accent-hover"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="h-9 rounded-lg border border-accent/30 px-4 py-1.5 text-[0.82rem] font-semibold text-text-muted hover:text-accent"
                            >
                              Cancel
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={a.id} className="border-t border-accent/[0.08]">
                      <td className="px-5 py-3">
                        <div className="text-text">{a.name}</div>
                        <div className="font-mono-brand text-[0.72rem] text-text-faint">{a.code}</div>
                      </td>
                      <td className="px-5 py-3 text-text-muted">{a.description ?? '—'}</td>
                      <td className="px-5 py-3 text-text-muted">
                        {holdings.length === 0 ? (
                          <span className="text-text-faint">Nothing on hand</span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {holdings.map((h) => (
                              <span key={h.entry.productId} className="text-[0.8rem]">
                                {h.entry.quantityOnHand.toLocaleString()} {h.product?.unitOfMeasure}{' '}
                                <span className="font-mono-brand text-[0.72rem] text-text-faint">{h.product?.sku}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-text">
                        R {value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setEditingId(a.id)}
                          className="text-[0.8rem] font-semibold text-accent hover:text-accent-hover"
                        >
                          Edit
                        </button>
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
