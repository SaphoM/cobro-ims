'use client';

import { useMemo, useState } from 'react';
import { ScanMovement } from '@/app/dashboard/scan-movement';
import { inputClass, selectClass } from '@/lib/ui/form-control-classes';
import type { Product, StockLedgerEntry, Warehouse } from '@/lib/domain/inventory';

const MOVEMENT_LABELS: Record<string, string> = {
  receipt: 'Receipt (GRN)',
  dispatch: 'Dispatch (sale)',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  adjustment: 'Adjustment (found)',
  write_off: 'Write-off',
};

/**
 * Every field is controlled here rather than left to the DOM, because the
 * Scan flow both reads and writes them: scanning sets Product, and the
 * quantity/cost typed in the scan dialog are the same values shown in the
 * form. Keeping one source of truth means the form can never display
 * something different from what actually gets posted.
 *
 * There is no submit button - Scan is the action (see ScanMovement). The
 * fields stay visible and editable so the operator can see and adjust the
 * whole movement before the scan commits it.
 */
export function RecordMovementForm({
  products,
  warehouses,
  ledger,
}: {
  products: Product[];
  warehouses: Warehouse[];
  /** On-hand quantities to drive the "available" counter below Product -
   *  optional so any existing caller that doesn't pass it still compiles;
   *  the counter just doesn't render without it. */
  ledger?: StockLedgerEntry[];
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [movementType, setMovementType] = useState('receipt');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('0');
  const [posted, setPosted] = useState<string | null>(null);

  // Keyed by "productId::warehouseId" so looking up the count for whatever
  // is currently selected is O(1) and re-derives on every render rather
  // than needing its own effect - selecting a different product or store
  // is exactly what should make this number change.
  const onHandByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of ledger ?? []) {
      map.set(`${entry.productId}::${entry.warehouseId}`, entry.quantityOnHand);
    }
    return map;
  }, [ledger]);
  const selectedProduct = products.find((p) => p.id === productId);
  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId);
  const availableQty = onHandByKey.get(`${productId}::${warehouseId}`) ?? 0;

  return (
    <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
      <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">Record a stock movement</h2>
      <p className="mb-4 text-[0.83rem] text-text-muted">
        Set the store, type and cost, then scan. The scan identifies the product from the catalogue,
        confirms the quantity, and posts it - re-deriving on-hand and weighted-average cost through the
        same engine goods receiving, requisitions, transfers and write-offs all use.
      </p>

      {/*
        Same five-column layout the form has always had, with Scan taking the
        place the submit button used to occupy. `lg:col-start-3` is what pins
        Scan directly beneath Store: grid auto-placement would otherwise drop
        it into whatever cell fell free next, and the alignment would drift
        the moment a field moved. The blank label row above the button matches
        the label height on the controls beside it, so its top edge lines up
        with them instead of riding high.
      */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex flex-col gap-1.5 lg:col-span-2">
          <span className="text-[0.75rem] font-semibold text-text-muted">Product</span>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className={selectClass}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} - {p.name}
              </option>
            ))}
          </select>
          {ledger && (
            <span className={`text-[0.82rem] font-bold ${availableQty === 0 ? 'text-danger' : 'text-accent-strong'}`}>
              {availableQty.toLocaleString()} {selectedProduct?.unitOfMeasure ?? ''} available
              {selectedWarehouse ? ` at ${selectedWarehouse.code}` : ''}
              {availableQty === 0 && ' - none on hand here'}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Store</span>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className={selectClass}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Type</span>
          <select
            value={movementType}
            onChange={(e) => setMovementType(e.target.value)}
            className={selectClass}
          >
            {Object.entries(MOVEMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Quantity</span>
          <input
            type="number"
            min="0.001"
            step="0.001"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 lg:col-start-1">
          <span className="text-[0.75rem] font-semibold text-text-muted">Unit cost (R)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            placeholder="0.00"
            className={inputClass}
          />
        </label>

        <div className="flex flex-col gap-1.5 lg:col-start-3">
          <span aria-hidden="true" className="text-[0.75rem] font-semibold text-text-muted">
            &nbsp;
          </span>
          <ScanMovement
            warehouseId={warehouseId}
            movementType={movementType}
            quantity={quantity}
            unitCost={unitCost}
            onQuantityChange={setQuantity}
            onUnitCostChange={setUnitCost}
            onProductIdentified={setProductId}
            onPosted={setPosted}
          />
        </div>
      </div>

      {posted && (
        <p role="status" className="mt-4 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[0.82rem] text-accent-strong">
          {posted}
        </p>
      )}
    </div>
  );
}
