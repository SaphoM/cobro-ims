import { useEffect } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { NavLink } from '@/layout/NavLink';
import { roles } from '@/store/seed';
import { useCurrentUser, useStore } from '@/store/useStore';
import { NotificationBell } from '@/ui/NotificationBell';

/**
 * PORTED from src/app/dashboard/layout.tsx. The sidebar, nav list, and the
 * CSS-only off-canvas drawer (hidden checkbox + `peer-checked` variants,
 * dimmed backdrop, sticky ☰ header, in-drawer ✕, 992px breakpoint) are
 * carried over exactly — including the comment explaining why the backdrop's
 * width bound is STACKED ONTO the checked variant rather than sitting beside
 * it. The session gate that lived here is now <RequireAuth> around the route.
 */
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/products', label: 'Product catalogue' },
  { href: '/dashboard/bom', label: 'Workshop bill of materials' },
  { href: '/dashboard/purchase-orders', label: 'Purchase orders' },
  { href: '/dashboard/receiving', label: 'Goods receiving' },
  { href: '/dashboard/suppliers', label: 'Suppliers' },
  { href: '/dashboard/requisitions', label: 'Requisitions & transfers' },
  { href: '/dashboard/adjustments', label: 'Write-offs & adjustments' },
  { href: '/dashboard/assets', label: 'Assets' },
  { href: '/dashboard/reports', label: 'Dashboards & reports' },
  { href: '/dashboard/scan', label: 'Barcode / QR scan' },
  { href: '/dashboard/labels', label: 'Product labels' },
  { href: '/dashboard/audit-log', label: 'Audit log' },
  { href: '/dashboard/security', label: 'Security (2FA)' },
];

export function DashboardLayout() {
  const session = useCurrentUser();
  const signOut = useStore((s) => s.signOut);
  const resetDemoData = useStore((s) => s.resetDemoData);
  const detectIdleStock = useStore((s) => s.detectIdleStock);
  const navigate = useNavigate();

  // Automated idle-stock detection — runs on load so nobody has to remember
  // to check. It is idempotent (see `idleFlagged` in the store).
  useEffect(() => {
    detectIdleStock();
  }, [detectIdleStock]);

  const role = session ? roles.find((r) => r.id === session.roleId) : null;

  return (
    <div className="flex min-h-screen flex-1">
      {/* CSS-only mobile nav toggle — no client JS needed to open/close the drawer. */}
      <input type="checkbox" id="mobile-nav-toggle" className="peer/nav hidden" />

      <aside className="no-print fixed inset-y-0 left-0 z-40 flex w-72 -translate-x-full flex-col gap-6 overflow-y-auto border-r border-accent/[0.14] bg-surface px-4 py-6 transition-transform duration-200 ease-out peer-checked/nav:translate-x-0 min-[992px]:static min-[992px]:z-auto min-[992px]:w-60 min-[992px]:translate-x-0">
        <div className="flex items-center justify-between px-1 min-[992px]:px-0">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <svg viewBox="-36 -20 72 40" className="h-7 w-7 overflow-visible" aria-hidden="true">
              <rect x="-30" y="1" width="28" height="14" rx="2" fill="none" stroke="var(--accent)" strokeOpacity="0.4" strokeWidth="2" />
              <rect x="-14" y="-15" width="28" height="14" rx="2" fill="var(--accent)" stroke="var(--ink)" strokeOpacity="0.25" strokeWidth="1" />
              <rect x="2" y="1" width="28" height="14" rx="2" fill="none" stroke="var(--accent)" strokeOpacity="0.7" strokeWidth="2" />
            </svg>
            <span className="flex items-center gap-1.5 font-display leading-none">
              <span className="text-[1.15rem] font-extrabold text-text">COBRO</span>
              <span className="rounded-full border border-accent/40 bg-surface-2 px-1.5 py-0.5 font-body text-[0.58rem] font-bold tracking-[0.1em] text-accent">
                IMS
              </span>
            </span>
          </Link>
          {/*
            Close control lives inside the drawer itself, which sits above the backdrop
            (z-40 vs z-30), so it stays clickable while the drawer is open — without any
            element floating over the page content when the drawer is closed.
          */}
          <label
            htmlFor="mobile-nav-toggle"
            aria-label="Close navigation"
            className="-mr-1 flex h-9 w-9 flex-none items-center justify-center rounded-lg text-text-muted hover:bg-white/5 hover:text-accent min-[992px]:hidden"
          >
            ✕
          </label>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV_ITEMS.filter((item) => {
            // Workshop BOM is Engineer-only — Admin and Store don't construct BOMs.
            if (item.href === '/dashboard/bom') return role?.name === 'engineer';
            return true;
          }).map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex flex-col gap-2 border-t border-accent/[0.14] pt-4">
          <div className="flex flex-col px-1">
            <span className="text-[0.8rem] text-text-muted">{session?.fullName}</span>
            <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-accent">
              {role?.description ?? role?.name ?? 'Unknown role'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              signOut();
              navigate('/login');
            }}
            className="px-1 text-left text-[0.8rem] text-text-faint hover:text-accent"
          >
            Sign out
          </button>
          {/*
            Static-demo-only control. The Next.js app resets its in-memory data
            whenever the server restarts; this build persists to localStorage
            instead, so it needs an explicit way back to a clean seed.
          */}
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Reset all demo data back to the original seed? Anything you added will be lost.')) {
                resetDemoData();
                navigate('/login');
              }
            }}
            className="px-1 text-left text-[0.8rem] text-text-faint hover:text-danger"
          >
            Reset demo data
          </button>
        </div>
      </aside>

      {/*
        Backdrop — tapping anywhere on it closes the drawer (it's a label for the same
        checkbox, so a click toggles it).

        The width bound is stacked *onto* the checked variant (`max-[991px]:peer-checked/...`)
        rather than sitting alongside it as a separate `min-[992px]:hidden`. Those two would
        have equal specificity and Tailwind emits the peer-checked rule later, so it would win
        and leave the whole desktop layout dimmed if the drawer was opened narrow and the
        window then widened. Stacking makes "above the breakpoint" unreachable instead.
      */}
      <label
        htmlFor="mobile-nav-toggle"
        aria-hidden="true"
        className="fixed inset-0 z-30 hidden bg-black/70 max-[991px]:peer-checked/nav:block"
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          The ☰ toggle lives in normal flow inside this header — never floating over the page —
          so it can't cover page content. The header is sticky with an opaque background so it
          stays reachable while scrolling without overlapping anything.
        */}
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-accent/[0.14] bg-bg px-4 py-3 min-[992px]:hidden">
          <label
            htmlFor="mobile-nav-toggle"
            aria-label="Open navigation"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-accent/30 text-text"
          >
            ☰
          </label>
          <span className="flex items-center gap-1.5 font-display leading-none">
            <span className="text-[1rem] font-extrabold text-text">COBRO</span>
            <span className="rounded-full border border-accent/40 bg-surface-2 px-1.5 py-0.5 font-body text-[0.58rem] font-bold tracking-[0.1em] text-accent">
              IMS
            </span>
          </span>
        </header>

        {/*
          Notification bar. The bell lives here so it's reachable at every
          width — the mobile header above collapses below 992px, but this row
          persists, so Admin/Store/Engineer all keep access to notifications.
        */}
        <div className="no-print flex items-center gap-3 border-b border-accent/30 bg-accent/[0.08] px-4 py-2 sm:px-6">
          <p className="min-w-0 flex-1 text-center text-[0.8rem] text-accent">
            Static demo — everything runs in your browser and saves to this device only. No server, no database.
          </p>
          <NotificationBell />
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
