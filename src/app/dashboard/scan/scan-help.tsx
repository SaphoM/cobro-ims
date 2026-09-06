'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * On-demand reference for the scan station, opened from a button in the
 * page header rather than shown automatically - this is a "how do I test
 * this / how do I add a new item" lookup someone reaches for deliberately,
 * not a first-run tour that needs dismiss-tracking.
 *
 * Visual language is the app's established overlay vocabulary (the camera
 * scanner's dialog, and the same treatment used for the static-version
 * twin's HelpPopup): backdrop, rounded-2xl bg-surface panel, header with a
 * ✕, nested rounded-xl bg-surface-2 cards. Escape-to-close, backdrop-click-
 * to-close and a body scroll lock are carried over from that same
 * established pattern rather than invented fresh here.
 *
 * Content is written against this session's actually-verified behaviour
 * (permission names, the WAC fallback rule, the duplicate-scan guard
 * window, the queue) - not a generic "how scanners work" explainer - so it
 * stays true to what this specific station does.
 */
export function ScanHelp() {
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
        className="flex h-9 flex-none items-center gap-1.5 rounded-lg border border-accent/30 bg-surface-2 px-3 text-[0.82rem] font-semibold text-accent-strong transition-colors hover:bg-accent/10"
      >
        <HelpIcon />
        Help &amp; how to test
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="scan-help-title"
          onClick={() => setOpen(false)}
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          {/* Stop backdrop clicks from closing when they land inside the panel. */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-accent/[0.14] bg-surface"
          >
            <div className="flex items-start justify-between gap-4 border-b border-accent/[0.14] px-5 py-4">
              <div>
                <h2 id="scan-help-title" className="font-display text-[1.05rem] font-medium text-text">
                  Scan station help
                </h2>
                <p className="text-[0.83rem] text-text-muted">
                  How to prove scanning works, and how to get a new item ready to scan.
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close help"
                className="rounded-lg px-2 py-1 text-text-faint transition-colors hover:bg-neutral-soft hover:text-accent-strong"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4">
              <HelpSection title="Quick test - prove it actually works" defaultOpen>
                <ol className="list-decimal space-y-2 pl-5">
                  <li>
                    Open{' '}
                    <a href="/dashboard/labels" className="text-accent-strong hover:underline">
                      Product labels
                    </a>
                    , pick any product, and generate one label. Note the barcode number printed under
                    the QR code - or use the demo barcode{' '}
                    <code className="font-mono-brand">6001240912345</code> (Cement 42.5N, 50kg bag)
                    without printing anything.
                  </li>
                  <li>
                    Back here, leave the mode on <strong className="text-text">Look up only</strong> -
                    it reads a code and shows stock but never posts a movement, so it&apos;s the safe way
                    to test.
                  </li>
                  <li>
                    Scan the label with a phone/tablet camera (<strong className="text-text">Scan with
                    camera</strong>), a USB barcode scanner (click the text field first, then scan - it
                    types the code and presses Enter for you), or just type the barcode and press Enter.
                  </li>
                  <li>
                    A match shows a green{' '}
                    <strong className="text-accent-strong">VERIFIED COBRO PRODUCT - SCANNABLE</strong> banner
                    with the product&apos;s live stock in every store. Scan something that isn&apos;t
                    in the catalogue (type <code className="font-mono-brand">0000000000000</code>) and
                    you should get a red <strong className="text-danger-text">Not a recognised Cobro
                    product</strong> panel instead - that&apos;s the station correctly refusing an
                    unknown code, not a fault.
                  </li>
                  <li>
                    To prove a scan really moves stock: switch to <strong className="text-text">Scan
                    IN</strong>, pick a store, set a quantity, and scan the same barcode again. The
                    &quot;On hand&quot; figure for that store updates immediately, the scan appears
                    under <strong className="text-text">This session</strong> below the field, and it
                    shows up permanently on{' '}
                    <a href="/dashboard/reports" className="text-accent-strong hover:underline">
                      Dashboards &amp; reports
                    </a>{' '}
                    and the{' '}
                    <a href="/dashboard/audit-log" className="text-accent-strong hover:underline">
                      Audit log
                    </a>{' '}
                    tagged as coming from the scan station.
                  </li>
                </ol>
              </HelpSection>

              <HelpSection title="Register a new item so it can be scanned">
                <ol className="list-decimal space-y-2 pl-5">
                  <li>
                    Open{' '}
                    <a href="/dashboard/products" className="text-accent-strong hover:underline">
                      Product catalogue
                    </a>{' '}
                    and use the add-product form: SKU, name, unit of measure, and a barcode. This needs
                    catalogue-management permission - on the demo accounts, only{' '}
                    <strong className="text-text">Admin</strong> has it.
                  </li>
                  <li>
                    The barcode has to be one nobody else already has - the system rejects a duplicate
                    outright, naming which existing product already holds it, so two products can never
                    resolve to the same scan.
                  </li>
                  <li>
                    Once saved, go to <strong className="text-text">Product labels</strong>, select the
                    new product, and generate a sheet. That prints a real, scannable QR code alongside
                    the barcode in plain text.
                  </li>
                  <li>
                    Scan that label back in here to confirm it resolves - same as the quick test above.
                  </li>
                </ol>
              </HelpSection>

              <HelpSection title="The modes, and who can use them">
                <ul className="space-y-2">
                  <li>
                    <strong className="text-text">Look up only</strong> - reads a code and shows stock.
                    Posts nothing. Any signed-in role can use it, including Engineer / Requester.
                  </li>
                  <li>
                    <strong className="text-text">Scan IN</strong> - posts a receipt (stock up). Needs
                    the receiving permission - Admin, Stores Manager and Stores Clerk have it; Engineer /
                    Requester doesn&apos;t.
                  </li>
                  <li>
                    <strong className="text-text">Scan OUT</strong> - posts an issue (stock down). Needs
                    the requisition-issuing permission - Admin, Stores Manager and Stores Clerk have it;
                    Engineer / Requester doesn&apos;t.
                  </li>
                  <li>
                    <strong className="text-text">Use</strong> - only shown to someone with their own
                    station (an Engineer / Requester). Records stock they&apos;ve accepted and are now
                    consuming - it leaves tracked inventory for good, the same way a Scan OUT does, but
                    can only ever post against their own station, never a store or anyone else&apos;s.
                    Nobody without a station sees this mode at all.
                  </li>
                </ul>
              </HelpSection>

              <HelpSection title="Cost, quantity and the guardrails">
                <ul className="space-y-2">
                  <li>
                    <strong className="text-text">Qty per scan</strong> applies to every scan while it&apos;s
                    set - change it before scanning a batch of a different size.
                  </li>
                  <li>
                    <strong className="text-text">Unit cost</strong> (Scan IN only) can be left blank to
                    reuse that store&apos;s current weighted-average cost. If there&apos;s no stock
                    there yet, there&apos;s nothing to reuse - the Unit cost field is highlighted and
                    focused for you automatically, so the very next thing you type goes straight into
                    it rather than into another failed rescan.
                  </li>
                  <li>
                    <strong className="text-text">Scan OUT</strong> is refused if it would take a
                    store&apos;s stock negative, and the message says which of two different
                    situations it is - genuinely zero stock at this store (almost always the wrong
                    store is selected) versus some stock but not enough - and names any other
                    store that does hold it, with how much, so you&apos;re never left guessing
                    where the item actually is.
                  </li>
                  <li>
                    Scanning the exact same code twice within a quarter-second is treated as one
                    physical scanner double-firing, not two items, and only counted once - switching
                    mode and rescanning right away still counts, so correcting a mistake isn&apos;t
                    swallowed.
                  </li>
                  <li>
                    Scans are processed one at a time, in the order you scanned them, even if you scan
                    faster than the previous one has finished posting - nothing is silently dropped.
                  </li>
                </ul>
              </HelpSection>

              <HelpSection title="Using the camera">
                <ul className="space-y-2">
                  <li>
                    Needs the browser&apos;s camera permission. Blocked or dismissed by accident? A{' '}
                    <strong className="text-text">Try again</strong> button re-requests access without
                    closing the scanner.
                  </li>
                  <li>
                    In Scan IN / Scan OUT / Use mode the camera stays open after a hit so you can work
                    through a stack of items without reopening it each time - rescanning the same code
                    needs about 1.4 seconds, but a different item is accepted immediately.
                  </li>
                  <li>
                    The camera only reads real QR codes - it decodes with the same library the printed
                    labels are generated with, so anything printed from Product labels is guaranteed
                    readable.
                  </li>
                </ul>
              </HelpSection>
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

function HelpSection({
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

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.2a2.5 2.5 0 0 1 4.8 1c0 1.7-2.3 1.8-2.3 3.3" />
      <path d="M12 17.2h.01" />
    </svg>
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
