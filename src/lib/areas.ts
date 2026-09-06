/**
 * Factory sections an Engineer / Requester can belong to.
 *
 * Deliberately a plain constant list, not an admin-managed table — there's
 * no existing configurable-list infrastructure in this app to extend (no
 * settings CRUD beyond the single show-costs toggle in settingsRepository),
 * and a full "manage areas" screen for a fixed, short, factory-wide list
 * would be more machinery than this needs. If Cobro's real section list
 * ends up needing to change often, promote this to a repository-backed list
 * then — same shape the RoleRepository already gives Role.
 */
export const FACTORY_AREAS = [
  'Mechanical',
  'Electrical',
  'Workshop',
  'Maintenance',
  'Production',
  'Plant',
  'Operations',
  'Other',
] as const;

export type FactoryArea = (typeof FACTORY_AREAS)[number];
