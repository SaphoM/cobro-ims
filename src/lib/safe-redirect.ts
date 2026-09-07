/**
 * Validates a `?next=` redirect target before it's ever passed to
 * `redirect()`. The one thing this exists to stop is an open redirect: `next`
 * arrives as a plain, attacker-influenceable query string (anyone can link
 * `/login?next=https://evil.example`), so it must never be trusted as-is.
 *
 * The rule is deliberately narrow rather than a general URL parser: only a
 * same-origin, absolute path starting with a single `/` is accepted -
 * `//host/x` and `/\host/x` are both classic "looks relative, isn't"
 * bypasses for a naive `startsWith('/')` check, so those are rejected
 * explicitly rather than trusted because they passed a simpler test.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith('/')) return null;
  if (next.startsWith('//') || next.startsWith('/\\')) return null;
  return next;
}
