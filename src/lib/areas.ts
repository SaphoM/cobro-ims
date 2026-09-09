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

/**
 * Every role whose `area` field is actually meaningful - Engineer /
 * Requester (their own section) and both Team Leader roles (which section
 * they oversee). Every other role's `area` stays null (see
 * src/app/dashboard/users/actions.ts, which clears it on a role change away
 * from this list). Centralised here rather than repeating the role-name
 * list at each of its four call sites (user-form.tsx, user-row-actions.tsx,
 * users/actions.ts) so a future area-scoped role only needs adding once.
 */
export const AREA_SCOPED_ROLES = ['engineer_requester', 'mechanical_team_leader', 'electrical_team_leader'] as const;

export function isAreaScopedRole(roleName: string | undefined | null): boolean {
  return !!roleName && (AREA_SCOPED_ROLES as readonly string[]).includes(roleName);
}
