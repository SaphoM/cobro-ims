import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { stockValue } from '@/store/engine';

import { useStore } from '@/store/useStore';
import { CameraScanner } from '@/ui/CameraScanner';

/**
 * PORTED from src/app/dashboard/scan/page.tsx + scan-input.tsx.
 *
 * The three action links carry the found product's barcode as a query param —
 * this is the fix that makes "Receive/Requisition/Adjust this product"
 * actually land on the destination with that product already selected.
 * Preserved exactly, including the deliberately oversized hero input and
 * camera button (one of the two intentional exceptions to the 36px standard).
 *
 * The original used a plain GET form so a USB scanner (which types then hits
 * Enter) needed no JS at all. Here the same Enter-to-submit behaviour writes
 * the barcode into the hash route's query string, so USB scanners still work
 * exactly the same way.
 */
export function ScanPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const barcode = searchParams.get('barcode')?.trim() ?? '';
  const products = useStore((s) => s.products);
  // Locations come from the store now (assets are user-managed).
  const warehouses = useStore((s) => s.locations);
  const ledger = useStore((s) => s.ledger);

  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [barcode]);

  const product = barcode ? products.find((p) => p.barcode === barcode) ?? null : null;
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  const ledgerRows = product ? Object.values(ledger).filter((e) => e.productId === product.id) : [];

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = inputRef.current?.value.trim() ?? '';
    setSearchParams(value ? { barcode: value } : {});
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Barcode / QR scan</h1>
        <p className="text-[0.86rem] text-text-muted">
          Scan with a USB scanner (acts as keyboard input, submits on Enter), scan with a phone/tablet
          camera, or type a barcode to look up a product and its stock across every warehouse.
        </p>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
        <label className="flex flex-col gap-2">
          <span className="text-[0.8rem] font-semibold text-text-muted">Scan or enter barcode</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              ref={inputRef}
              type="text"
              name="barcode"
              defaultValue={barcode}
              autoComplete="off"
              placeholder="Focus here, then scan — or type and press Enter"
              className="flex-1 rounded-xl border border-accent/[0.14] bg-surface-2 px-4 py-3.5 font-mono-brand text-[1.1rem] tracking-wide text-text placeholder:font-body placeholder:text-[0.9rem] placeholder:tracking-normal placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/[0.18]"
            />
            <CameraScanner
              buttonLabel="Scan with camera"
              className="rounded-xl border border-accent/30 bg-surface-2 px-4 py-3.5 text-[0.85rem] font-semibold text-accent hover:bg-accent/10 sm:w-auto"
              onScan={(value) => {
                if (inputRef.current) inputRef.current.value = value;
                formRef.current?.requestSubmit();
              }}
            />
          </div>
        </label>
      </form>

      {barcode && !product && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 px-5 py-4 text-[0.9rem] text-[#f3a99a]">
          No product found with barcode <code className="font-mono-brand">{barcode}</code>.
        </div>
      )}

      {product && (
        <section className="rounded-2xl border border-accent/[0.14] bg-surface">
          <div className="border-b border-accent/[0.14] px-5 py-4">
            <h2 className="font-display text-[1.05rem] font-medium text-text">
              {product.sku} — {product.name}
            </h2>
            <p className="font-mono-brand text-[0.78rem] text-text-faint">Barcode: {product.barcode}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[0.86rem]">
              <thead>
                <tr className="text-left text-text-faint">
                  <th className="px-5 py-2.5 font-medium">Location</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">On hand</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Reserved</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">WAC</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Value</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-[0.85rem] text-text-faint">
                      No stock ledger entries for this product in any warehouse yet.
                    </td>
                  </tr>
                ) : (
                  ledgerRows.map((entry) => (
                    <tr key={entry.warehouseId} className="border-t border-accent/[0.08]">
                      <td className="px-5 py-3 text-text-muted">{warehouseById.get(entry.warehouseId)?.code}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-text">
                        {entry.quantityOnHand.toLocaleString()} {product.unitOfMeasure}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-text-muted">{entry.quantityReserved.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-text-muted">R {entry.weightedAverageCost.toFixed(2)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-text">
                        R {stockValue(entry).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {/*
            These three carry ?barcode= so the destination form can run the same
            match its own scan box runs and open with this product selected.
          */}
          <div className="flex flex-wrap gap-4 border-t border-accent/[0.08] px-5 py-3 text-[0.82rem]">
            <Link to={`/dashboard/receiving?barcode=${encodeURIComponent(product.barcode ?? '')}`} className="text-accent hover:underline">
              Receive this product →
            </Link>
            <Link to={`/dashboard/sales?barcode=${encodeURIComponent(product.barcode ?? '')}`} className="text-accent hover:underline">
              Requisition this product →
            </Link>
            <Link to={`/dashboard/adjustments?barcode=${encodeURIComponent(product.barcode ?? '')}`} className="text-accent hover:underline">
              Adjust this product →
            </Link>
          </div>
        </section>
      )}

      <p className="text-[0.78rem] text-text-faint">
        Barcodes are seeded on the product catalogue for the demo dataset — try{' '}
        <code className="font-mono-brand">6001240912345</code> (Cement 42.5N, 50kg bag).
      </p>
    </div>
  );
}
