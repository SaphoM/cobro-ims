import { useEffect, useRef, useState } from 'react';
import { roles } from '@/store/seed';
import { useCurrentUser, useStore } from '@/store/useStore';

/**
 * Contextual section help, shown as a MODAL.
 *
 * The visual language is lifted directly from the app's existing overlay —
 * the camera scanner in CameraScanner.tsx — so this reads as a native part
 * of the UI rather than a bolted-on tutorial:
 *   backdrop   fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4
 *   panel      rounded-2xl border border-accent/[0.14] bg-surface
 *   header     font-display text-[1rem] font-medium, with a ✕ on the right
 *   buttons    the same accent / bordered-surface-2 pair used everywhere
 *   motion     transition-colors + duration-200 ease-out, matching the drawer
 * The inner slides reuse the standard card treatment (rounded-xl, border
 * accent/[0.14], bg-surface-2) already used for nested panels.
 *
 * Two rules this follows carefully:
 *  - Content is ROLE-SPECIFIC and never describes an action the role cannot
 *    perform (Admin is never told it can requisition — it can't).
 *  - Dismissal is PER USER and PER SECTION, persisted through the existing
 *    store, so it survives a reload. Closing WITHOUT ticking the box leaves
 *    the popup to appear again next time, which is the requested behaviour.
 */
type RoleName = 'admin' | 'engineer' | 'store';

interface Slide {
  title: string;
  body: string;
}

const CONTENT: Record<string, Partial<Record<RoleName, Slide[]>>> = {
  overview: {
    admin: [
      { title: 'Oversight dashboard', body: 'You see stock across the Store and every asset. Admin is a monitoring role — you can review everything but you do not raise requisitions or transfers yourself.' },
      { title: 'Stock by location', body: 'The ledger below breaks every SKU down by where it actually sits: the Store, and each asset holding stock.' },
      { title: 'Watch the exceptions', body: 'Below-reorder counts and idle stock at assets are the two things worth acting on. Idle stock also raises a notification to the relevant engineer.' },
      { title: 'Approve adjustments', body: 'Write-offs and stock corrections need your approval before they touch the ledger. That action also requires 2FA.' },
    ],
    store: [
      { title: 'Your Store stock', body: 'This is what the Store currently holds, valued at weighted-average cost.' },
      { title: 'Where stock has gone', body: 'The ledger shows quantities held at each asset, so you can see where Store stock has been distributed.' },
      { title: 'Keep an eye on reorder points', body: 'Anything below its reorder point is flagged. Raise a purchase order from the Purchase orders page.' },
      { title: 'Bringing stock in', body: 'Goods receiving and Purchase orders are both yours — that is how stock enters the Store in the first place.' },
    ],
    engineer: [
      { title: 'Your asset at a glance', body: 'The tiles summarise the stock held at your own asset — what you have on hand and what it is worth.' },
      { title: 'Other assets too', body: 'The ledger also shows quantities held by other assets, so you can see whether a part you need is already on site somewhere else.' },
      { title: 'Need something?', body: 'Raise a requisition from the Store on the Requisitions & transfers page.' },
    ],
  },
  requisitions: {
    admin: [
      { title: 'Full visibility, no actions', body: 'You can review every requisition and transfer here — Store → Asset, Asset → Asset and Asset → Store. Raising and fulfilling them is done by Engineers and the Store.' },
      { title: 'Requisition vs transfer', body: 'A requisition is a request for stock from the Store. A transfer is a movement between locations. Both are listed here and stay distinguishable.' },
      { title: 'Partial fulfilment', body: 'If less is handed over than was asked for, the record stays open with the shortfall outstanding and reserved. Watch for the "Partially fulfilled" status.' },
      { title: 'Outstanding work', body: 'The Outstanding units tile counts everything still owed across open records, so you can see at a glance whether anything is stuck.' },
    ],
    store: [
      { title: 'Fulfil requisitions', body: 'Approve a request to reserve the stock, then enter the quantity you actually hand over — scanned or typed. That figure is what the system trusts.' },
      { title: 'Short on stock?', body: 'Hand over what you have. The shortfall stays outstanding and reserved against the request, so it is not promised to anyone else.' },
      { title: 'Returns come back here', body: 'When an asset returns unused stock, it arrives as an Asset → Store movement for you to approve and receive.' },
      { title: 'Who asked for what', body: 'Every line shows its route, so you can answer where Store stock has been distributed and which asset requested it.' },
    ],
    engineer: [
      { title: 'Request stock', body: 'Choose the Store as the source and your asset as the destination to raise a requisition.' },
      { title: 'Move stock between assets', body: 'Set the source and destination to two assets to transfer stock directly, without going through the Store.' },
      { title: 'Return what you do not need', body: 'Send stock back with an Asset → Store movement. If stock sits unused too long you will get a notification prompting exactly this.' },
      { title: 'Scan to pick the product', body: 'The scan field takes a USB scanner or your camera, and selects the matching product on the form for you.' },
    ],
  },
  assets: {
    admin: [
      { title: 'Your asset register', body: 'Every machine and workshop that holds stock. Each one is a real location in the ledger.' },
      { title: 'Name and description', body: 'You can add assets and edit their name and description here.' },
      { title: 'Holdings are live', body: 'The stock shown against each asset is derived from actual movements, not entered by hand.' },
    ],
    store: [
      { title: 'Where stock goes', body: 'These are the destinations your Store stock is distributed to.' },
      { title: 'Holdings are live', body: 'Each asset shows what it currently holds, so you can see distribution at a glance.' },
      { title: 'Read-only for you', body: 'Adding and renaming assets is an Admin task. You can see every asset and what it holds.' },
    ],
    engineer: [
      { title: 'Assets across the site', body: 'Every machine and workshop that can hold stock, including your own.' },
      { title: 'Check before you request', body: 'If another asset already holds what you need, an Asset → Asset transfer may be faster than a requisition.' },
      { title: 'Read-only for you', body: 'Adding and renaming assets is an Admin task. You can see every asset and what it holds.' },
    ],
  },
};

export function HelpPopup({ sectionKey }: { sectionKey: string }) {
  const session = useCurrentUser();
  const dismissed = useStore((s) => s.helpDismissed);
  const dismissHelp = useStore((s) => s.dismissHelp);

  const roleName = (session ? roles.find((r) => r.id === session.roleId)?.name : null) as RoleName | null;
  const slides = roleName ? CONTENT[sectionKey]?.[roleName] : undefined;
  const alreadyDismissed = session ? dismissed[`${session.id}::${sectionKey}`] : false;

  const [open, setOpen] = useState(true);
  const [dontShow, setDontShow] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const shouldRender = Boolean(slides) && !alreadyDismissed && open;

  function close() {
    // Only a ticked box makes this permanent — a plain close lets the popup
    // come back next time, per the requested behaviour.
    if (dontShow) dismissHelp(sectionKey);
    setOpen(false);
  }

  // Escape to close, and lock background scroll while the modal is up —
  // the same scroll-lock principle the mobile nav drawer already uses.
  useEffect(() => {
    if (!shouldRender) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRender, dontShow]);

  if (!shouldRender || !slides) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-popup-title"
      onClick={close}
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      {/* Stop backdrop clicks from closing when they land inside the panel. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-accent/[0.14] bg-surface"
      >
        <div className="flex items-start justify-between gap-4 border-b border-accent/[0.14] px-5 py-4">
          <div>
            <h2 id="help-popup-title" className="font-display text-[1.05rem] font-medium text-text">
              What you can do here
            </h2>
            <p className="text-[0.83rem] text-text-muted">Tailored to your role — scroll sideways for more.</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Close help"
            className="rounded-lg px-2 py-1 text-text-faint transition-colors hover:bg-white/5 hover:text-accent"
          >
            ✕
          </button>
        </div>

        {/* Horizontally scrollable slides, snapping so cards land cleanly. */}
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 py-4">
          {slides.map((s, i) => (
            <article
              key={i}
              className="flex w-[240px] flex-none snap-start flex-col rounded-xl border border-accent/[0.14] bg-surface-2 p-4 sm:w-[264px]"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-accent/15 text-[0.68rem] font-bold text-accent">
                  {i + 1}
                </span>
                <h3 className="font-display text-[0.92rem] font-medium text-text">{s.title}</h3>
              </div>
              <p className="text-[0.82rem] leading-relaxed text-text-muted">{s.body}</p>
            </article>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-accent/[0.14] px-5 py-4">
          <label className="flex items-center gap-2.5 text-[0.85rem] text-text-muted">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            <span>Don&apos;t show again</span>
          </label>
          <button
            type="button"
            onClick={close}
            className="rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
