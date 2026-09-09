'use client';

import { useActionState, useState } from 'react';
import { createUserAction, type CreateUserFormState } from '@/app/dashboard/users/actions';
import { inputClass, selectClass } from '@/lib/ui/form-control-classes';
import { FACTORY_AREAS, isAreaScopedRole } from '@/lib/areas';
import type { Role } from '@/lib/domain/inventory';

const initialState: CreateUserFormState = { error: null, success: null };

export function UserForm({ roles }: { roles: Role[] }) {
  const [state, formAction, pending] = useActionState(createUserAction, initialState);
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id ?? '');
  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const isAreaScoped = isAreaScopedRole(selectedRole?.name);

  return (
    <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
      <h2 className="mb-1 font-display text-[1.05rem] font-medium text-text">Create user</h2>
      <p className="mb-4 text-[0.83rem] text-text-muted">
        Admin, Stores Manager and Stores Clerk are full users of the system. Engineer / Requester accounts
        request stock on behalf of a factory section and must have an Area set - so must a Mechanical or
        Electrical Team Leader, which section they oversee.
      </p>

      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1.5 lg:col-span-2">
          <span className="text-[0.75rem] font-semibold text-text-muted">Name</span>
          <input name="fullName" required placeholder="Thabo Mokoena" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 lg:col-span-2">
          <span className="text-[0.75rem] font-semibold text-text-muted">Email</span>
          <input type="email" name="email" required placeholder="thabo@cobroconcrete.co.za" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Role</span>
          <select
            name="roleId"
            required
            value={selectedRoleId}
            onChange={(e) => setSelectedRoleId(e.target.value)}
            className={selectClass}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.description ?? r.name}
              </option>
            ))}
          </select>
        </label>
        {isAreaScoped && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">Area</span>
            <select name="area" required={isAreaScoped} defaultValue="" className={selectClass}>
              <option value="" disabled>
                Choose an area…
              </option>
              {FACTORY_AREAS.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-end lg:col-span-4">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
          >
            {pending ? 'Creating…' : 'Create user'}
          </button>
        </div>
      </form>

      {state.error && (
        <p role="alert" className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[0.82rem] text-danger-text">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="mt-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[0.82rem] text-accent-strong">
          {state.success}
        </p>
      )}
    </div>
  );
}
