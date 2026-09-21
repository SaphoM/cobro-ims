'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { NotificationItem } from '@/lib/notifications';
import type { AppNotification } from '@/lib/domain/inventory';
import { markNotificationReadAction } from '@/app/dashboard/notification-actions';

/**
 * The bell, its unread-style count badge, and the dropdown listing two
 * different kinds of thing (see src/lib/notifications.ts's header comment
 * for why they're not unified):
 *
 *  - `items`: live gauges - a plain link, no read state, unchanged from
 *    before this file split its content in two.
 *  - `persisted`: real per-user notification history - each with its own
 *    created_at/read_at. Clicking one marks it read (via
 *    markNotificationReadAction) and navigates; it stays in the list
 *    afterwards, just visually demoted from "unread" to "read" - reading a
 *    notification never removes it.
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
 * header) with the same props, same pattern ThemeToggle already uses - only
 * one is visible at a given width, so there's no double count or double
 * state to keep in sync.
 */
export function NotificationBell({
  items,
  persisted,
  buttonClassName,
  menuAlign,
}: {
  items: NotificationItem[];
  persisted: AppNotification[];
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
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Optimistic read state: `persisted` only reflects the server as of the
  // last render, and router.refresh() (below) takes a moment to land - this
  // fills that gap so the badge/dot update the instant a notification is
  // clicked rather than waiting on a round trip. Purely additive (ids only
  // ever get added, never removed) and merged with `n.readAt` wherever read
  // status is computed, so a stale/slow refresh can't un-read something the
  // user already opened; a fresh `persisted` with the real read_at is a
  // no-op once it arrives, since the id is already in this set.
  const [optimisticReadIds, setOptimisticReadIds] = useState<ReadonlySet<string>>(new Set());
  function isRead(n: AppNotification): boolean {
    return n.readAt != null || optimisticReadIds.has(n.id);
  }

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

  const unreadPersisted = persisted.filter((n) => !isRead(n));
  // The badge is an UNREAD count, not a history length - reading a
  // persisted notification must shrink this without shrinking `persisted`
  // itself (see the module doc comment).
  const count = items.length + unreadPersisted.length;

  function openNotification(n: AppNotification) {
    setOpen(false);
    if (!isRead(n)) {
      // Instant UI update: dot/badge reflect "read" this same tick, before
      // the server action below even resolves.
      setOptimisticReadIds((prev) => new Set(prev).add(n.id));
      startTransition(() => {
        markNotificationReadAction(n.id).then(() => router.refresh());
      });
    }
    if (n.href) router.push(n.href);
  }

  return (
    <>
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={toggleOpen}
          aria-label={count > 0 ? `Notifications - ${count} unread` : 'Notifications'}
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
            className="fixed z-50 w-80 overflow-hidden rounded-xl border border-accent/[0.14] bg-surface shadow-lg"
          >
            <div className="border-b border-accent/[0.14] px-4 py-3">
              <h3 className="font-display text-[0.9rem] font-medium text-text">Notifications</h3>
            </div>
            {items.length === 0 && persisted.length === 0 ? (
              <p className="px-4 py-6 text-center text-[0.82rem] text-text-faint">You&apos;re all caught up.</p>
            ) : (
              <ul className="flex max-h-96 flex-col divide-y divide-accent/[0.08] overflow-y-auto">
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
                {persisted.map((n) => {
                  const read = isRead(n);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => openNotification(n)}
                        className={`flex w-full items-start gap-2.5 px-4 py-3 text-left text-[0.83rem] transition-colors hover:bg-neutral-soft ${
                          read ? 'text-text-muted' : 'text-text'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`mt-1.5 h-1.5 w-1.5 flex-none rounded-full ${read ? 'bg-transparent' : 'bg-danger'}`}
                        />
                        <span className="flex flex-1 flex-col gap-0.5">
                          <span className={read ? '' : 'font-semibold'}>{n.title}</span>
                          <span className="text-text-faint">{n.message}</span>
                          <span className="text-[0.72rem] text-text-faint">{formatNotificationTimestamp(n.createdAt)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

function formatNotificationTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
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
