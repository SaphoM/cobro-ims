import { getSession } from '@/lib/auth';
import { roleRepository, userRepository } from '@/lib/data';
import { hasPermission } from '@/lib/permissions';
import { UserForm } from '@/app/dashboard/users/user-form';
import { UserRowActions } from '@/app/dashboard/users/user-row-actions';

export default async function UsersPage() {
  const session = await getSession();
  if (!session) {
    return (
      <p className="rounded-2xl border border-danger/40 bg-danger/10 px-5 py-4 text-[0.86rem] text-danger-text">
        Your session has expired. Please sign in again.
      </p>
    );
  }

  const canManageUsers = await hasPermission(session, 'manage_users');
  if (!canManageUsers) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-[1.3rem] font-medium text-text">Users</h1>
          <p className="text-[0.86rem] text-text-muted">User administration is an Admin-only function.</p>
        </div>
        <p className="rounded-2xl border border-danger/40 bg-danger/10 px-5 py-4 text-[0.86rem] text-danger-text">
          Your role does not have permission to manage users.
        </p>
      </div>
    );
  }

  const [users, roles] = await Promise.all([userRepository.list(), roleRepository.list()]);
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const sorted = [...users].sort((a, b) => a.fullName.localeCompare(b.fullName));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Users</h1>
        <p className="text-[0.86rem] text-text-muted">
          Admin, Stores Manager, Stores Clerk and Engineer / Requester — Cobro&apos;s actual operating
          roles, not a generic access hierarchy. More than one Admin is expected and fully supported;
          creating another Admin never replaces or demotes an existing one.
        </p>
      </div>

      <UserForm roles={roles} />

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">{sorted.length} users</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[0.86rem]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="px-5 py-2.5 font-medium">Name</th>
                <th className="px-5 py-2.5 font-medium">Email</th>
                <th className="px-5 py-2.5 font-medium">Role</th>
                <th className="px-5 py-2.5 font-medium">Area</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((u) => {
                const role = roleById.get(u.roleId);
                return (
                  <tr key={u.id} className="border-t border-accent/[0.08]">
                    <td className="px-5 py-3 text-text">
                      {u.fullName}
                      {u.id === session.id && <span className="ml-2 text-[0.72rem] text-text-faint">(you)</span>}
                    </td>
                    <td className="px-5 py-3 text-text-muted">{u.email}</td>
                    <td className="px-5 py-3 text-text-muted">{role?.description ?? role?.name ?? 'Unknown role'}</td>
                    <td className="px-5 py-3 text-text-muted">{u.area ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.72rem] font-semibold ${
                          u.isActive ? 'bg-accent/15 text-accent-strong' : 'bg-danger/15 text-danger-text'
                        }`}
                      >
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <UserRowActions user={u} roles={roles} isSelf={u.id === session.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
