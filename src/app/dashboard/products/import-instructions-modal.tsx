'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * "Read the instructions" for the two bulk-import CSVs, shown as an on-demand
 * modal rather than a link out to public/templates/README.txt - reading the
 * columns, rules and worked examples inline while the upload form is still
 * on screen beats leaving the page to open a plain-text file. The content
 * here mirrors that file's substance (kept in sync by hand, since one is a
 * download artefact and the other is UI copy - see README.txt itself if the
 * two ever drift). Visual language and interaction (backdrop/Escape/scroll
 * lock/details accordion) are copied from src/app/dashboard/scan/scan-help.tsx,
 * the app's one other on-demand help modal, rather than invented fresh.
 */
export function ImportInstructionsModal() {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-accent/[0.14] px-4 py-2.5 text-[0.85rem] font-semibold text-text-muted hover:text-accent-strong"
      >
        Read the instructions
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-instructions-title"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-accent/[0.14] bg-surface"
          >
            <div className="flex items-start justify-between gap-4 border-b border-accent/[0.14] px-5 py-4">
              <div>
                <h2 id="import-instructions-title" className="font-display text-[1.05rem] font-medium text-text">
                  Inventory data import templates
                </h2>
                <p className="text-[0.83rem] text-text-muted">
                  How to fill in the two templates so an upload succeeds on the first try.
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close instructions"
                className="rounded-lg px-2 py-1 text-text-faint transition-colors hover:bg-neutral-soft hover:text-accent-strong"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4">
              <InstructionSection title="File 1: product-import-template.csv" defaultOpen>
                <p className="mb-2">
                  One row per item you stock - the master &quot;what is it&quot; list. It does not include
                  quantities, that&apos;s the second file.
                </p>
                <ul className="space-y-1.5">
                  <li>
                    <code className="font-mono-brand text-text">sku</code> - Required, unique. A short code
                    you use to identify the item, e.g. <code className="font-mono-brand">BRG-6205-2RS</code>.
                    No two rows may share one.
                  </li>
                  <li>
                    <code className="font-mono-brand text-text">name</code> - Required. The plain-language
                    item name.
                  </li>
                  <li>
                    <code className="font-mono-brand text-text">description</code> - Optional. Not yet used
                    by the app (no field shows it anywhere today) - safe to fill in for your own records, but
                    it won&apos;t appear after import.
                  </li>
                  <li>
                    <code className="font-mono-brand text-text">unit_of_measure</code> - Required. How it&apos;s
                    counted/issued, e.g. ea, box, tub, m, kg, L.
                  </li>
                  <li>
                    <code className="font-mono-brand text-text">barcode</code> - Optional. Leave blank for an
                    item with no barcode yet - the system can print its own QR labels for those once loaded.
                  </li>
                  <li>
                    <code className="font-mono-brand text-text">reorder_point</code> - Optional. On-hand at or
                    below this shows as &quot;low stock&quot; on the dashboard.
                  </li>
                  <li>
                    <code className="font-mono-brand text-text">reorder_quantity</code> - Optional. Informational
                    only for now.
                  </li>
                </ul>
              </InstructionSection>

              <InstructionSection title="File 2: opening-stock-import-template.csv">
                <p className="mb-2">
                  One row per (item, location, quantity) - what actually hydrates the system with real stock
                  levels. Import the product file first; every sku here must already exist there.
                </p>
                <ul className="space-y-1.5">
                  <li>
                    <code className="font-mono-brand text-text">sku</code> - Required. Must match a product
                    file sku exactly.
                  </li>
                  <li>
                    <code className="font-mono-brand text-text">warehouse_code</code> - Required. Which
                    store/warehouse holds this stock - ask X Spark for your confirmed location codes.
                  </li>
                  <li>
                    <code className="font-mono-brand text-text">quantity_on_hand</code> - Required. How much
                    you currently have on hand at that location, right now.
                  </li>
                  <li>
                    <code className="font-mono-brand text-text">unit_cost</code> - Required. Your best current
                    cost estimate - becomes the item&apos;s starting cost; every purchase after that
                    recalculates it automatically (weighted-average costing).
                  </li>
                </ul>
                <p className="mt-2">
                  If the same item is held at more than one location, give it one row per location - but never
                  the same item and location twice, that&apos;s rejected as a duplicate rather than silently
                  added together.
                </p>
              </InstructionSection>

              <InstructionSection title="A few rules that will make this go smoothly">
                <ul className="space-y-1.5">
                  <li>Every sku must be unique in the product file, and every sku the opening-stock file uses must exist in the product file.</li>
                  <li>Don&apos;t leave a &quot;Required&quot; column blank.</li>
                  <li>Quantities and costs must be plain numbers (e.g. 40 or 85.00) - no currency symbols, no thousand-separator commas.</li>
                  <li>If a value itself contains a comma (e.g. &quot;Rubber, full-face&quot;), wrap it in double quotes - Excel/Google Sheets do this for you automatically when saving as CSV.</li>
                  <li>Keep these as plain CSV files - if you edit in Excel, use &quot;Save As → CSV&quot; rather than saving as .xlsx.</li>
                  <li>Remove every example row before uploading - they&apos;re there to show the format only.</li>
                  <li>
                    An upload validates every row before importing anything - one bad row means nothing is
                    imported, with every problem listed at once so you can fix them all in one pass rather
                    than discovering them one upload at a time.
                  </li>
                </ul>
              </InstructionSection>
            </div>

            <div className="flex justify-end border-t border-accent/[0.14] px-5 py-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function InstructionSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-accent/[0.14] bg-surface-2 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-display text-[0.92rem] font-medium text-text">
        {title}
        <ChevronIcon />
      </summary>
      <div className="px-4 pb-4 text-[0.84rem] leading-relaxed text-text-muted">{children}</div>
    </details>
  );
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 flex-none text-text-faint transition-transform duration-200 group-open:rotate-180"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
