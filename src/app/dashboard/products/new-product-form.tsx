'use client';

import { useActionState, useState } from 'react';
import { createProductAction, type CreateProductFormState } from '@/app/dashboard/products/actions';
import { inputClass, selectClass } from '@/lib/ui/form-control-classes';
import { formatCurrency } from '@/lib/ui/currency';
import type { ProductCategory } from '@/lib/domain/inventory';
import { STOCK_UOMS, PACKAGING_UOMS, PACKAGING_UOM_LABELS, supportsPackaging, calcPackageValue } from '@/lib/uom';

const initialState: CreateProductFormState = { error: null, success: null };

export function NewProductForm({ categories }: { categories: ProductCategory[] }) {
  const [state, formAction, pending] = useActionState(createProductAction, initialState);

  const [selectedUom, setSelectedUom] = useState('ea');
  const [packagingUom, setPackagingUom] = useState('');
  const [unitCostRaw, setUnitCostRaw] = useState('');
  const [qtyPerPkgRaw, setQtyPerPkgRaw] = useState('');

  const showPackaging = supportsPackaging(selectedUom) && packagingUom !== '';

  const unitCost = unitCostRaw !== '' ? parseFloat(unitCostRaw) : null;
  const qtyPerPkg = qtyPerPkgRaw !== '' ? parseFloat(qtyPerPkgRaw) : null;
  const packageValue = showPackaging ? calcPackageValue(unitCost, qtyPerPkg) : null;

  const uomDef = STOCK_UOMS.find((u) => u.value === selectedUom);

  return (
    <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
      <h2 className="mb-4 font-display text-[1.05rem] font-medium text-text">Add a product</h2>

      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="flex flex-col gap-1.5 lg:col-span-2">
          <span className="text-[0.75rem] font-semibold text-text-muted">SKU</span>
          <input name="sku" required placeholder="BOLT-M10-BOX100" className={inputClass} />
        </label>

        <label className="flex flex-col gap-1.5 lg:col-span-2">
          <span className="text-[0.75rem] font-semibold text-text-muted">Name</span>
          <input name="name" required placeholder="Bolt M10 × 50mm" className={inputClass} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Stock unit of measure</span>
          <select
            name="unitOfMeasure"
            value={selectedUom}
            onChange={(e) => {
              setSelectedUom(e.target.value);
              // Clear packaging when switching to an incompatible UOM
              if (!supportsPackaging(e.target.value)) {
                setPackagingUom('');
                setQtyPerPkgRaw('');
              }
            }}
            required
            className={selectClass}
          >
            <optgroup label="Count">
              {STOCK_UOMS.filter((u) => u.category === 'count').map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </optgroup>
            <optgroup label="Measurement">
              {STOCK_UOMS.filter((u) => u.category === 'measure').map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </optgroup>
            <optgroup label="Container">
              {STOCK_UOMS.filter((u) => u.category === 'container').map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </optgroup>
          </select>
          {uomDef && (
            <span className="text-[0.7rem] text-text-faint">{uomDef.hint}</span>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Category</span>
          <select name="categoryId" className={selectClass}>
            <option value="">— none —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        {/* ── Packaging section (shown only for count/container UOMs) ── */}
        {supportsPackaging(selectedUom) && (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-[0.75rem] font-semibold text-text-muted">
                Packaging unit
                <span className="ml-1 font-normal text-text-faint">(optional)</span>
              </span>
              <select
                name="packagingUom"
                value={packagingUom}
                onChange={(e) => {
                  setPackagingUom(e.target.value);
                  if (!e.target.value) setQtyPerPkgRaw('');
                }}
                className={selectClass}
              >
                <option value="">— not packaged —</option>
                {PACKAGING_UOMS.map((p) => (
                  <option key={p} value={p}>{PACKAGING_UOM_LABELS[p] ?? p}</option>
                ))}
              </select>
            </label>

            {packagingUom && (
              <label className="flex flex-col gap-1.5">
                <span className="text-[0.75rem] font-semibold text-text-muted">
                  {selectedUom === 'ea' ? 'Items' : 'Units'} per {PACKAGING_UOM_LABELS[packagingUom] ?? packagingUom}
                </span>
                <input
                  type="number"
                  name="qtyPerPackage"
                  min="0.001"
                  step="any"
                  required={packagingUom !== ''}
                  placeholder="e.g. 100"
                  value={qtyPerPkgRaw}
                  onChange={(e) => setQtyPerPkgRaw(e.target.value)}
                  className={inputClass}
                />
              </label>
            )}
          </>
        )}

        {/* ── Individual-unit cost (default costing reference) ── */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">
            Default unit cost (R)
            <span className="ml-1 font-normal text-text-faint">per {selectedUom}</span>
          </span>
          <input
            type="number"
            name="defaultUnitCost"
            min="0"
            step="0.0001"
            placeholder="Optional"
            value={unitCostRaw}
            onChange={(e) => setUnitCostRaw(e.target.value)}
            className={inputClass}
          />
          <span className="text-[0.7rem] text-text-faint">
            Initial costing reference per {selectedUom}. Not the selling price. Actual WAC is derived from receipts.
          </span>
        </label>

        {/* ── Calculated package value (display only) ── */}
        {showPackaging && packageValue != null && (
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <span className="text-[0.75rem] font-semibold text-text-muted">
              Indicative {PACKAGING_UOM_LABELS[packagingUom] ?? packagingUom} value
              <span className="ml-1 font-normal text-text-faint">(calculated, not stored)</span>
            </span>
            <div className="flex h-9 items-center rounded-lg border border-accent/20 bg-surface-2 px-3 text-[0.88rem] font-bold tabular-nums text-accent-strong">
              {formatCurrency(packageValue)}
              <span className="ml-1.5 text-[0.72rem] font-normal text-text-faint">
                = {qtyPerPkg} × {unitCost != null ? formatCurrency(unitCost) : '—'} / {selectedUom}
              </span>
            </div>
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Selling price (R)</span>
          <input type="number" name="unitPrice" min="0" step="0.01" placeholder="Optional" className={inputClass} />
          <span className="text-[0.7rem] text-text-faint">Price charged to customers. Separate from unit cost.</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Barcode</span>
          <input name="barcode" placeholder="Auto-assigned if left blank" className={inputClass} />
          <span className="text-[0.7rem] text-text-faint">Leave blank to auto-generate an internal EAN-13 barcode.</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Reorder point</span>
          <input type="number" name="reorderPoint" min="0" step="1" placeholder="Optional" className={inputClass} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Reorder quantity</span>
          <input type="number" name="reorderQuantity" min="0" step="1" placeholder="Optional" className={inputClass} />
        </label>

        <div className="flex items-end gap-2 lg:col-span-6">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
          >
            {pending ? 'Adding…' : 'Add product'}
          </button>
        </div>
      </form>

      {state.error && (
        <p role="alert" className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[0.82rem] text-danger-text">
          {state.error}
        </p>
      )}
      {state.success && (
        <div role="status" className="mt-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[0.82rem] text-accent-strong">
          <p>{state.success}</p>
          {state.assignedBarcode && (
            <p className="mt-1 font-mono text-[0.78rem] text-text-muted">
              Barcode: <span className="font-bold tracking-widest text-text">{state.assignedBarcode}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
