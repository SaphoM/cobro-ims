import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { roles } from '@/store/seed';
import { useCurrentUser, useStore, visibleNotifications } from '@/store/useStore';

/**
 * Role-aware notification bell.
 *
 * Filtering happens in `visibleNotifications` (store) rather than here, so
 * the same rule drives both the badge count and the list: a notification
 * reaches you if your role is in its audience AND, when it is scoped to an
 * asset, either you are an engineer at that asset or you hold an
 * organisation-wide role (Admin, Store).
 *
 * Idle-stock notifications carry an inline "Return to Store" action, which
 * is the prompt the automated detection exists to deliver.
 */
export function NotificationBell() {
  const session = useCurrentUser();
  const notifications = useStore((s) => s.notifications);
  const locations = useStore((s) => s.locations);
  const markRead = useStore((s) => s.markNotificationRead);
  const markAllRead = useStore((s) => s.markAllNotificationsRead);
  const returnStockToStore = useStore((s) => s.returnStockToStore);
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Click outside to dismiss.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!session) return null;

  const roleName = roles.find((r) => r.id === session.roleId)?.name ?? '';
  const mine = visibleNotifications(notifications, roleName, session.assetId);
  const unread = mine.filter((n) => !n.readBy.includes(session.id));

  return (
    <div ref={wrapRef} className="no-print relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread.length ? ` (${unread.length} unread)` : ''}`}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-accent/30 text-text-muted transition-colors hover:bg-white/5 hover:text-accent"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[0.6rem] font-bold text-ink">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-accent/[0.14] bg-surface shadow-[0_24px_48px_-16px_rgba(0,0,0,0.7)]">
          <div className="flex items-center justify-between border-b border-accent/[0.14] px-4 py-3">
            <h2 className="font-display text-[0.95rem] font-medium text-text">Notifications</h2>
            {unread.length > 0 && (
              <button type="button" onClick={markAllRead} className="text-[0.75rem] font-semibold text-accent hover:underline">
                Mark all read
              </button>
            )}
          </div>

          {mine.length === 0 ? (
            <p className="px-4 py-6 text-[0.83rem] text-text-faint">Nothing for you right now.</p>
          ) : (
            <ul className="max-h-[22rem] overflow-y-auto">
              {[...mine]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((n) => {
                  const isUnread = !n.readBy.includes(session.id);
                  return (
                    <li
                      key={n.id}
                      className={`border-t border-accent/[0.08] px-4 py-3 first:border-t-0 ${isUnread ? 'bg-accent/[0.05]' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          markRead(n.id);
                          if (n.href) {
                            setOpen(false);
                            navigate(n.href);
                          }
                        }}
                        className="w-full text-left"
                      >
                        <div className="flex items-start gap-2">
                          {isUnread && <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-accent" />}
                          <div className="min-w-0">
                            <div className="text-[0.85rem] font-semibold text-text">{n.title}</div>
                            <p className="text-[0.79rem] leading-relaxed text-text-muted">{n.body}</p>
                            <div className="mt-1 text-[0.7rem] text-text-faint">
                              {new Date(n.createdAt).toLocaleString('en-ZA')}
                            </div>
                          </div>
                        </div>
                      </button>

                      {/* The idle-stock prompt's action: raise the return. */}
                      {n.kind === 'idle_stock' && n.assetId && n.productId && (
                        <button
                          type="button"
                          onClick={() => {
                            const r = returnStockToStore(n.assetId!, n.productId!);
                            markRead(n.id);
                            if (r.ok) {
                              setOpen(false);
                              navigate('/dashboard/requisitions');
                            }
                          }}
                          className="mt-2 rounded-lg border border-accent/30 bg-surface-2 px-3 py-1.5 text-[0.78rem] font-semibold text-accent hover:bg-accent/10"
                        >
                          Return to {locations.find((l) => l.kind === 'store')?.name ?? 'Store'}
                        </button>
                      )}
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
