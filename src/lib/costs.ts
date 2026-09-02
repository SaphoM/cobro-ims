import { settingsRepository } from '@/lib/data';
import { hasPermission } from '@/lib/permissions';
import type { User } from '@/lib/domain/inventory';

/**
 * Whether this user may see money: product prices, movement unit costs,
 * weighted-average cost and stock values.
 *
 * There is exactly one rule, resolved here so no page has to re-derive it:
 * anyone holding `manage_pricing` (Admin) always sees costs, because they
 * are the ones who set them. Everyone else sees them only while the global
 * `showCostsToAllRoles` setting is on, which only an Admin can change.
 *
 * Kept as a single async helper rather than a boolean passed down through
 * props from one place, because the pages that show money are unrelated to
 * each other - the Overview ledger, the scan dialog, the catalogue and the
 * reports - and a helper each of them calls cannot drift out of step the way
 * four separate copies of the condition would.
 */
export async function canSeeCosts(user: User | null): Promise<boolean> {
  if (!user) return false;
  if (await hasPermission(user, 'manage_pricing')) return true;
  const settings = await settingsRepository.get();
  return settings.showCostsToAllRoles;
}

export { HIDDEN_COST } from '@/lib/ui/cost-display';
