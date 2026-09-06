'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import type { NotificationItem } from '@/lib/notifications';

/**
 * The bell, its unread-style count badge, and the dropdown listing `items`
 * (see src/lib/notifications.ts for what's actually in it and why).
 *
 * Portalled to `document.body` and positioned with `fixed` coordinates read
 * off the button's own `getBoundingClientRect()`, rather than a plain
 * `absolute` child of the button - the desktop instance lives inside the
 * sidebar `<aside>`, which sets `overflow-y-auto`. Per the CSS overflow spec,
 * setting only one axis forces the other's computed value to `auto` too, so
 * the aside is an unintentional scroll/clip container on x as well - a
 * plain absolute dropdown got silently clipped to the sidebar's own width
 * instead of floating over the main content. Same underlying issue, and
 * same fix, as ScanMovement's and QuickRequisitionButton's dialogs
 * (createPortal past whatever ancestor might clip or reposition them).
 *
 * Still not the app's fixed-overlay modal pattern (ReservedCell, ScanHelp) -
 * a short list of links belongs next to the icon that opened it, not
 * centered over the whole page - but gets the same close-on-Escape and
 * close-on-outside-click treatment those modals use.
 *
 * Rendered twice from dashboard/layout.tsx (desktop sidebar, mobile sticky
 * header) with the same `items` prop, same pattern ThemeToggle already
 * uses - only one is visible at a given width, so there's no double count or
 * double state to keep in sync.
 */
export function NotificationBell({
  items,
  buttonClassName,
  menuAlign,
}: {
  items: NotificationItem[];
  buttonClassName: string;
  /** Which edge of the button the dropdown's own edge lines up with, so it
   *  opens into free space instead of off-screen. The desktop sidebar's bell
   *  sits near the left edge of a ~240px-wide column - a right-anchored
   *  panel would run off-screen to the left - so it wants 'left' (grows
   *  rightward, over the main content). The mobile header's bell sits near
   *  the right edge of the screen (after the `ml-auto` that pushes it and
   *  ThemeToggle to the end) and wants 'right' (grows leftward). */
  menuAlign: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number | null; right: number | null } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current && !menuRef.current.contains(target)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggleOpen() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 8,
        left: menuAlign === 'left' ? rect.left : null,
        right: menuAlign === 'right' ? window.innerWidth - rect.right : null,
      });
    }
    setOpen((v) => !v);
  }

  const count = items.length;

  return (
    <>
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={toggleOpen}
          aria-label={count > 0 ? `Notifications - ${count} need attention` : 'Notifications'}
          aria-expanded={open}
          aria-haspopup="true"
          className={buttonClassName}
        >
          <BellIcon />
        </button>

        {count > 0 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.62rem] font-bold leading-none text-white"
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </div>

      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Notifications"
            style={{ top: menuPos.top, left: menuPos.left ?? undefined, right: menuPos.right ?? undefined }}
            className="fixed z-50 w-72 overflow-hidden rounded-xl border border-accent/[0.14] bg-surface shadow-lg"
          >
            <div className="border-b border-accent/[0.14] px-4 py-3">
              <h3 className="font-display text-[0.9rem] font-medium text-text">Notifications</h3>
            </div>
            {count === 0 ? (
              <p className="px-4 py-6 text-center text-[0.82rem] text-text-faint">You&apos;re all caught up.</p>
            ) : (
              <ul className="flex max-h-80 flex-col divide-y divide-accent/[0.08] overflow-y-auto">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-2.5 px-4 py-3 text-[0.83rem] text-text transition-colors hover:bg-neutral-soft"
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 h-1.5 w-1.5 flex-none rounded-full ${
                          item.tone === 'warning' ? 'bg-danger' : 'bg-accent'
                        }`}
                      />
                      <span>{item.message}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
