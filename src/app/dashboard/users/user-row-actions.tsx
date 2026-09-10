'use client';

import { useState } from 'react';
import {
  setUserActiveAction,
  updateUserAreaAction,
  updateUserLabelPermissionAction,
  updateUserRoleAction,
} from '@/app/dashboard/users/actions';
import { selectClass } from '@/lib/ui/form-control-classes';
import { FACTORY_AREAS, isAreaScopedRole } from '@/lib/areas';
import type { LabelPermission, Role, User } from '@/lib/domain/inventory';

const LABEL_PERMISSION_OPTIONS: { value: LabelPermission; label: string }[] = [
  { value: 'inherited', label: 'Role default' },
  { value: 'allowed', label: 'Allowed (override)' },
  { value: 'revoked', label: 'Revoked (override)' },
];

/**
 * Inline role / area / QR-label-permission edit + activate/deactivate, one
 * row of the Users table. No separate "edit mode" toggle — the controls are
 * always visible, the same convention every other list-with-row-actions page
 * in the dashboard already uses (Requisitions' Approve/Issue, Purchase
 * Orders' Receive). The whole /dashboard/users page is `manage_users`-gated
 * (Admin only), and every action below re-checks that server-side, so a
 * non-Admin can never reach these controls.
 */
export function UserRowActions({ user, roles, isSelf }: { user: User; roles: Role[]; isSelf: boolean }) {
  const [roleId, setRoleId] = useState(user.roleId);
  const selectedRole = roles.find((r) => r.id === roleId);
  const isAreaScoped = isAreaScopedRole(selectedRole?.name);

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={updateUserRoleAction.bind(null, user.id)} className="flex items-center gap-2">
        <select
          name="roleId"
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          className={`${selectClass} w-40`}
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.description ?? r.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-lg border border-accent/30 bg-surface-2 px-3 text-[0.78rem] font-semibold text-accent-strong hover:bg-accent/10"
        >
          Save role
        </button>
      </form>

      {/* Admin's per-user override of `create_product_labels`. `inherited`
          follows the Save-role value's default; `allowed`/`revoked` beat it
          either way. Survives a role change (see updateUserRoleAction). */}
      <form action={updateUserLabelPermissionAction.bind(null, user.id)} className="flex items-center gap-2">
        <select
          name="labelPermission"
          defaultValue={user.labelPermission}
          aria-label="QR / Label creation permission"
          className={`${selectClass} w-40`}
        >
          {LABEL_PERMISSION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-lg border border-accent/30 bg-surface-2 px-3 text-[0.78rem] font-semibold text-accent-strong hover:bg-accent/10"
        >
          Save QR/label
        </button>
      </form>

      {isAreaScoped && (
        <form action={updateUserAreaAction.bind(null, user.id)} className="flex items-center gap-2">
          <select name="area" defaultValue={user.area ?? ''} className={`${selectClass} w-40`}>
            <option value="" disabled>
              Choose an area…
            </option>
            {FACTORY_AREAS.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-9 rounded-lg border border-accent/30 bg-surface-2 px-3 text-[0.78rem] font-semibold text-accent-strong hover:bg-accent/10"
          >
            Save area
          </button>
        </form>
      )}

      <form action={setUserActiveAction.bind(null, user.id, !user.isActive)}>
        <button
          type="submit"
          disabled={isSelf && user.isActive}
          title={isSelf && user.isActive ? "You can't deactivate your own account." : undefined}
          className={`h-9 rounded-lg border px-3 text-[0.78rem] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
            user.isActive
              ? 'border-danger/40 text-danger-text hover:bg-danger/10'
              : 'border-accent/30 text-accent-strong hover:bg-accent/10'
          }`}
        >
          {user.isActive ? 'Deactivate' : 'Activate'}
        </button>
      </form>
    </div>
  );
}
