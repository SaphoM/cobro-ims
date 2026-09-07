'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A small "i" icon that reveals a short explanation on hover, focus, or tap
 * - for the kind of one-line caveat that used to sit inline next to a field
 * label (see labels/page.tsx's Supplier/Quantity expected fields) and, once
 * the label itself got longer than the field below it, pushed neighbouring
 * fields' spacing out of alignment. The icon has a fixed footprint no matter
 * how long `text` is, so it can never do that.
 *
 * Click/tap toggles (and a click outside closes it) rather than relying on
 * hover alone, since a fair few of this app's users are on a phone or tablet
 * with no hover state at all - Stores Clerk chief among them.
 */
export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  return (
    <span ref={rootRef} className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label={text}
        aria-expanded={open}
        className="ml-1 flex h-4 w-4 flex-none items-center justify-center rounded-full border border-text-faint/50 text-[0.62rem] font-bold leading-none text-text-faint transition-colors hover:border-accent/60 hover:text-accent-strong focus-visible:border-accent/60 focus-visible:text-accent-strong"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-20 mb-1.5 w-52 -translate-x-1/2 rounded-lg border border-accent/[0.14] bg-surface-2 px-2.5 py-1.5 text-[0.72rem] font-normal normal-case leading-snug text-text-muted shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
