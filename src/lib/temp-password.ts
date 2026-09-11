import { randomInt } from 'crypto';

/**
 * Generate a strong, unique, one-time temporary password for a newly created
 * user. Server-only (uses node:crypto). The value is shown ONCE to the admin
 * who created the user and is never stored in public.users, logged, or
 * hardcoded — Supabase Auth holds only its hash. The user is forced to change
 * it on first login (must_change_password flag), so it is short-lived.
 *
 * 12 chars, guaranteed to include upper/lower/digit/symbol, drawn from an
 * unambiguous alphabet (no 0/O/1/l/I) so it can be read aloud or copied.
 */
export function generateTemporaryPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digit = '23456789';
  const symbol = '!@#$%*?';
  const all = upper + lower + digit + symbol;
  const pick = (s: string) => s[randomInt(s.length)];

  const chars = [pick(upper), pick(lower), pick(digit), pick(symbol)];
  while (chars.length < 12) chars.push(pick(all));

  // Fisher–Yates shuffle so the guaranteed-class chars aren't always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
