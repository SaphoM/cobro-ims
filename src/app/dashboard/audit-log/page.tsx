import { auditLogRepository, roleRepository, userRepository } from '@/lib/data';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { AccessDenied } from '@/components/access-denied';

// User-management changes and system settings are Admin's own business - a
// Stores Manager/Clerk sees everything else (receiving, requisitions,
// adjustments, transfers, catalogue). "Relevant operational history", not
// the full trail. See src/lib/permissions.ts (`view_audit_log`).
const ADMIN_ONLY_TABLES = new Set(['users', 'app_settings']);

export default async function AuditLogPage() {
  const session = await getSession();
  if (!session) {
    return <AccessDenied title="Audit log" message="Your session has expired. Please sign in again." />;
  }
  // An Engineer sees only their own requisitions (on /dashboard/sales), not
  // the system-wide audit trail - see docs/ARCHITECTURE.md §1.
  if (!(await hasPermission(session, 'view_audit_log'))) {
    return (
      <AccessDenied
        title="Audit log"
        message="The system audit trail is a Stores/Admin function. Your role does not have access to this page."
      />
    );
  }
  const isAdmin = (await roleRepository.getById(session.roleId))?.name === 'admin';

  const [allEntries, users] = await Promise.all([auditLogRepository.list(200), userRepository.list()]);
  const entries = isAdmin ? allEntries : allEntries.filter((e) => !ADMIN_ONLY_TABLES.has(e.tableName));
  const userById = new Map(users.map((u) => [u.id, u]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Audit log</h1>
        <p className="text-[0.86rem] text-text-muted">
          {isAdmin
            ? 'Every approval, issue, receipt, dispatch, invoice and product-catalogue change writes an entry here.'
            : 'Store-relevant activity - receiving, transfers, requisitions, adjustments and catalogue changes. User-administration and system-settings entries are Admin-only.'}{' '}
          Append-only by construction today - see the note below on what &quot;immutable&quot; means
          before a real database exists.
        </p>
      </div>

      <div className="rounded-xl border border-accent/30 bg-accent/[0.08] px-4 py-3 text-[0.82rem] text-accent-strong">
        The RFQ requires the audit log to be immutable <em>enforced at the database level</em> - no record
        may ever be deleted or modified. The mock repository here has no update/delete method at all, so
        nothing in this codebase can alter an entry once written, but that&apos;s an application-layer
        guarantee, not a database one. The actual trigger that enforces this in Postgres is written and
        ready in <code className="font-mono-brand">supabase/migrations/20260816100000_audit_log_immutability.sql</code>,
        waiting on a live Supabase project to apply it against.
      </div>

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">{entries.length} entries</h2>
        </div>
        {entries.length === 0 ? (
          <p className="px-5 py-6 text-[0.85rem] text-text-faint">No audited actions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[0.86rem]">
              <thead>
                <tr className="text-left text-text-faint">
                  <th className="px-5 py-2.5 font-medium">When</th>
                  <th className="px-5 py-2.5 font-medium">Table</th>
                  <th className="px-5 py-2.5 font-medium">Action</th>
                  <th className="px-5 py-2.5 font-medium">Record</th>
                  <th className="px-5 py-2.5 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t border-accent/[0.08]">
                    <td className="px-5 py-3 text-text-muted">{new Date(e.changedAt).toLocaleString('en-ZA')}</td>
                    <td className="px-5 py-3 font-mono-brand text-[0.78rem] text-text">{e.tableName}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${
                          e.action === 'insert' ? 'bg-accent/15 text-accent-strong' : 'bg-neutral-soft text-text-muted'
                        }`}
                      >
                        {e.action}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono-brand text-[0.72rem] text-text-faint">{e.recordId}</td>
                    <td className="px-5 py-3 text-text-muted">
                      {e.changedBy ? (userById.get(e.changedBy)?.fullName ?? e.changedBy) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
