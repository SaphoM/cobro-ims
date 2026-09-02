'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  return (
    <Link
      href={href}
      onClick={() => {
        // The mobile nav drawer is a CSS-only checkbox toggle (see dashboard/layout.tsx)
        // that persists across client-side navigations since the layout doesn't remount —
        // close it explicitly so tapping a link doesn't leave the drawer open underneath.
        const toggle = document.getElementById('mobile-nav-toggle') as HTMLInputElement | null;
        if (toggle) toggle.checked = false;
      }}
      className={`rounded-lg px-3 py-2 text-[0.86rem] transition-colors ${
        active ? 'bg-accent/[0.12] font-medium text-accent-strong' : 'text-text-muted hover:bg-neutral-soft hover:text-text'
      }`}
    >
      {children}
    </Link>
  );
}
