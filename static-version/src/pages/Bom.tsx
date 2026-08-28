import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore, type ActionResult } from '@/store/useStore';
import { inputClass, selectClass } from '@/ui/form-control-classes';
import { Feedback } from '@/ui/Feedback';

/**
 * PORTED from src/app/dashboard/bom/page.tsx + add-component-form.tsx.
 * Flat parent → component BOM plus the explosion calculator. The original
 * drove both the product picker and the build quantity through GET forms
 * (?productId=, ?buildQty=); here those same two params live in the hash
 * route's query string, so the URL still carries the whole view state and a
 * refresh lands on exactly the same BOM.
 */
export function BomPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const productId = searchParams.get('productId') ?? '';
  const buildQty = searchParams.get('buildQty');

  const products = useStore((s) => s.products);
  const bomLines = useStore((s) => s.bomLines);
  const addBomLine = useStore((s) => s.addBomLine);
  const removeBomLine = useStore((s) => s.removeBomLine);

  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);

  const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name));
  const productById = new Map(products.map((p) => [p.id, p]));
  const selected = productId ? productById.get(productId) ?? null : null;
  const lines = selected ? bomLines.filter((l) => l.parentProductId === selected.id) : [];
  const explosionQty = Math.max(Number(buildQty) || 1, 1);

  // Exclude the parent itself and anything already on its BOM from the picker.
  const existingComponentIds = new Set(lines.map((l) => l.componentProductId));
  const componentOptions = selected ? sortedProducts.filter((p) => p.id !== selected.id && !existingComponentIds.has(p.id)) : [];

  function handleSelectProduct(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get('productId') ?? '');
    if (value) setSearchParams({ productId: value });
  }

  function handleExplode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const qty = String(new FormData(e.currentTarget).get('buildQty') ?? '1');
    setSearchParams({ productId, buildQty: qty });
  }

  function handleAddComponent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    setPending(true);
    const r = addBomLine({
      parentProductId: selected.id,
      componentProductId: String(data.get('componentProductId')),
      quantity: Number(data.get('quantity')),
    });
    setPending(false);
    setResult(r);
    if (r.ok) form.reset();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Warehouse bill of materials</h1>
        <p className="text-[0.86rem] text-text-muted">
          Flat parent → component structure — the schema&apos;s committed shape. Whether Cobro needs
          nested/multi-level BOM is still a <span className="text-accent">BUSINESS DECISION REQUIRED</span>{' '}
          item; this covers what&apos;s built today.
        </p>
      </div>

      <form onSubmit={handleSelectProduct} className="flex flex-wrap items-end gap-3 rounded-2xl border border-accent/[0.14] bg-surface p-5">
        <label className="flex flex-1 min-w-[240px] flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Product</span>
          <select name="productId" required defaultValue={selected?.id ?? ''} key={selected?.id ?? 'none'} className={selectClass}>
            <option value="" disabled>
              Choose a product…
            </option>
            {sortedProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-9 rounded-lg border border-accent/30 bg-surface-2 px-5 py-1.5 text-[0.88rem] font-semibold text-accent hover:bg-accent/10"
        >
          View BOM
        </button>
      </form>

      {selected && (
        <>
          <section className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
            <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">Add a component to {selected.sku}</h2>
            <p className="mb-4 text-[0.83rem] text-text-muted">Quantity is per one unit of {selected.name}.</p>
            {componentOptions.length === 0 ? (
              <p className="text-[0.83rem] text-text-faint">
                No other products available to add — either every product is already on this BOM, or the
                catalogue only has this one product.
              </p>
            ) : (
              <div>
                <form onSubmit={handleAddComponent} className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-1 min-w-[220px] flex-col gap-1.5">
                    <span className="text-[0.75rem] font-semibold text-text-muted">Component product</span>
                    <select name="componentProductId" required className={selectClass}>
                      {componentOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.75rem] font-semibold text-text-muted">Quantity per unit</span>
                    <input type="number" name="quantity" min="0.001" step="0.001" required placeholder="0" className={`${inputClass} w-32`} />
                  </label>
                  <button
                    type="submit"
                    disabled={pending}
                    className="h-9 rounded-lg bg-accent px-5 py-1.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
                  >
                    {pending ? 'Adding…' : 'Add component'}
                  </button>
                </form>
                <Feedback result={result} />
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-accent/[0.14] bg-surface">
            <div className="border-b border-accent/[0.14] px-5 py-4">
              <h2 className="font-display text-[1.05rem] font-medium text-text">
                {lines.length} component{lines.length === 1 ? '' : 's'}
              </h2>
            </div>
            {lines.length === 0 ? (
              <p className="px-5 py-6 text-[0.85rem] text-text-faint">
                No components yet — {selected.sku} has no bill of materials.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-[0.86rem]">
                  <thead>
                    <tr className="text-left text-text-faint">
                      <th className="px-5 py-2.5 font-medium">SKU</th>
                      <th className="px-5 py-2.5 font-medium">Component</th>
                      <th className="px-5 py-2.5 text-right font-medium tabular-nums">Qty per unit</th>
                      <th className="px-5 py-2.5 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const component = productById.get(line.componentProductId);
                      return (
                        <tr key={line.id} className="border-t border-accent/[0.08]">
                          <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text">{component?.sku}</td>
                          <td className="px-5 py-3 text-text-muted">{component?.name}</td>
                          <td className="px-5 py-3 text-right tabular-nums text-text">
                            {line.quantity.toLocaleString()} {component?.unitOfMeasure}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setResult(removeBomLine(line.id))}
                              className="text-[0.8rem] font-semibold text-text-faint hover:text-danger"
                            >
                              Remove
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

          {lines.length > 0 && (
            <section className="rounded-2xl border border-accent/[0.14] bg-surface">
              <div className="border-b border-accent/[0.14] px-5 py-4">
                <h2 className="font-display text-[1.05rem] font-medium text-text">BOM explosion</h2>
                <p className="text-[0.83rem] text-text-muted">
                  Total components needed to build a given quantity of {selected.sku}.
                </p>
              </div>
              <form onSubmit={handleExplode} className="flex items-end gap-3 px-5 py-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[0.75rem] font-semibold text-text-muted">Build quantity</span>
                  <input
                    type="number"
                    name="buildQty"
                    min="1"
                    step="1"
                    defaultValue={explosionQty}
                    key={explosionQty}
                    className={`${inputClass} w-32`}
                  />
                </label>
                <button
                  type="submit"
                  className="h-9 rounded-lg border border-accent/30 bg-surface-2 px-4 py-1.5 text-[0.85rem] font-semibold text-accent hover:bg-accent/10"
                >
                  Recalculate
                </button>
              </form>
              <div className="overflow-x-auto border-t border-accent/[0.08]">
                <table className="w-full min-w-[480px] border-collapse text-[0.86rem]">
                  <thead>
                    <tr className="text-left text-text-faint">
                      <th className="px-5 py-2.5 font-medium">Component</th>
                      <th className="px-5 py-2.5 text-right font-medium tabular-nums">
                        Needed for {explosionQty} unit{explosionQty === 1 ? '' : 's'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const component = productById.get(line.componentProductId);
                      return (
                        <tr key={line.id} className="border-t border-accent/[0.08]">
                          <td className="px-5 py-3 text-text">
                            {component?.sku} <span className="text-text-faint">— {component?.name}</span>
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums text-text">
                            {(line.quantity * explosionQty).toLocaleString()} {component?.unitOfMeasure}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
