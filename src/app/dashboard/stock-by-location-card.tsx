'use client';

import { useState } from 'react';
import { ReservedCell } from '@/app/dashboard/reserved-cell';
import { QuickRequisitionButton } from '@/app/dashboard/quick-requisition-button';
import { selectClass } from '@/lib/ui/form-control-classes';
import type { Customer, StockLedgerView } from '@/lib/domain/inventory';

/** The stock views this card can show. What each one CONTAINS is decided on
 *  the server and varies by role (see dashboard/page.tsx) - this component
 *  only renders what it was handed. */
export type StockViewId = 'station' | 'stores';

export interface StockView {
  id: StockViewId;
  label: string;
  /** Replaces the card's subtitle while this view is active, so the copy
   *  always describes the rows actually on screen. */
  description: string;
  rows: StockLedgerView[];
}

/**
 * "Stock by location" - the Overview's ledger table, with a role-aware view
 * toggle in its header.
 *
 * The table markup is unchanged from when it lived inline in
 * dashboard/page.tsx; it moved here only so switching views is a client
 * state change (no navigation, no refetch, nothing else on the page reset),
 * which is what the toggle needs to be instant.
 *
 * The `views` array is the security boundary's OUTPUT, not its input: the
 * server decides which views this role may have and sends only those, with
 * only the rows belonging to each. A view the viewer isn't entitled to never
 * reaches the browser at all, so there is no client flag to flip to reach it
 * - see the `visibleViews` construction in dashboard/page.tsx.
 */
export function StockByLocationCard({
  views,
  defaultViewId,
  stationOptions,
  defaultStationId,
  productOptions,
  canRequest,
  showCosts,
  canEditPrice,
  sessionUserId,
  customers,
  locationsByProduct,
}: {
  views: StockView[];
  /** Which tab the toggle opens on, decided by role rather than by array
   *  order - Stores Manager/Clerk open on "Stores" (that is their own stock,
   *  Station is Engineers' oversight); Admin and Engineer open on "Station"
   *  as before. Falls back to the first view if the given id isn't actually
   *  in `views` (defensive only - every role's default is one of its own
   *  views by construction in dashboard/page.tsx). */
  defaultViewId: StockViewId;
  /** Every Engineer's station this viewer may inspect, in offer order - an
   *  Engineer's own comes first, labelled "(yours)". Built server-side. */
  stationOptions: { id: string; label: string }[];
  /** Which station the picker opens on: an Engineer's own (so the Station
   *  view still shows exactly what it showed before the picker existed), or
   *  'all' for Admin and Stores, who have no station of their own. */
  defaultStationId: string;
  /** The full product catalogue, for the product filter - SKU + name, sorted.
   *  Not narrowed to what's in stock: "nothing here" is a useful answer, and
   *  a list that reshapes itself per view is harder to use. */
  productOptions: { id: string; label: string }[];
  canRequest: boolean;
  showCosts: boolean;
  canEditPrice: boolean;
  sessionUserId: string | null;
  customers: Customer[];
  /** productId -> every location holding it, for the Quick requisition
   *  modal's "also on hand at" line. A plain object rather than a Map
   *  because this crosses the server/client boundary. */
  locationsByProduct: Record<string, { warehouseId: string; label: string; qty: number }[]>;
}) {
  const [activeId, setActiveId] = useState<StockViewId>(
    views.some((v) => v.id === defaultViewId) ? defaultViewId : (views[0]?.id ?? 'stores')
  );
  const [stationId, setStationId] = useState(defaultStationId);
  const [productId, setProductId] = useState('all');
  const active = views.find((v) => v.id === activeId) ?? views[0];
  if (!active) return null;

  // The picker narrows the Station view only - it has nothing to say about
  // aggregate stock or the store, so it isn't rendered for those and isn't
  // applied to their rows either.
  const isStationView = active.id === 'station';
  const rows = active.rows.filter(
    (row) =>
      // Station picker narrows the Station view only - it has nothing to say
      // about the store, so it isn't rendered there or applied there.
      (!isStationView || stationId === 'all' || row.warehouseId === stationId) &&
      // The product filter applies to whichever view is showing.
      (productId === 'all' || row.productId === productId)
  );

  return (
    <section className="rounded-2xl border border-accent/[0.14] bg-surface">
      {/*
        Wide screens lay this out as two rows, not two columns: heading left
        with the controls right, then the description spanning the full width
        beneath them. Sharing one row with three controls squeezed the text
        into a narrow column - wrapping "Stock by location" onto two lines
        and leaving most of the row empty - so the description gets
        `sm:w-full`, which forces it onto its own line in the wrapping flex
        row. `order` keeps the phone reading order unchanged (heading,
        description, controls) while the wide layout puts the controls
        second.
      */}
      <div className="flex flex-col gap-3 border-b border-accent/[0.14] px-5 py-4 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-4 sm:gap-y-2">
        <h2 className="font-display text-[1.05rem] font-medium text-text sm:order-1 sm:flex-none">
          Stock by location
        </h2>
        <p className="order-2 text-[0.83rem] text-text-muted sm:order-3 sm:w-full">{active.description}</p>

        {/*
          Only rendered when there is actually something to switch between -
          a single-view role gets no dead control. Segmented buttons rather
          than a <select>: two or three short options that all fit, where
          seeing the alternatives without opening anything is the point.
        */}
        {/* Wraps rather than overflowing: on a narrow screen the picker
            drops onto its own line above the toggle instead of pushing it
            off the card's right edge. */}
        <div className="order-3 flex flex-wrap items-center justify-end gap-2 self-stretch sm:order-2 sm:ml-auto sm:flex-none sm:self-start">
          {/* Product filter - applies to either view, so it's always shown. */}
          {productOptions.length > 1 && (
            <label className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
              <span className="sr-only">Product</span>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className={`${selectClass} w-full min-w-0 sm:w-auto sm:min-w-[10rem] sm:max-w-[16rem]`}
              >
                <option value="all">All products</option>
                {productOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/*
            Station picker, left of the view toggle. Only while the Station
            view is showing - in any other view it would be a control with
            nothing to act on.
          */}
          {isStationView && stationOptions.length > 1 && (
            <label className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
              <span className="sr-only">Station</span>
              {/* Full width while it's on its own wrapped row (a station name
                  like "Karabo Dlamini's station" is wider than a phone's
                  card), auto-width once it sits beside the toggle. */}
              <select
                value={stationId}
                onChange={(e) => setStationId(e.target.value)}
                className={`${selectClass} w-full min-w-0 sm:w-auto sm:min-w-[10rem]`}
              >
                <option value="all">All stations</option>
                {stationOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {views.length > 1 && (
          <div
            role="group"
            aria-label="Stock view"
            className="flex flex-none gap-1 rounded-xl border border-accent/[0.14] bg-surface-2 p-1"
          >
            {views.map((view) => (
              <button
                key={view.id}
                type="button"
                onClick={() => setActiveId(view.id)}
                aria-pressed={view.id === activeId}
                className={`rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold transition-colors ${
                  view.id === activeId
                    ? 'bg-accent text-ink'
                    : 'text-text-muted hover:bg-accent/10 hover:text-accent-strong'
                }`}
              >
                {view.label}
              </button>
            ))}
          </div>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-[0.85rem] text-text-faint">Nothing on hand in this view.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[0.86rem]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="px-5 py-2.5 font-medium">Product</th>
                <th className="px-5 py-2.5 font-medium">Store</th>
                {canRequest && <th className="w-10 px-2 py-2.5"><span className="sr-only">Requisition</span></th>}
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">On hand</th>
                <th className="px-5 py-2.5 text-right font-medium tabular-nums">Reserved</th>
                {showCosts && (
                  <>
                    <th className="px-5 py-2.5 text-right font-medium tabular-nums">WAC</th>
                    <th className="px-5 py-2.5 text-right font-medium tabular-nums">Stock value</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.productId}::${row.warehouseId}`} className="border-t border-accent/[0.08]">
                  <td className="px-5 py-3">
                    <div className="text-text">{row.product.name}</div>
                    <div className="font-mono-brand text-[0.72rem] text-text-faint">{row.product.sku}</div>
                  </td>
                  <td className="px-5 py-3 text-text-muted">
                    {row.warehouse.type === 'engineer_station' ? (
                      <>
                        {row.warehouse.name}
                        <span className="ml-1.5 rounded-full bg-neutral-soft px-1.5 py-0.5 text-[0.66rem] font-semibold text-text-faint">
                          station
                        </span>
                      </>
                    ) : (
                      row.warehouse.code
                    )}
                  </td>
                  {canRequest && (
                    <td className="px-2 py-3">
                      {row.warehouse.ownerUserId !== sessionUserId && (
                        <QuickRequisitionButton
                          productId={row.productId}
                          productSku={row.product.sku}
                          productName={row.product.name}
                          unitOfMeasure={row.product.unitOfMeasure}
                          availableQty={row.quantityOnHand}
                          elsewhere={(locationsByProduct[row.productId] ?? []).filter(
                            (l) => l.warehouseId !== row.warehouseId
                          )}
                          unitPrice={showCosts ? row.product.unitPrice : null}
                          canEditPrice={canEditPrice}
                          warehouseId={row.warehouseId}
                          warehouseLabel={
                            row.warehouse.type === 'engineer_station' ? row.warehouse.name : row.warehouse.code
                          }
                          customers={customers}
                        />
                      )}
                    </td>
                  )}
                  <td className="px-5 py-3 text-right tabular-nums text-text">
                    {row.quantityOnHand.toLocaleString()} {row.product.unitOfMeasure}
                    {row.isBelowReorderPoint && (
                      <span className="ml-2 rounded-full bg-danger/15 px-2 py-0.5 text-[0.68rem] font-semibold text-danger-text">
                        Low
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    <ReservedCell
                      productId={row.productId}
                      warehouseId={row.warehouseId}
                      quantityReserved={row.quantityReserved}
                    />
                  </td>
                  {showCosts && (
                    <>
                      <td className="px-5 py-3 text-right tabular-nums text-text-muted">
                        R {row.weightedAverageCost.toFixed(2)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-text">
                        R {row.stockValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
