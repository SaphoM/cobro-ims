'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-2 text-[0.86rem] transition-colors ${
        active ? 'bg-accent/[0.12] font-medium text-accent' : 'text-text-muted hover:bg-white/5 hover:text-text'
      }`}
    >
      {children}
    </Link>
  );
}
