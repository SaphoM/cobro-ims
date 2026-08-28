import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCurrentUser, useStore, type ActionResult } from '@/store/useStore';
import { roles } from '@/store/seed';
import { inputClass, selectClass } from '@/ui/form-control-classes';
import { Feedback } from '@/ui/Feedback';

/**
 * Workshop Bill of Materials — Engineer-only, requisition-driven.
 *
 * Business rules enforced here:
 *  - Non-engineers (Admin, Store) see a role gate — no BOM construction for them.
 *  - Engineers with no active requisitions see an empty state directing them to
 *    raise a requisition on the Requisitions & transfers page first.
 *  - Engineers with requisitions see their Workshop/Asset context, the list of
 *    requisitioned materials, and can add those materials to their Workshop BOM.
 *  - The "Add material" dropdown is populated ONLY from the engineer's own
 *    requisitions — not from the full product catalogue.
 *  - The BOM is scoped to the engineer's assigned Workshop/Asset; they cannot
 *    build or edit another asset's BOM.
 *
 * Visual language: identical to the rest of the app — rounded-2xl, border
 * accent/[0.14], bg-surface cards, font-display headings, the same h-9
 * controls — no new design patterns introduced.
 */
export function BomPage() {
  const session = useCurrentUser();
  const roleName = session ? (roles.find((r) => r.id === session.roleId)?.name ?? '') : '';

  // Gate 1: Engineer-only.
  if (roleName !== 'engineer') {
    return <RoleGate />;
  }

  // Gate 2: Engineer must have an assigned asset (defensive — the seed always
  // sets assetId for engineers, but guard against misconfigured users).
  if (!session?.assetId) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-[1.3rem] font-medium text-text">Workshop bill of materials</h1>
        </div>
        <div className="rounded-2xl border border-accent/[0.14] bg-surface px-5 py-10 text-center">
          <p className="text-[0.85rem] text-text-muted">
            Your account is not linked to a Workshop/Asset. Contact your administrator to set this up.
          </p>
        </div>
      </div>
    );
  }

  return <EngineerBomView assetId={session.assetId} />;
}

// ---------------------------------------------------------------------------
// Role gate — shown to Admin and Store
// ---------------------------------------------------------------------------

function RoleGate() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Workshop bill of materials</h1>
        <p className="text-[0.86rem] text-text-muted">Engineer-only functionality.</p>
      </div>
      <div className="rounded-2xl border border-accent/[0.14] bg-surface px-5 py-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/[0.12] text-2xl">
          🔧
        </div>
        <p className="font-display text-[1.05rem] font-medium text-text">Engineers only</p>
        <p className="mt-1.5 text-[0.85rem] text-text-muted">
          The Workshop Bill of Materials is specific to engineers working at a Workshop/Asset.
          Your role does not include BOM construction.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main engineer view
// ---------------------------------------------------------------------------

function EngineerBomView({ assetId }: { assetId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const buildQty = searchParams.get('buildQty');

  const locations = useStore((s) => s.locations);
  const salesOrders = useStore((s) => s.salesOrders);
  const products = useStore((s) => s.products);
  const workshopBomLines = useStore((s) => s.workshopBomLines);
  const addWorkshopBomLine = useStore((s) => s.addWorkshopBomLine);
  const removeWorkshopBomLine = useStore((s) => s.removeWorkshopBomLine);

  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);

  const asset = locations.find((l) => l.id === assetId);
  const productById = new Map(products.map((p) => [p.id, p]));

  // Relevant requisitions: headed to this asset, not cancelled.
  // "dispatched" is included — materials have arrived; the engineer may still
  // want to include them in a retrospective BOM.
  const myRequisitions = salesOrders
    .filter((o) => o.kind === 'requisition' && o.toLocationId === assetId && o.status !== 'cancelled')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Workshop BOM lines for this asset, in insertion order.
  const myBomLines = workshopBomLines.filter((l) => l.assetId === assetId);

  // "Add material" dropdown: products from requisitions, minus what's already
  // on the BOM. This is the ONLY source — the full catalogue is never shown.
  const alreadyOnBom = new Set(myBomLines.map((l) => l.productId));
  const reqProductIds = new Set(myRequisitions.map((o) => o.productId));
  const componentOptions = products
    .filter((p) => reqProductIds.has(p.id) && !alreadyOnBom.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const explosionQty = Math.max(Number(buildQty) || 1, 1);

  function handleAddComponent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setPending(true);
    const r = addWorkshopBomLine({
      assetId,
      productId: String(data.get('productId')),
      quantity: Number(data.get('quantity')),
    });
    setPending(false);
    setResult(r);
    if (r.ok) form.reset();
  }

  function handleExplode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const qty = String(new FormData(e.currentTarget).get('buildQty') ?? '1');
    setSearchParams({ buildQty: qty });
  }

  // Empty state — no active requisitions yet.
  if (myRequisitions.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader assetName={asset?.name ?? assetId} />
        <div className="rounded-2xl border border-accent/[0.14] bg-surface px-5 py-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/[0.12] text-2xl">
            📋
          </div>
          <p className="font-display text-[1.05rem] font-medium text-text">No requisitions yet</p>
          <p className="mt-1.5 mb-5 text-[0.85rem] text-text-muted">
            You can build a Workshop Bill of Materials once you have requisitioned the materials
            your Workshop needs. Head to Requisitions &amp; transfers and raise a requisition first.
          </p>
          <Link
            to="/dashboard/requisitions"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover"
          >
            Go to Requisitions &amp; transfers
          </Link>
        </div>
      </div>
    );
  }

  // Active state — engineer has at least one requisition.
  return (
    <div className="flex flex-col gap-6">
      <PageHeader assetName={asset?.name ?? assetId} />

      {/* Requisitions context — what has been requested for this workshop */}
      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">Requisitions for {asset?.name}</h2>
          <p className="text-[0.83rem] text-text-muted">
            Materials requisitioned for your Workshop — these are available to add to your BOM below.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] border-collapse text-[0.86rem]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="px-5 py-2.5 font-medium">Ref</th>
                <th className="px-5 py-2.5 font-medium">Material</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Qty requested</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {myRequisitions.map((o) => {
                const product = productById.get(o.productId);
                return (
                  <tr key={o.id} className="border-t border-accent/[0.08]">
                    <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text">{o.orderNumber}</td>
                    <td className="px-5 py-3">
                      <div className="text-text">{product?.name ?? '—'}</div>
                      <div className="font-mono-brand text-[0.72rem] text-text-faint">{product?.sku}</div>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-text">
                      {o.quantityOrdered.toLocaleString()} {product?.unitOfMeasure}
                    </td>
                    <td className="px-5 py-3">
                      <ReqStatusPill status={o.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add material to BOM — dropdown sourced from requisitioned items only */}
      <section className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
        <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">Add material to Workshop BOM</h2>
        <p className="mb-4 text-[0.83rem] text-text-muted">
          Select a requisitioned material and set the quantity needed per job unit.
          Only materials you have requisitioned for {asset?.name} appear here.
        </p>
        {componentOptions.length === 0 ? (
          <p className="text-[0.83rem] text-text-faint">
            All requisitioned materials have already been added to this BOM.
          </p>
        ) : (
          <div>
            <form onSubmit={handleAddComponent} className="flex flex-wrap items-end gap-3">
              <label className="flex flex-1 min-w-[220px] flex-col gap-1.5">
                <span className="text-[0.75rem] font-semibold text-text-muted">Requisitioned material</span>
                <select name="productId" required className={selectClass}>
                  {componentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[0.75rem] font-semibold text-text-muted">Qty per job unit</span>
                <input
                  type="number"
                  name="quantity"
                  min="0.001"
                  step="0.001"
                  required
                  placeholder="0"
                  className={`${inputClass} w-32`}
                />
              </label>
              <button
                type="submit"
                disabled={pending}
                className="h-9 rounded-lg bg-accent px-5 py-1.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
              >
                {pending ? 'Adding…' : 'Add to BOM'}
              </button>
            </form>
            <Feedback result={result} />
          </div>
        )}
      </section>

      {/* Workshop BOM materials table */}
      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">
            {myBomLines.length} material{myBomLines.length === 1 ? '' : 's'} on this BOM
          </h2>
        </div>
        {myBomLines.length === 0 ? (
          <p className="px-5 py-6 text-[0.85rem] text-text-faint">
            No materials added yet — use the form above to build your Workshop BOM.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] border-collapse text-[0.86rem]">
              <thead>
                <tr className="text-left text-text-faint">
                  <th className="px-5 py-2.5 font-medium">SKU</th>
                  <th className="px-5 py-2.5 font-medium">Material</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Qty per job unit</th>
                  <th className="px-5 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {myBomLines.map((line) => {
                  const product = productById.get(line.productId);
                  return (
                    <tr key={line.id} className="border-t border-accent/[0.08]">
                      <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text">{product?.sku}</td>
                      <td className="px-5 py-3 text-text-muted">{product?.name}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-text">
                        {line.quantity.toLocaleString()} {product?.unitOfMeasure}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setResult(removeWorkshopBomLine(line.id))}
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

      {/* BOM explosion — total materials for N job units */}
      {myBomLines.length > 0 && (
        <section className="rounded-2xl border border-accent/[0.14] bg-surface">
          <div className="border-b border-accent/[0.14] px-5 py-4">
            <h2 className="font-display text-[1.05rem] font-medium text-text">BOM explosion</h2>
            <p className="text-[0.83rem] text-text-muted">
              Total materials needed to run this job a given number of times at {asset?.name}.
            </p>
          </div>
          <form onSubmit={handleExplode} className="flex items-end gap-3 px-5 py-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[0.75rem] font-semibold text-text-muted">Job units</span>
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
            <table className="w-full min-w-[440px] border-collapse text-[0.86rem]">
              <thead>
                <tr className="text-left text-text-faint">
                  <th className="px-5 py-2.5 font-medium">Material</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">
                    Needed for {explosionQty} job unit{explosionQty === 1 ? '' : 's'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {myBomLines.map((line) => {
                  const product = productById.get(line.productId);
                  return (
                    <tr key={line.id} className="border-t border-accent/[0.08]">
                      <td className="px-5 py-3 text-text">
                        {product?.sku} <span className="text-text-faint">— {product?.name}</span>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-text">
                        {(line.quantity * explosionQty).toLocaleString()} {product?.unitOfMeasure}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared subcomponents
// ---------------------------------------------------------------------------

function PageHeader({ assetName }: { assetName: string }) {
  return (
    <div>
      <h1 className="font-display text-[1.3rem] font-medium text-text">Workshop bill of materials</h1>
      <p className="text-[0.86rem] text-text-muted">
        Workshop/Asset:{' '}
        <span className="font-medium text-text">{assetName}</span>
      </p>
    </div>
  );
}

const REQ_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  partially_fulfilled: 'Partially fulfilled',
  dispatched: 'Fulfilled',
  cancelled: 'Cancelled',
};

const REQ_STATUS_CLASSES: Record<string, string> = {
  draft: 'bg-accent/[0.08] text-accent',
  confirmed: 'bg-accent/[0.15] text-accent font-semibold',
  partially_fulfilled: 'bg-[#e8b84b]/10 text-[#e8b84b]',
  dispatched: 'bg-[#6bba75]/10 text-[#6bba75]',
  cancelled: 'bg-white/5 text-text-faint',
};

function ReqStatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.72rem] ${
        REQ_STATUS_CLASSES[status] ?? 'bg-white/5 text-text-faint'
      }`}
    >
      {REQ_STATUS_LABELS[status] ?? status}
    </span>
  );
}
