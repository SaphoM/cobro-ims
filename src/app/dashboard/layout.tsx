import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { isUsingMockData, roleRepository } from '@/lib/data';
import { signOutAction } from '@/app/dashboard/actions';
import { NavLink } from '@/app/dashboard/nav-link';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/products', label: 'Product catalogue' },
  { href: '/dashboard/bom', label: 'Bill of materials' },
  { href: '/dashboard/purchase-orders', label: 'Purchase orders' },
  { href: '/dashboard/receiving', label: 'Goods receiving' },
  { href: '/dashboard/suppliers', label: 'Suppliers' },
  { href: '/dashboard/transfers', label: 'Transfers' },
  { href: '/dashboard/adjustments', label: 'Write-offs & adjustments' },
  { href: '/dashboard/sales', label: 'Sales & dispatch' },
  { href: '/dashboard/customers', label: 'Customers' },
  { href: '/dashboard/invoices', label: 'Invoicing & billing' },
  { href: '/dashboard/reports', label: 'Dashboards & reports' },
  { href: '/dashboard/scan', label: 'Barcode / QR scan' },
  { href: '/dashboard/labels', label: 'Product labels' },
  { href: '/dashboard/audit-log', label: 'Audit log' },
  { href: '/dashboard/security', label: 'Security (2FA)' },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const role = await roleRepository.getById(session.roleId);

  return (
    <div className="flex min-h-screen">
      {/* CSS-only mobile nav toggle — no client JS needed to open/close the drawer. */}
      <input type="checkbox" id="mobile-nav-toggle" className="peer/nav hidden" />

      <aside
        className="no-print fixed inset-y-0 left-0 z-40 flex w-72 -translate-x-full flex-col gap-6 overflow-y-auto border-r border-accent/[0.14] bg-surface px-4 py-6 transition-transform duration-200 ease-out peer-checked/nav:translate-x-0 min-[992px]:static min-[992px]:z-auto min-[992px]:w-60 min-[992px]:translate-x-0"
      >
        <div className="flex items-center justify-between px-1 min-[992px]:px-0">
          <Link href="/dashboard" className="flex items-center gap-2.5">
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
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex flex-col gap-2 border-t border-accent/[0.14] pt-4">
          <div className="flex flex-col px-1">
            <span className="text-[0.8rem] text-text-muted">{session.fullName}</span>
            <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-accent">
              {role?.description ?? role?.name ?? 'Unknown role'}
            </span>
          </div>
          <form action={signOutAction}>
            <button type="submit" className="px-1 text-left text-[0.8rem] text-text-faint hover:text-accent">
              Sign out
            </button>
          </form>
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
          stays reachable while scrolling without overlapping anything: content scrolls beneath
          it rather than being hidden by it. While the drawer is open the backdrop (z-30) covers
          this header, and the drawer's own ✕ (inside the z-40 aside) is the close control.
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

        {isUsingMockData && (
          <div className="no-print border-b border-accent/30 bg-accent/[0.08] px-4 py-2 text-center text-[0.8rem] text-accent sm:px-6">
            Running on mock data — no Supabase project is connected yet.
          </div>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
