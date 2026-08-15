import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { isUsingMockData } from '@/lib/data';
import { signOutAction } from '@/app/dashboard/actions';
import { NavLink } from '@/app/dashboard/nav-link';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/products', label: 'Product catalogue' },
  { href: '/dashboard/purchase-orders', label: 'Purchase orders' },
  { href: '/dashboard/receiving', label: 'Goods receiving' },
  { href: '/dashboard/suppliers', label: 'Suppliers' },
  { href: '/dashboard/transfers', label: 'Transfers' },
  { href: '/dashboard/adjustments', label: 'Write-offs & adjustments' },
  { href: '/dashboard/sales', label: 'Sales & dispatch' },
  { href: '/dashboard/customers', label: 'Customers' },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-none flex-col gap-6 border-r border-accent/[0.14] bg-surface px-4 py-6">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-1">
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

        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex flex-col gap-2 border-t border-accent/[0.14] pt-4">
          <span className="px-1 text-[0.8rem] text-text-muted">{session.fullName}</span>
          <form action={signOutAction}>
            <button type="submit" className="px-1 text-left text-[0.8rem] text-text-faint hover:text-accent">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        {isUsingMockData && (
          <div className="border-b border-accent/30 bg-accent/[0.08] px-6 py-2 text-center text-[0.8rem] text-accent">
            Running on mock data — no Supabase project is connected yet.
          </div>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
