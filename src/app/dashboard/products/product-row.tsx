'use client';

import { useState, useTransition } from 'react';
import type { Product } from '@/lib/domain/inventory';
import { PriceCell } from '@/app/dashboard/products/price-cell';
import { updateProductAction, deleteProductAction, type CreateProductFormState } from '@/app/dashboard/products/actions';
import { inputClass } from '@/lib/ui/form-control-classes';

const initial: CreateProductFormState = { error: null, success: null };

/**
 * A product catalogue table row with the existing price cell + BOM/labels
 * links, plus inline Edit and Delete for admins (manage_catalogue). Edit opens
 * an inline form below the row; Delete confirms first. Price stays on its own
 * PriceCell (manage_pricing) so the two permissions don't merge. On success the
 * route revalidates, so the UI reflects the real database state.
 */
export function ProductRow({
  product,
  canEditPrice,
  costsVisible,
  canPrintLabels,
  canManageCatalogue,
}: {
  product: Product;
  canEditPrice: boolean;
  costsVisible: boolean;
  canPrintLabels: boolean;
  canManageCatalogue: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [savePending, startSave] = useTransition();
  const [deletePending, startDelete] = useTransition();

  function handleSave(fd: FormData) {
    setSaveError(null);
    startSave(async () => {
      const res = await updateProductAction(initial, fd);
      if (res.error) setSaveError(res.error);
      else setEditing(false);
    });
  }

  function handleDelete(fd: FormData) {
    setDeleteError(null);
    startDelete(async () => {
      const res = await deleteProductAction(initial, fd);
      if (res.error) setDeleteError(res.error);
    });
  }

  return (
    <>
      <tr className="border-t border-accent/[0.08]">
        <td className="px-5 py-3 font-mono-brand text-[0.78rem] text-text">{product.sku}</td>
        <td className="px-5 py-3 text-text">{product.name}</td>
        <td className="px-5 py-3 text-text-muted">{product.unitOfMeasure}</td>
        <td className="px-5 py-3 font-mono-brand text-[0.76rem] text-text-muted">{product.barcode ?? '-'}</td>
        <td className="px-5 py-3 text-right tabular-nums">
          <PriceCell
            productId={product.id}
            sku={product.sku}
            unitPrice={product.unitPrice}
            canEdit={canEditPrice}
            costsVisible={costsVisible}
          />
        </td>
        <td className="px-5 py-3 text-right tabular-nums text-text-muted">
          {product.reorderPoint?.toLocaleString() ?? '-'}
        </td>
        <td className="px-5 py-3 text-right">
          <div className="flex items-center justify-end gap-3">
            <a href={`/dashboard/bom?productId=${product.id}`} className="text-[0.78rem] font-semibold text-accent-strong hover:underline">
              BOM
            </a>
            {product.barcode && canPrintLabels && (
              <a href={`/dashboard/labels?productId=${product.id}`} className="text-[0.78rem] font-semibold text-accent-strong hover:underline">
                Print labels
              </a>
            )}
            {canManageCatalogue &&
              (confirming ? (
                <form action={handleDelete} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={product.id} />
                  <span className="text-[0.78rem] text-text-muted">Delete?</span>
                  <button
                    type="submit"
                    disabled={deletePending}
                    className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-1 text-[0.78rem] font-semibold text-danger-text transition-colors hover:bg-danger/20 disabled:opacity-60"
                  >
                    {deletePending ? 'Deleting…' : 'Confirm'}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} className="text-[0.78rem] text-text-muted hover:text-text">
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <button type="button" onClick={() => setEditing((v) => !v)} className="text-[0.78rem] font-semibold text-accent-strong hover:underline">
                    Edit
                  </button>
                  <button type="button" onClick={() => setConfirming(true)} className="text-[0.78rem] font-semibold text-danger-text hover:underline">
                    Delete
                  </button>
                </>
              ))}
          </div>
          {deleteError && (
            <p role="alert" className="mt-1 text-[0.76rem] text-danger-text">
              {deleteError}
            </p>
          )}
        </td>
      </tr>

      {editing && (
        <tr className="border-t border-accent/[0.08] bg-surface-2/50">
          <td colSpan={7} className="px-5 py-3">
            <form action={handleSave} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
              <input type="hidden" name="id" value={product.id} />
              <div className="flex flex-col gap-1">
                <span className="text-[0.7rem] font-semibold text-text-muted">SKU</span>
                <span className="font-mono-brand text-[0.82rem] text-text-muted">{product.sku}</span>
              </div>
              <label className="flex flex-col gap-1 lg:col-span-2">
                <span className="text-[0.7rem] font-semibold text-text-muted">Name</span>
                <input name="name" defaultValue={product.name} required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[0.7rem] font-semibold text-text-muted">Unit of measure</span>
                <input name="unitOfMeasure" defaultValue={product.unitOfMeasure} required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[0.7rem] font-semibold text-text-muted">Barcode</span>
                <input name="barcode" defaultValue={product.barcode ?? ''} placeholder="Optional" className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[0.7rem] font-semibold text-text-muted">Reorder point</span>
                <input type="number" min="0" step="1" name="reorderPoint" defaultValue={product.reorderPoint ?? ''} placeholder="Optional" className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[0.7rem] font-semibold text-text-muted">Reorder quantity</span>
                <input type="number" min="0" step="1" name="reorderQuantity" defaultValue={product.reorderQuantity ?? ''} placeholder="Optional" className={inputClass} />
              </label>
              <div className="flex flex-wrap items-center gap-2 lg:col-span-6">
                <button type="submit" disabled={savePending} className="rounded-lg bg-accent px-4 py-2 text-[0.82rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-60">
                  {savePending ? 'Saving…' : 'Save changes'}
                </button>
                <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-accent/30 px-4 py-2 text-[0.82rem] font-semibold text-text-muted transition-colors hover:text-text">
                  Cancel
                </button>
                {saveError && (
                  <span role="alert" className="text-[0.8rem] text-danger-text">
                    {saveError}
                  </span>
                )}
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
