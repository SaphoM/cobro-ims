import { Link, useLocation } from 'react-router-dom';

/**
 * PORTED from src/app/dashboard/nav-link.tsx — same active-state rule
 * (exact match for /dashboard, prefix match for everything else), same
 * classes, and the same explicit drawer-close on click. `usePathname` from
 * next/navigation becomes react-router's `useLocation`.
 */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const { pathname } = useLocation();
  const active = href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  return (
    <Link
      to={href}
      onClick={() => {
        // The mobile nav drawer is a CSS-only checkbox toggle (see DashboardLayout)
        // that persists across client-side navigations since the layout doesn't remount —
        // close it explicitly so tapping a link doesn't leave the drawer open underneath.
        const toggle = document.getElementById('mobile-nav-toggle') as HTMLInputElement | null;
        if (toggle) toggle.checked = false;
      }}
      className={`rounded-lg px-3 py-2 text-[0.86rem] transition-colors ${
        active ? 'bg-accent/[0.12] font-medium text-accent' : 'text-text-muted hover:bg-white/5 hover:text-text'
      }`}
    >
      {children}
    </Link>
  );
}
