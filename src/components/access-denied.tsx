/**
 * Route-level RBAC gate — the second of the three layers the RBAC brief
 * calls for (menu, route, action/API). Hiding the sidebar link (see
 * src/lib/nav-items.ts) stops a role from ever seeing an unusable link, but
 * it's not a security boundary: a page whose only protection was "nobody
 * links here" is still reachable by typing the URL. Every page that renders
 * this component re-checks the same permission a mutating action on it
 * would check, independent of what the nav shows.
 *
 * Deliberately its own small component rather than four copies of the same
 * markup - `/dashboard/users` had this pattern first; extracted here once a
 * second, third and fourth page needed the identical shape.
 */
export function AccessDenied({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">{title}</h1>
      </div>
      <p className="rounded-2xl border border-danger/40 bg-danger/10 px-5 py-4 text-[0.86rem] text-danger-text">
        {message}
      </p>
    </div>
  );
}
