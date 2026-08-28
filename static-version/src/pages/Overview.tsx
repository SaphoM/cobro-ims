import { useState } from 'react';
import { stockValue } from '@/store/engine';

import { useCurrentUser, useStore, scopeFor, type ActionResult } from '@/store/useStore';
import { roles } from '@/store/seed';
import { HelpPopup } from '@/ui/HelpPopup';
import { inputClass, selectClass } from '@/ui/form-control-classes';
import { Feedback } from '@/ui/Feedback';
import type { StockLedgerView, StockMovementType } from '@/store/types';

/** PORTED from src/app/dashboard/page.tsx + record-movement-form.tsx. */
const MOVEMENT_LABELS: Record<string, string> = {
  receipt: 'Receipt (GRN)',
  dispatch: 'Dispatch (sale)',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  adjustment: 'Adjustment (found)',
  write_off: 'Write-off',
};

export function OverviewPage() {
  const products = useStore((s) => s.products);
  // Locations come from the store now (assets are user-managed).
  const warehouses = useStore((s) => s.locations);
  const ledger = useStore((s) => s.ledger);
  const recordMovement = useStore((s) => s.recordMovement);
  const session = useCurrentUser();
  const roleName = session ? roles.find((r) => r.id === session.roleId)?.name ?? '' : '';
  // Engineers focus on their own asset; Store on the Store; Admin sees all.
  const { focusLocationId } = scopeFor(session, roleName);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);

  const productById = new Map(products.map((p) => [p.id, p]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

  const ledgerView: StockLedgerView[] = Object.values(ledger)
    .map((entry) => {
      const product = productById.get(entry.productId);
      const warehouse = warehouseById.get(entry.warehouseId);
      if (!product || !warehouse) return null;
      return {
        ...entry,
        product,
        warehouse,
        stockValue: stockValue(entry),
        isBelowReorderPoint: product.reorderPoint != null && entry.quantityOnHand < product.reorderPoint,
      };
    })
    .filter((v): v is StockLedgerView => v !== null)
    .sort((a, b) => a.product.name.localeCompare(b.product.name));

  const scopedView = focusLocationId ? ledgerView.filter((r) => r.warehouseId === focusLocationId) : ledgerView;
  const focusName = focusLocationId ? warehouseById.get(focusLocationId)?.name ?? '' : '';
  const totalStockValue = scopedView.reduce((sum, row) => sum + row.stockValue, 0);
  const lowStockCount = scopedView.filter((row) => row.isBelowReorderPoint).length;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setResult(
      recordMovement({
        productId: String(form.get('productId')),
        warehouseId: String(form.get('warehouseId')),
        movementType: String(form.get('movementType')) as StockMovementType,
        quantity: Number(form.get('quantity')),
        unitCost: Number(form.get('unitCost')),
      })
    );
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <HelpPopup sectionKey="overview" />

      {/*
        Scope note. Engineers get detail for their own asset but still see
        every location's quantities in the ledger below — they need to know
        whether a part is already on site elsewhere before requesting one.
      */}
      {focusLocationId && (
        <div className="rounded-xl border border-accent/30 bg-accent/[0.08] px-4 py-3 text-[0.82rem] text-accent">
          Showing totals for <strong>{focusName}</strong>. The ledger below lists every location, so you can
          still see what other assets are holding.
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="SKUs tracked" value={products.length.toLocaleString()} />
        <StatTile
          label="Stock on hand (value)"
          value={`R ${totalStockValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <StatTile label="Below reorder point" value={lowStockCount.toString()} tone={lowStockCount > 0 ? 'warning' : 'default'} />
      </section>

      <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
        <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">Record a stock movement</h2>
        <p className="mb-4 text-[0.83rem] text-text-muted">
          Proves the inventory engine end-to-end: this posts an append-only movement, then re-derives the
          ledger&apos;s quantity and weighted-average cost from it — the same path GRN, dispatch, transfers and
          write-offs all use.
        </p>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1.5 lg:col-span-2">
            <span className="text-[0.75rem] font-semibold text-text-muted">Product</span>
            <select name="productId" required className={selectClass}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">Location</span>
            <select name="warehouseId" required className={selectClass}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">Type</span>
            <select name="movementType" required defaultValue="receipt" className={selectClass}>
              {Object.entries(MOVEMENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">Quantity</span>
            <input type="number" name="quantity" min="0.001" step="0.001" required placeholder="0" className={inputClass} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">Unit cost (R)</span>
            <input type="number" name="unitCost" min="0" step="0.01" required placeholder="0.00" className={inputClass} />
          </label>

          <div className="flex items-end lg:col-span-5">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
            >
              {pending ? 'Posting…' : 'Post movement'}
            </button>
          </div>
        </form>

        <Feedback result={result} />
      </div>

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">Stock by location</h2>
          <p className="text-[0.83rem] text-text-muted">Weighted-average cost, live across the Store and every asset.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[0.86rem]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="px-5 py-2.5 font-medium">Product</th>
                <th className="px-5 py-2.5 font-medium">Location</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">On hand</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Reserved</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">WAC</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Stock value</th>
              </tr>
            </thead>
            <tbody>
              {ledgerView.map((row) => (
                <tr key={`${row.productId}::${row.warehouseId}`} className="border-t border-accent/[0.08]">
                  <td className="px-5 py-3">
                    <div className="text-text">{row.product.name}</div>
                    <div className="font-mono-brand text-[0.72rem] text-text-faint">{row.product.sku}</div>
                  </td>
                  <td className="px-5 py-3 text-text-muted">{row.warehouse.name}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text">
                    {row.quantityOnHand.toLocaleString()} {row.product.unitOfMeasure}
                    {row.isBelowReorderPoint && (
                      <span className="ml-2 rounded-full bg-danger/15 px-2 py-0.5 text-[0.68rem] font-semibold text-[#f3a99a]">Low</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-text-muted">{row.quantityReserved.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text-muted">R {row.weightedAverageCost.toFixed(2)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text">
                    R {row.stockValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
