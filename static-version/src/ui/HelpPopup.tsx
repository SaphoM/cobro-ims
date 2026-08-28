import { useState } from 'react';
import { roles } from '@/store/seed';
import { useCurrentUser, useStore } from '@/store/useStore';

/**
 * Contextual section help — a horizontally scrollable set of cards
 * explaining what the current user can do in this section, with a working
 * "Don't show again".
 *
 * Two rules this follows carefully:
 *  - Content is ROLE-SPECIFIC. It never tells a user they can do something
 *    their role is not permitted to do (Admin, for instance, is never told
 *    it can requisition — it can't).
 *  - The dismissal is PER USER and PER SECTION, persisted in the store
 *    alongside everything else, so it survives a reload rather than lasting
 *    only for the session.
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
    ],
    store: [
      { title: 'Your Store stock', body: 'This is what the Store currently holds, valued at weighted-average cost.' },
      { title: 'Where stock has gone', body: 'The ledger shows quantities held at each asset, so you can see where Store stock has been distributed.' },
      { title: 'Keep an eye on reorder points', body: 'Anything below its reorder point is flagged. Raise a purchase order from the Purchase orders page.' },
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
    ],
    store: [
      { title: 'Fulfil requisitions', body: 'Approve a request to reserve the stock, then enter the quantity you actually hand over — scanned or typed. That figure is what the system trusts.' },
      { title: 'Short on stock?', body: 'Hand over what you have. The shortfall stays outstanding and reserved against the request, so it is not promised to anyone else.' },
      { title: 'Returns come back here', body: 'When an asset returns unused stock, it arrives as an Asset → Store movement for you to approve and receive.' },
    ],
    engineer: [
      { title: 'Request stock', body: 'Choose Store as the source and your asset as the destination to raise a requisition.' },
      { title: 'Move stock between assets', body: 'Set the source and destination to two assets to transfer stock directly, without going through the Store.' },
      { title: 'Return what you do not need', body: 'Send stock back with an Asset → Store movement. If stock sits unused too long you will get a notification prompting exactly this.' },
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
    ],
    engineer: [
      { title: 'Assets across the site', body: 'Every machine and workshop that can hold stock, including your own.' },
      { title: 'Check before you request', body: 'If another asset already holds what you need, an Asset → Asset transfer may be faster than a requisition.' },
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

  if (!slides || alreadyDismissed || !open) return null;

  function close() {
    if (dontShow) dismissHelp(sectionKey);
    setOpen(false);
  }

  return (
    <section className="no-print rounded-2xl border border-accent/30 bg-accent/[0.06] p-5">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-[1.05rem] font-medium text-text">What you can do here</h2>
          <p className="text-[0.82rem] text-text-muted">
            Tailored to your role — scroll sideways for more.
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close help"
          className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-text-faint hover:bg-white/5 hover:text-accent"
        >
          ✕
        </button>
      </div>

      {/* Horizontally scrollable card strip — snaps so cards land cleanly. */}
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
        {slides.map((s, i) => (
          <article
            key={i}
            className="w-[260px] flex-none snap-start rounded-xl border border-accent/[0.14] bg-surface p-4 sm:w-[300px]"
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-[0.68rem] font-bold text-accent">
                {i + 1}
              </span>
              <h3 className="font-display text-[0.92rem] font-medium text-text">{s.title}</h3>
            </div>
            <p className="text-[0.82rem] leading-relaxed text-text-muted">{s.body}</p>
          </article>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2.5 text-[0.82rem] text-text-muted">
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
          className="rounded-lg border border-accent/30 bg-surface-2 px-4 py-2 text-[0.82rem] font-semibold text-accent hover:bg-accent/10"
        >
          Got it
        </button>
      </div>
    </section>
  );
}
