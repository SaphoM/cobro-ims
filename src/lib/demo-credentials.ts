/**
 * Split out from src/lib/auth.ts on purpose: that file imports `next/headers`
 * (server-only), so anything importing constants from it — including a
 * 'use client' component that just wants to display the demo email/password
 * — would pull the server-only module into the client bundle. This file has
 * no server-only imports and is safe to import from either side.
 *
 * Four accounts, one per RBAC role, so permission enforcement (see
 * src/lib/permissions.ts) is actually testable without a real user
 * directory. The first entry is the "primary" demo account shown by
 * default on the login page.
 */
export interface DemoAccount {
  email: string;
  password: string;
  roleLabel: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: 'demo@cobroconcrete.co.za', password: 'CobroDemo2026', roleLabel: 'Admin' },
  { email: 'storesmanager@cobroconcrete.co.za', password: 'CobroStoresMgr2026', roleLabel: 'Stores Manager' },
  { email: 'clerk@cobroconcrete.co.za', password: 'CobroClerk2026', roleLabel: 'Stores Clerk' },
  { email: 'engineer@cobroconcrete.co.za', password: 'CobroEngineer2026', roleLabel: 'Engineer / Requester' },
];

/**
 * Mock-auth escape hatch for users created through the in-app "Create user"
 * screen (Admin only — see src/app/dashboard/users). Those accounts don't
 * exist in the hardcoded list above, so `attemptSignIn` (src/lib/auth.ts)
 * accepts this fixed password for ANY active user record as a fallback,
 * purely so a just-created user is immediately testable — e.g. the
 * acceptance test "create a second Admin, confirm they can log in" (see
 * docs/ARCHITECTURE.md §1). This is exactly as much "auth" as the four
 * accounts above: a shared, publicly-documented demo password, not real
 * per-user credentials. It goes away with the rest of this file once real
 * Supabase Auth replaces src/lib/auth.ts.
 */
export const NEW_USER_DEFAULT_PASSWORD = 'CobroWelcome2026';

export const DEMO_EMAIL = DEMO_ACCOUNTS[0].email;
export const DEMO_PASSWORD = DEMO_ACCOUNTS[0].password;
