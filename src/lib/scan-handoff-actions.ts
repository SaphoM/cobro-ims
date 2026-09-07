'use server';

/**
 * Server Actions behind the desktop-to-phone camera handoff (see
 * ScanHandoffRepository in repositories.ts and `<CameraScanner>`).
 *
 * Three actions, three different callers, three different trust levels:
 *   - `createScanHandoffSessionAction` — the DESKTOP, opening the QR.
 *   - `getScanHandoffStatusAction` — the DESKTOP, polling for a result.
 *   - `resolveScanHandoffAction` — the PHONE, after its own camera has
 *     decoded an inventory code.
 *
 * None of these ever see or move inventory data themselves. A handoff
 * session carries nothing but an opaque token and, once resolved, the raw
 * string the phone's camera decoded — exactly what the desktop's own camera
 * would have produced had it been able to scan. Every mutating action that
 * scanned value might go on to trigger (post a receipt, look up a product,
 * whatever the calling form does with `onScan`) still goes through its own
 * existing permission check, unchanged — a scan only ever identifies
 * something, on desktop or phone alike.
 */

import { getSession } from '@/lib/auth';
import { scanHandoffRepository } from '@/lib/data';
import type { ScanHandoffStatus } from '@/lib/data/repositories';

export interface ScanHandoffCreateResult {
  ok: boolean;
  error: string | null;
  token: string | null;
  expiresAt: string | null;
}

/** Called by the desktop when "Scan with camera" opens on a non-mobile
 *  device. Requires a real signed-in session — an anonymous visitor gets
 *  nothing to hand off, the same as every other page in the app. */
export async function createScanHandoffSessionAction(): Promise<ScanHandoffCreateResult> {
  const session = await getSession();
  if (!session) {
    return { ok: false, error: 'Your session has expired. Please sign in again.', token: null, expiresAt: null };
  }
  const handoff = await scanHandoffRepository.create(session.id);
  return { ok: true, error: null, token: handoff.id, expiresAt: handoff.expiresAt };
}

export interface ScanHandoffStatusResult {
  status: ScanHandoffStatus | 'not_found';
  result: string | null;
}

/**
 * Polled by the desktop every couple of seconds while the handoff modal is
 * open. Deliberately readable only by the session that created it — the
 * token is unguessable already, but this closes the gap for the one case
 * that matters: a phone camera roll or a shared screenshot of the QR
 * shouldn't let a second, unrelated browser tab read back what gets scanned.
 */
export async function getScanHandoffStatusAction(token: string): Promise<ScanHandoffStatusResult> {
  const session = await getSession();
  if (!session) return { status: 'not_found', result: null };

  const handoff = await scanHandoffRepository.get(token);
  if (!handoff || handoff.initiatingUserId !== session.id) {
    return { status: 'not_found', result: null };
  }
  return { status: handoff.status, result: handoff.status === 'resolved' ? handoff.result : null };
}

export interface ScanHandoffResolveResult {
  ok: boolean;
  error: string | null;
}

/**
 * Called by the phone once its own camera has decoded a code — see
 * `/scan-session/[token]`. Requires the phone to be signed in: a camera scan
 * that can go on to trigger an inventory transaction must always come from
 * an authenticated user, never an anonymous one holding a borrowed phone.
 *
 * Deliberately does NOT require the phone's user to be the same person as
 * the desktop's — a named operator scanning on behalf of a shared Stores
 * terminal is the normal case here, not a suspicious one. `resolvedByUserId`
 * still records who actually scanned it, for the audit trail.
 */
export async function resolveScanHandoffAction(token: string, scannedValue: string): Promise<ScanHandoffResolveResult> {
  const session = await getSession();
  if (!session) {
    return { ok: false, error: 'Please log in to continue scanning.' };
  }
  if (!scannedValue.trim()) {
    return { ok: false, error: 'Nothing was scanned.' };
  }
  try {
    await scanHandoffRepository.resolve(token, session.id, scannedValue.trim());
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not complete the scan.' };
  }
}
