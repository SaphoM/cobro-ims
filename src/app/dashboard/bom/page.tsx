import { productRepository } from '@/lib/data';
import { AddComponentForm } from '@/app/dashboard/bom/add-component-form';
import { removeBomLineAction } from '@/app/dashboard/bom/actions';

export default async function BomPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; buildQty?: string }>;
}) {
  const { productId, buildQty } = await searchParams;
  const products = await productRepository.list();
  const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name));
  const productById = new Map(products.map((p) => [p.id, p]));

  const selected = productId ? productById.get(productId) : null;
  const bomLines = selected ? await productRepository.listBom(selected.id) : [];
  const explosionQty = Math.max(Number(buildQty) || 1, 1);

  // Exclude the parent itself and anything already on its BOM from the "add component" picker.
  const existingComponentIds = new Set(bomLines.map((l) => l.componentProductId));
  const componentOptions = selected
    ? sortedProducts.filter((p) => p.id !== selected.id && !existingComponentIds.has(p.id))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Bill of materials</h1>
        <p className="text-[0.86rem] text-text-muted">
          Flat parent → component structure — the schema&apos;s committed shape. Whether Cobro needs
          nested/multi-level BOM is still a{' '}
          <span className="text-accent">BUSINESS DECISION REQUIRED</span> item; this covers what&apos;s
          built today.
        </p>
      </div>

      <form
        action="/dashboard/bom"
        method="GET"
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-accent/[0.14] bg-surface p-5"
      >
        <label className="flex flex-1 min-w-[240px] flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Product</span>
          <select
            name="productId"
            required
            defaultValue={selected?.id ?? ''}
            className="rounded-lg border border-accent/[0.14] bg-surface-2 px-3 py-2.5 text-[0.88rem] text-text focus:border-accent focus:outline-none"
          >
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
          className="rounded-lg border border-accent/30 bg-surface-2 px-5 py-2.5 text-[0.88rem] font-semibold text-accent hover:bg-accent/10"
        >
          View BOM
        </button>
      </form>

      {selected && (
        <>
          <section className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
            <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">
              Add a component to {selected.sku}
            </h2>
            <p className="mb-4 text-[0.83rem] text-text-muted">
              Quantity is per one unit of {selected.name}.
            </p>
            {componentOptions.length === 0 ? (
              <p className="text-[0.83rem] text-text-faint">
                No other products available to add — either every product is already on this BOM, or the
                catalogue only has this one product.
              </p>
            ) : (
              <AddComponentForm parentProductId={selected.id} componentOptions={componentOptions} />
            )}
          </section>

          <section className="rounded-2xl border border-accent/[0.14] bg-surface">
            <div className="border-b border-accent/[0.14] px-5 py-4">
              <h2 className="font-display text-[1.05rem] font-medium text-text">
                {bomLines.length} component{bomLines.length === 1 ? '' : 's'}
              </h2>
            </div>
            {bomLines.length === 0 ? (
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
                    {bomLines.map((line) => {
                      const component = productById.get(line.componentProductId);
                      return (
                        <tr key={line.id} className="border-t border-accent/[0.08]">
                          <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text">{component?.sku}</td>
                          <td className="px-5 py-3 text-text-muted">{component?.name}</td>
                          <td className="px-5 py-3 text-right tabular-nums text-text">
                            {line.quantity.toLocaleString()} {component?.unitOfMeasure}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <form action={removeBomLineAction.bind(null, line.id)}>
                              <button type="submit" className="text-[0.8rem] font-semibold text-text-faint hover:text-danger">
                                Remove
                              </button>
                            </form>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {bomLines.length > 0 && (
            <section className="rounded-2xl border border-accent/[0.14] bg-surface">
              <div className="border-b border-accent/[0.14] px-5 py-4">
                <h2 className="font-display text-[1.05rem] font-medium text-text">BOM explosion</h2>
                <p className="text-[0.83rem] text-text-muted">
                  Total components needed to build a given quantity of {selected.sku}.
                </p>
              </div>
              <form action="/dashboard/bom" method="GET" className="flex items-end gap-3 px-5 py-4">
                <input type="hidden" name="productId" value={selected.id} />
                <label className="flex flex-col gap-1.5">
                  <span className="text-[0.75rem] font-semibold text-text-muted">Build quantity</span>
                  <input
                    type="number"
                    name="buildQty"
                    min="1"
                    step="1"
                    defaultValue={explosionQty}
                    className="w-32 rounded-lg border border-accent/[0.14] bg-surface-2 px-3 py-2.5 text-[0.88rem] text-text focus:border-accent focus:outline-none"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-lg border border-accent/30 bg-surface-2 px-4 py-2.5 text-[0.85rem] font-semibold text-accent hover:bg-accent/10"
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
                    {bomLines.map((line) => {
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
