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
 *
 * ATTRIBUTION - a deliberate decision, not an oversight: the phone does NOT
 * sign in. `resolveScanHandoffAction` accepts the token without any session
 * of its own, and every resolved scan is recorded as done by the DESKTOP
 * user who generated the QR (`handoff.initiatingUserId`), never by whoever
 * physically held the phone. That is a real trade-off, weighed and chosen
 * deliberately: security here rests on the token itself (unguessable,
 * single-use, expires in minutes, only visible on the initiating desktop's
 * own screen) rather than on a second login - trading "prove who's actually
 * holding the phone" for "no login step to get through mid-scan". The
 * audit trail is therefore honest about WHO IS ACCOUNTABLE (the signed-in
 * desktop operator who chose to hand their camera duty to a phone) but does
 * NOT prove who physically pressed the shutter - if that distinction ever
 * matters for Cobro, this is the file to revisit, not something to
 * silently assume away.
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
 * `/scan-session/[token]`. No phone login: see this file's top comment
 * ("ATTRIBUTION") for the deliberate trade-off. The scan is recorded against
 * the DESKTOP user who created the session, not against a phone session that
 * doesn't exist.
 *
 * This is not the same as "anonymous". `resolve()` still refuses to run
 * without a real, still-pending, unexpired handoff record - a random or
 * expired token gets exactly the same rejection an unauthenticated request
 * would. The token itself, not a login form, is the credential here: it's
 * unguessable, single-use, expires in minutes, and only ever appears on the
 * initiating desktop's own screen.
 */
export async function resolveScanHandoffAction(token: string, scannedValue: string): Promise<ScanHandoffResolveResult> {
  if (!scannedValue.trim()) {
    return { ok: false, error: 'Nothing was scanned.' };
  }
  try {
    const handoff = await scanHandoffRepository.get(token);
    if (!handoff) {
      return { ok: false, error: 'That scanning session no longer exists.' };
    }
    await scanHandoffRepository.resolve(token, handoff.initiatingUserId, scannedValue.trim());
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not complete the scan.' };
  }
}
