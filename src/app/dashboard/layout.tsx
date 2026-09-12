import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession, getMfaStepUpState, getMustChangePassword } from '@/lib/auth';
import { isUsingMockData, roleRepository } from '@/lib/data';
import { signOutAction } from '@/app/dashboard/actions';
import { NavLink } from '@/app/dashboard/nav-link';
import { NotificationBell } from '@/app/dashboard/notification-bell';
import { ThemeToggle } from '@/components/theme-toggle';
import { NAV_ITEMS } from '@/lib/nav-items';
import { getNotifications } from '@/lib/notifications';
import { hasPermission } from '@/lib/permissions';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  // A first-login temporary password must be changed before any dashboard
  // route renders — can't be skipped by navigating straight to a protected page.
  if (await getMustChangePassword()) redirect('/change-password');
  // Enrolled users must finish MFA before any dashboard route renders — a
  // password-only (aal1) session is bounced back to the login code step so the
  // step-up can't be skipped by navigating straight to a protected page.
  const { stepUpPending } = await getMfaStepUpState();
  if (stepUpPending) redirect('/login');
  const role = await roleRepository.getById(session.roleId);
  const notifications = await getNotifications(session);
  // Menu visibility is the first of three separate RBAC layers (menu, route,
  // action/API) - hiding a link here is never the actual security boundary,
  // every route below independently re-checks the same permission. See
  // src/lib/nav-items.ts.
  const visibleNavItems = (
    await Promise.all(
      NAV_ITEMS.map(async (item) => ((item.permission === null || (await hasPermission(session, item.permission))) ? item : null))
    )
  ).filter((item): item is (typeof NAV_ITEMS)[number] => item !== null);

  return (
    // Desktop: a fixed-height (100dvh) shell with overflow hidden, so the
    // sidebar and the main content are independent scroll areas and neither
    // scrolls the other. Mobile keeps min-h-screen so the page scrolls
    // normally behind the off-canvas drawer.
    <div className="flex min-h-screen min-[992px]:h-[100dvh] min-[992px]:overflow-hidden">
      {/* CSS-only mobile nav toggle - no client JS needed to open/close the drawer. */}
      <input type="checkbox" id="mobile-nav-toggle" className="peer/nav hidden" />

      <aside
        className="no-print fixed inset-y-0 left-0 z-40 flex w-72 -translate-x-full flex-col gap-6 overflow-y-auto border-r border-accent/[0.14] bg-surface px-4 py-6 transition-transform duration-200 ease-out peer-checked/nav:translate-x-0 min-[992px]:static min-[992px]:z-auto min-[992px]:w-60 min-[992px]:translate-x-0"
      >
        <div className="flex items-center justify-between px-1 min-[992px]:px-0">
          {/*
            `brand-logo` handles the theme flip (Cobro's artwork ships black on
            transparent, so it's inverted on dark and left alone on light) —
            see globals.css. `w-auto` keeps the supplied 264x111 aspect ratio
            rather than squashing the lockup.
          */}
          <Link href="/dashboard" className="flex items-center">
            <Image
              src="/Asset1.png"
              alt="Cobro Concrete IMS"
              width={264}
              height={111}
              priority
              className="brand-logo h-11 w-auto"
            />
          </Link>
          {/*
            Close control lives inside the drawer itself, which sits above the backdrop
            (z-40 vs z-30), so it stays clickable while the drawer is open — without any
            element floating over the page content when the drawer is closed.
          */}
          <label
            htmlFor="mobile-nav-toggle"
            aria-label="Close navigation"
            className="-mr-1 flex h-9 w-9 flex-none items-center justify-center rounded-lg text-text-muted hover:bg-neutral-soft hover:text-accent-strong min-[992px]:hidden"
          >
            ✕
          </label>
        </div>

        {/*
          Full label, not an icon alone: an icon-only switch up here read as
          near-invisible (a faint 25%-opacity border on a 36px square) and
          nobody found it without being told where to look. A solid border
          and the word "Light"/"Dark" spelled out fixes that at a glance, and
          it sits right under the logo - above the 15-item nav list, not
          below it - so it's never a scroll away on a laptop screen. Shown in
          the mobile drawer too (this whole aside renders there as well),
          alongside the icon-only copy in the mobile header for one-tap access
          without opening the drawer first.
        */}
        <div className="flex items-center gap-2">
          <ThemeToggle className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-accent/50 bg-surface-2 px-3 py-2.5 text-[0.86rem] font-bold text-accent-strong transition-colors hover:border-accent hover:bg-accent/10" />
          <NotificationBell
            items={notifications}
            buttonClassName="flex h-11 w-11 flex-none items-center justify-center rounded-xl border-2 border-accent/50 bg-surface-2 text-accent-strong transition-colors hover:border-accent hover:bg-accent/10"
            menuAlign="left"
          />
        </div>

        <nav className="flex flex-1 flex-col gap-0.5">
          {visibleNavItems.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex flex-col gap-2 border-t border-accent/[0.14] pt-4">
          <div className="flex flex-col px-1">
            <span className="text-[0.8rem] text-text-muted">{session.fullName}</span>
            <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-accent-strong">
              {role?.description ?? role?.name ?? 'Unknown role'}
            </span>
          </div>
          <form action={signOutAction}>
            <button type="submit" className="px-1 text-left text-[0.8rem] text-text-faint hover:text-accent-strong">
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

      <div className="flex min-w-0 flex-1 flex-col min-[992px]:overflow-hidden">
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
          <Image
            src="/Asset1.png"
            alt="Cobro Concrete IMS"
            width={264}
            height={111}
            className="brand-logo h-8 w-auto"
          />
          {/* On phones the sidebar (and its toggle) is behind the drawer, so the
              theme switch and the bell get their own always-visible spot in
              the header. */}
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell
              items={notifications}
              buttonClassName="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-accent/50 bg-surface-2 text-accent-strong transition-colors hover:border-accent hover:bg-accent/10"
              menuAlign="right"
            />
            <ThemeToggle className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-accent/50 bg-surface-2 text-accent-strong transition-colors hover:border-accent hover:bg-accent/10 [&>span:last-child]:sr-only" />
          </div>
        </header>

        {isUsingMockData && (
          <div className="no-print border-b border-accent/30 bg-accent/[0.08] px-4 py-2 text-center text-[0.8rem] text-accent-strong sm:px-6">
            Running on mock data - no Supabase project is connected yet.
          </div>
        )}
        {/* On desktop this is the ONLY vertical scroll area for section content,
            so long pages never stretch the shell or move the docked sidebar. */}
        <div className="flex-1 min-[992px]:min-h-0 min-[992px]:overflow-y-auto">
          <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
