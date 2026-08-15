/**
 * Split out from src/lib/auth.ts on purpose: that file imports `next/headers`
 * (server-only), so anything importing constants from it — including a
 * 'use client' component that just wants to display the demo email/password
 * — would pull the server-only module into the client bundle. This file has
 * no server-only imports and is safe to import from either side.
 */
export const DEMO_EMAIL = 'demo@cobroconcrete.co.za';
export const DEMO_PASSWORD = 'CobroDemo2026';
