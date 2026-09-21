'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { notificationRepository } from '@/lib/data';

/**
 * Marks one persisted notification read. `notificationRepository.markRead`
 * is itself scoped to (id, session.id) - RLS backs this up on Supabase (see
 * notifications_update_own in the migration) - so there's no way to mark
 * another user's notification read even if an id were guessed.
 *
 * `revalidatePath('/dashboard', 'layout')` invalidates the shared dashboard
 * layout's cached render (that's where NotificationBell's data comes from -
 * see dashboard/layout.tsx), so the next request for ANY /dashboard/* route
 * re-fetches getNotifications() with the updated read_at - required because
 * client-side navigation between routes under the same layout would
 * otherwise keep serving the layout's previous render.
 */
export async function markNotificationReadAction(id: string): Promise<void> {
  const session = await getSession();
  if (!session) return;
  await notificationRepository.markRead(id, session.id);
  revalidatePath('/dashboard', 'layout');
}
