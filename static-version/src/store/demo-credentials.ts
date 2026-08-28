/**
 * Three demo accounts, one per role, so permission enforcement (see
 * src/store/permissions.ts) is actually testable. The first entry is the
 * "primary" demo account shown by default on the login page.
 */
export interface DemoAccount {
  email: string;
  password: string;
  roleLabel: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: 'demo@cobroconcrete.co.za', password: 'CobroDemo2026', roleLabel: 'Admin' },
  { email: 'engineer@cobroconcrete.co.za', password: 'CobroEng2026', roleLabel: 'Engineer' },
  { email: 'store@cobroconcrete.co.za', password: 'CobroStore2026', roleLabel: 'Store' },
];

export const DEMO_EMAIL = DEMO_ACCOUNTS[0].email;
export const DEMO_PASSWORD = DEMO_ACCOUNTS[0].password;
