'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraScanner } from '@/components/scanner/camera-scanner';
import {
  lookupBarcodeAction,
  postScanAction,
  type ScanDirection,
  type ScanResult,
} from '@/app/dashboard/scan/actions';
import { inputClass, selectClass } from '@/lib/ui/form-control-classes';
import { beep } from '@/lib/ui/beep';
import type { Warehouse } from '@/lib/domain/inventory';

type Mode = 'lookup' | ScanDirection;

interface LogRow {
  key: string;
  at: string;
  ok: boolean;
  mode: Mode;
  text: string;
  sku: string | null;
  quantity: number | null;
  warehouseCode: string | null;
  onHandAfter: number | null;
  unitOfMeasure: string | null;
  barcode: string;
  scanCount: number;
}

const BASE_MODES: { value: Mode; label: string; hint: string }[] = [
  { value: 'in', label: 'Scan IN', hint: 'Every scan posts a receipt - stock goes up.' },
  { value: 'out', label: 'Scan OUT', hint: 'Every scan posts an issue - stock goes down.' },
  { value: 'lookup', label: 'Look up only', hint: 'Reads the code and shows stock. Nothing is posted.' },
];

/** Only offered to someone with their own station (an Engineer / Requester) -
 *  posts against that one station, never a store, and can never take it
 *  below what's actually sitting there. See Warehouse's doc comment in
 *  src/lib/domain/inventory.ts for the accept/use workflow. */
const USE_MODE = { value: 'use' as Mode, label: 'Use', hint: 'Every scan records stock you’ve used from your own station - it leaves tracked inventory for good.' };

/**
 * A scanner double-firing the same code within a few frames is a hardware
 * quirk, not two items. This window is short enough that a real second scan
 * of the same item (which needs the operator to reposition it) still counts.
 */
const DUPLICATE_GUARD_MS = 250;


export function ScanStation({
  warehouses,
  initialBarcode,
  stationWarehouseId,
}: {
  warehouses: Warehouse[];
  initialBarcode: string;
  /** This viewer's own station, if they have one (Engineer / Requester
   *  only) - enables the "Use" mode and is the only warehouse it can ever
   *  post against. Null/undefined for every other role. */
  stationWarehouseId?: string | null;
}) {
  const MODES = stationWarehouseId ? [...BASE_MODES, USE_MODE] : BASE_MODES;
  const [mode, setMode] = useState<Mode>('lookup');
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [soundOn, setSoundOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [successFeedback, setSuccessFeedback] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const unitCostRef = useRef<HTMLInputElement>(null);
  // Set when a scan fails specifically for lack of a unit cost, and read
  // once the queue drains: without this, the barcode field gets refocused
  // as usual and the operator's only path forward is rescanning the exact
  // same code, which fails identically every time - a real repeated-failure
  // loop, not hypothetical. Sending focus to Unit cost instead breaks that
  // loop at the point it actually needs breaking.
  const needsUnitCostRef = useRef(false);
  const lastScanRef = useRef<{ code: string; mode: Mode; at: number }>({ code: '', mode: 'lookup', at: 0 });
  // Mirrors of the settings, so the scan handler stays stable and the camera
  // overlay never captures a stale mode/quantity between renders.
  const settingsRef = useRef({ mode, warehouseId, quantity, unitCost, soundOn });
  useEffect(() => {
    settingsRef.current = { mode, warehouseId, quantity, unitCost, soundOn };
  });

  // Every scan goes through this queue rather than firing its own request
  // directly. A USB scanner buffers keystrokes and a fast operator working
  // through a stack of items can easily present the next one before the
  // server has answered the last - without a queue, two in-flight requests
  // could resolve out of order and show a STALE result over a newer one, or
  // (worse) let the operator believe a scan was dropped when it was really
  // still processing. Queuing guarantees every accepted scan is processed
  // to completion, in the order it was scanned, one at a time - a request
  // is never left racing another.
  const queueRef = useRef<string[]>([]);
  const draining = useRef(false);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const processOne = useCallback(async (code: string) => {
    const { mode: m, warehouseId: wid, quantity: qty, unitCost: cost, soundOn: sound } = settingsRef.current;
    setBusy(true);
    try {
      const res =
        m === 'lookup'
          ? await lookupBarcodeAction(code)
          : await postScanAction({
              barcode: code,
              direction: m,
              warehouseId: wid,
              quantity: Number(qty),
              unitCost: m === 'in' && cost.trim() !== '' ? Number(cost) : null,
            });

      setResult(res);
      needsUnitCostRef.current = res.needsUnitCost;
      if (sound) beep(res.ok);

      setLog((rows) => {
        // Check if we already have a log entry for this barcode in the same mode
        const existingIndex = rows.findIndex(
          (r) => r.barcode === code && r.mode === m && r.ok
        );

        if (existingIndex >= 0 && res.ok) {
          // Increment existing entry's scan count
          const updated = [...rows];
          updated[existingIndex] = {
            ...updated[existingIndex],
            scanCount: (updated[existingIndex].scanCount ?? 1) + 1,
            at: new Date().toLocaleTimeString('en-ZA', { hour12: false }),
            quantity: (updated[existingIndex].quantity ?? 0) + (res.posted?.quantity ?? 0),
            onHandAfter: res.posted?.onHandAfter ?? updated[existingIndex].onHandAfter,
          };
          return updated;
        }

        // Create new entry
        return [
          {
            key: `${Date.now()}-${code}-${rows.length}`,
            at: new Date().toLocaleTimeString('en-ZA', { hour12: false }),
            ok: res.ok,
            mode: m,
            text: res.message,
            sku: res.product?.sku ?? null,
            quantity: res.posted?.quantity ?? null,
            warehouseCode: res.posted?.warehouseCode ?? null,
            onHandAfter: res.posted?.onHandAfter ?? null,
            unitOfMeasure: res.product?.unitOfMeasure ?? null,
            barcode: code,
            scanCount: 1,
          },
          ...rows,
        ].slice(0, 50);
      });

      // Show success feedback animation for 3 seconds
      if (res.ok) {
        setSuccessFeedback(true);
        const timer = setTimeout(() => setSuccessFeedback(false), 3000);
        return () => clearTimeout(timer);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const drainQueue = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    try {
      while (queueRef.current.length > 0) {
        const code = queueRef.current.shift()!;
        setQueuedCount(queueRef.current.length);
        await processOne(code);
      }
    } finally {
      draining.current = false;
      // A safety net, not the primary mechanism: the field is cleared and
      // refocused synchronously at the point each scan is captured (see the
      // form's onSubmit and the input below), specifically so the operator
      // never has to wait for a request to resolve before the field is ready
      // for the next physical scan. This just re-asserts focus once the
      // queue empties, in case anything stole it in the meantime - unless
      // the queue's last word was "needs a unit cost", in which case that
      // field is where focus actually needs to go.
      if (needsUnitCostRef.current) {
        unitCostRef.current?.focus();
        unitCostRef.current?.select();
      } else {
        focusInput();
      }
    }
  }, [processOne, focusInput]);

  const handleScan = useCallback(
    (raw: string) => {
      const code = raw.replace(/[\r\n\t]/g, '').trim();
      if (!code) return;

      // Same code, same mode, within the guard window: a scanner double-firing
      // one physical trigger, not two separate items. Keyed on mode too, so
      // switching mode and deliberately rescanning the same item right away
      // (e.g. correcting an accidental IN by immediately scanning it back OUT)
      // is never swallowed as if it were the hardware bouncing.
      const now = Date.now();
      const { mode: m } = settingsRef.current;
      if (
        code === lastScanRef.current.code &&
        m === lastScanRef.current.mode &&
        now - lastScanRef.current.at < DUPLICATE_GUARD_MS
      ) {
        return;
      }
      lastScanRef.current = { code, mode: m, at: now };

      queueRef.current.push(code);
      setQueuedCount(queueRef.current.length);
      void drainQueue();
    },
    [drainQueue]
  );

  // Deep links from other pages (`/dashboard/scan?barcode=…`) still resolve,
  // as a lookup — never as a posted movement.
  useEffect(() => {
    if (initialBarcode) handleScan(initialBarcode);
    else focusInput();
  }, [initialBarcode, handleScan, focusInput]);

  const posting = mode !== 'lookup';
  const activeMode = MODES.find((m) => m.value === mode)!;
  const accentRing =
    mode === 'out'
      ? 'border-danger/60 focus:border-danger focus:ring-danger/25'
      : 'border-accent/[0.14] focus:border-accent focus:ring-accent/[0.18]';

  const unitsIn = log.reduce((s, r) => s + (r.ok && r.mode === 'in' ? r.quantity ?? 0 : 0), 0);
  const unitsOut = log.reduce((s, r) => s + (r.ok && r.mode === 'out' ? r.quantity ?? 0 : 0), 0);
  const unitsUsed = log.reduce((s, r) => s + (r.ok && r.mode === 'use' ? r.quantity ?? 0 : 0), 0);
  const postedCount = log.filter((r) => r.ok && r.mode !== 'lookup').length;

  return (
    <div className="flex flex-col gap-5">
      {/* Mode - set once, then scan continuously. */}
      <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => {
            const active = m.value === mode;
            const activeClass =
              m.value === 'out'
                ? 'border-danger bg-danger/15 text-danger-text'
                : 'border-accent bg-accent/15 text-accent-strong';
            return (
              <button
                key={m.value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setMode(m.value);
                  // "Use" only ever posts against the caller's own station -
                  // force the picker there rather than leaving whatever
                  // store/other-station was last selected in Scan IN/OUT.
                  if (m.value === 'use' && stationWarehouseId) setWarehouseId(stationWarehouseId);
                  focusInput();
                }}
                className={`rounded-xl border px-4 py-2.5 text-[0.9rem] font-bold transition-colors ${
                  active ? activeClass : 'border-accent/20 text-text-muted hover:border-accent/40 hover:text-text'
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2.5 text-[0.82rem] text-text-muted">{activeMode.hint}</p>

        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-accent/[0.08] pt-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">Store</span>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              disabled={!posting || mode === 'use'}
              className={`${selectClass} disabled:opacity-50`}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.type === 'engineer_station' ? w.name : `${w.code} - ${w.name}`}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">Qty per scan</span>
            <input
              type="number"
              min="0.001"
              step="0.001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={!posting || result?.product !== undefined}
              className={`${inputClass} w-28 disabled:opacity-50`}
              title={result?.product ? 'Quantity is locked while scanning. Close the product panel to change it.' : 'Quantity per scan'}
            />
          </label>

          {mode === 'in' && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[0.75rem] font-semibold text-text-muted">
                Unit cost (R)
                {result?.needsUnitCost && <span className="ml-1.5 font-bold text-danger-text">required</span>}
              </span>
              <input
                ref={unitCostRef}
                type="number"
                min="0"
                step="0.01"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="use current WAC"
                className={`${inputClass} w-44 ${
                  result?.needsUnitCost ? 'border-danger focus:border-danger focus:ring-danger/25' : ''
                }`}
              />
            </label>
          )}

          <label className="flex items-center gap-2 pb-1.5 text-[0.82rem] text-text-muted">
            <input
              type="checkbox"
              checked={soundOn}
              onChange={(e) => setSoundOn(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Beep on scan
          </label>
        </div>
      </div>

      {/* The scan field itself. A USB scanner types into this and presses Enter. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const raw = inputRef.current?.value ?? '';
          // Cleared and refocused right here, synchronously, rather than
          // waiting for this scan to finish processing - a USB scanner is
          // typing into this field the instant the operator presents the
          // next item, and it needs to land in an empty, focused input, not
          // get appended after a barcode that's merely queued.
          if (inputRef.current) inputRef.current.value = '';
          focusInput();
          handleScan(raw);
        }}
        className="rounded-2xl border border-accent/[0.14] bg-surface p-5"
      >
        <label className="flex flex-col gap-2">
          <span className="text-[0.8rem] font-semibold text-text-muted">
            {posting ? `Scan to post - ${activeMode.label}` : 'Scan or enter barcode'}
          </span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              ref={inputRef}
              type="text"
              name="barcode"
              autoComplete="off"
              placeholder="Focus here, then scan - or type and press Enter"
              className={`flex-1 rounded-xl border bg-surface-2 px-4 py-3.5 font-mono-brand text-[1.1rem] tracking-wide text-text placeholder:font-body placeholder:text-[0.9rem] placeholder:tracking-normal placeholder:text-text-faint focus:outline-none focus:ring-[3px] disabled:opacity-60 ${accentRing}`}
            />
            <CameraScanner
              buttonLabel={posting ? 'Scan with camera (continuous)' : 'Scan with camera'}
              continuous={posting}
              className="rounded-xl border border-accent/30 bg-surface-2 px-4 py-3.5 text-[0.85rem] font-semibold text-accent-strong hover:bg-accent/10 sm:w-auto"
              onScan={(value) => handleScan(value)}
            />
          </div>
        </label>

        <div className="mt-3 min-h-[1.25rem]">
          <p aria-live="polite" className="text-[0.85rem]">
            {busy ? (
              <span className="text-text-muted">
                Posting…{queuedCount > 0 ? ` (${queuedCount} more queued)` : ''}
              </span>
            ) : result ? (
              <span className={result.ok ? 'font-semibold text-accent-strong' : 'text-danger-text'}>
                {result.ok ? '✓ ' : '✕ '}
                {result.message}
              </span>
            ) : (
              <span className="text-text-faint">Waiting for a scan…</span>
            )}
          </p>
          {successFeedback && (
            <div className="mt-2 flex items-center gap-2 animate-pulse">
              <span className="text-[1.2rem]">✓</span>
              <span className="text-[0.85rem] font-semibold text-accent-strong">Scan successful! Ready for next item…</span>
            </div>
          )}
        </div>
      </form>

      {/* Live stock for whatever was scanned last. */}
      {result?.notFound && <UnrecognisedCode barcode={result.barcode} />}

      {result?.product && (
        <section className="rounded-2xl border border-accent/[0.14] bg-surface">
          {/*
            Positive confirmation that what was just scanned is a real,
            catalogued Cobro product, not just "some text decoded" - the
            barcode only got this far because productRepository.getByBarcode
            matched it against the catalogue server-side, so this badge is a
            genuine result, not decoration. It's what tells the operator, on
            a phone screen in a warehouse, "yes, scan that" vs. a random QR
            code that happens to decode to something.
          */}
          <div className="flex items-center justify-between gap-2 rounded-t-2xl border-b border-accent/[0.14] bg-accent/[0.08] px-5 py-2.5">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- small brand mark inline with text; next/image's optimizer buys nothing at this size */}
              <img src="/Asset3.png" alt="" aria-hidden="true" className="brand-logo h-4 w-auto" />
              <CheckIcon />
              <span className="text-[0.78rem] font-bold uppercase tracking-wide text-accent-strong">
                Verified Cobro product - scannable
              </span>
            </div>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="rounded px-2 py-1 text-[0.75rem] font-semibold text-text-muted hover:bg-accent/[0.15] hover:text-text transition-colors"
            >
              Close
            </button>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-accent/[0.14] px-5 py-4">
            <div>
              <h2 className="font-display text-[1.05rem] font-medium text-text">
                {result.product.sku} - {result.product.name}
              </h2>
              <p className="font-mono-brand text-[0.78rem] text-text-faint">
                Barcode: {result.product.barcode}
              </p>
            </div>
            <div className="text-right">
              <div className="text-[0.72rem] uppercase tracking-wide text-text-faint">Total on hand</div>
              <div className="font-display text-[1.15rem] text-text">
                {result.product.totalOnHand.toLocaleString()} {result.product.unitOfMeasure}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] border-collapse text-[0.86rem]">
              <thead>
                <tr className="text-left text-text-faint">
                  <th className="px-5 py-2.5 font-medium">Store</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">On hand</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">Reserved</th>
                  <th className="px-5 py-2.5 text-right font-medium tabular-nums">WAC</th>
                </tr>
              </thead>
              <tbody>
                {result.product.rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-6 text-[0.85rem] text-text-faint">
                      No stock in any warehouse yet. Switch to Scan IN to receive some.
                    </td>
                  </tr>
                ) : (
                  result.product.rows.map((row) => {
                    const touched = row.warehouseId === result.posted?.warehouseId;
                    return (
                      <tr
                        key={row.warehouseId}
                        className={`border-t border-accent/[0.08] ${touched ? 'bg-accent/[0.07]' : ''}`}
                      >
                        <td className="px-5 py-3 text-text-muted">
                          {row.warehouseCode}
                          {touched && (
                            <span className="ml-2 text-[0.72rem] font-semibold text-accent-strong">
                              {result.posted!.direction === 'in' ? '+' : '−'}
                              {result.posted!.quantity.toLocaleString()} just now
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-text">
                          {row.quantityOnHand.toLocaleString()} {result.product!.unitOfMeasure}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-text-muted">
                          {row.quantityReserved.toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-text-muted">
                          R {row.weightedAverageCost.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-4 border-t border-accent/[0.08] px-5 py-3 text-[0.82rem]">
            <a href={`/dashboard/receiving?barcode=${encodeURIComponent(result.product.barcode ?? '')}`} className="text-accent-strong hover:underline">
              Receive against a PO →
            </a>
            <a href={`/dashboard/sales?barcode=${encodeURIComponent(result.product.barcode ?? '')}`} className="text-accent-strong hover:underline">
              Requisition this product →
            </a>
            <a href={`/dashboard/adjustments?barcode=${encodeURIComponent(result.product.barcode ?? '')}`} className="text-accent-strong hover:underline">
              Adjust this product →
            </a>
          </div>
        </section>
      )}

      {/* This session's scans. Cleared on reload - the movements themselves are permanent. */}
      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-accent/[0.14] px-5 py-4">
          <div>
            <h2 className="font-display text-[1.05rem] font-medium text-text">This session</h2>
            <p className="text-[0.82rem] text-text-muted">
              {postedCount} movement{postedCount === 1 ? '' : 's'} posted · {unitsIn.toLocaleString()} in ·{' '}
              {unitsOut.toLocaleString()} out{stationWarehouseId ? ` · ${unitsUsed.toLocaleString()} used` : ''}
            </p>
          </div>
          {log.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setLog([]);
                focusInput();
              }}
              className="h-9 rounded-lg border border-accent/30 bg-surface-2 px-3 text-[0.82rem] font-semibold text-accent-strong hover:bg-accent/10"
            >
              Clear list
            </button>
          )}
        </div>

        {log.length === 0 ? (
          <p className="px-5 py-6 text-[0.85rem] text-text-faint">
            Nothing scanned yet. Pick a mode above, then scan - the running tally shows up here.
          </p>
        ) : (
          <ul className="divide-y divide-accent/[0.08]">
            {log.map((row, idx) => (
              <li key={row.key} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-5 py-2.5 text-[0.85rem]">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 flex-1">
                  <span className="font-mono-brand text-[0.78rem] text-text-faint">{row.at}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide ${
                      !row.ok
                        ? 'bg-danger/15 text-danger-text'
                        : row.mode === 'in'
                          ? 'bg-accent/15 text-accent-strong'
                          : row.mode === 'out'
                            ? 'bg-danger/15 text-danger-text'
                            : 'bg-surface-2 text-text-muted'
                    }`}
                  >
                    {!row.ok ? 'failed' : row.mode === 'lookup' ? 'look up' : row.mode}
                  </span>
                  <span className={row.ok ? 'text-text' : 'text-danger-text'}>
                    {row.text}
                    {row.scanCount > 1 && (
                      <span className="ml-1.5 font-semibold text-accent-strong">×{row.scanCount}</span>
                    )}
                  </span>
                  {row.ok && row.onHandAfter !== null && (
                    <span className="text-[0.8rem] text-text-muted">
                      → {row.onHandAfter.toLocaleString()} {row.unitOfMeasure} on hand at {row.warehouseCode}
                    </span>
                  )}
                </div>
                {row.ok && row.mode !== 'lookup' && row.scanCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setLog((rows) => {
                        const updated = [...rows];
                        if (updated[idx].scanCount > 1) {
                          updated[idx] = {
                            ...updated[idx],
                            scanCount: updated[idx].scanCount - 1,
                            quantity: (updated[idx].quantity ?? 0) - (Number(quantity) || 1),
                          };
                        } else {
                          updated.splice(idx, 1);
                        }
                        return updated;
                      });
                    }}
                    className="ml-2 rounded px-2.5 py-1 text-[0.75rem] font-semibold text-danger-text hover:bg-danger/10 transition-colors"
                  >
                    −1
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Deliberately not just red text: the whole point of the "verified Cobro
 * product" badge above is to make a genuine match unmistakable, so a
 * lookup miss needs to be just as unambiguous - not merely a status line
 * scrolled past, but its own panel that spells out that this specific code
 * is not one of ours, and gives the two most likely reasons why.
 */
function UnrecognisedCode({ barcode }: { barcode: string }) {
  return (
    <div className="rounded-2xl border border-danger/40 bg-danger/10 px-5 py-4">
      <div className="flex items-center gap-2">
        <CrossIcon />
        <span className="text-[0.85rem] font-bold text-danger-text">Not a recognised Cobro product</span>
      </div>
      <p className="mt-1.5 text-[0.82rem] text-danger-text">
        Scanned code <code className="font-mono-brand">{barcode}</code> isn&apos;t in the Cobro product
        catalogue. Either it&apos;s not a Cobro barcode at all (a courier label, a competitor&apos;s
        product, a random QR code), or it&apos;s a genuine SKU that hasn&apos;t been added to the
        catalogue yet - check{' '}
        <a href="/dashboard/products" className="underline">
          Product catalogue
        </a>{' '}
        and confirm the barcode there.
      </p>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-accent-strong">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-danger-text">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
