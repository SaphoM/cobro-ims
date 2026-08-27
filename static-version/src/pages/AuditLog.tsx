import { useStore } from '@/store/useStore';

/**
 * PORTED from src/app/dashboard/audit-log/page.tsx. Append-only by
 * construction here too: the store exposes no update or delete for audit
 * entries, so nothing in this codebase can alter one once written. The
 * caveat below is restated for this build — an application-layer guarantee
 * is not a database one, and in a static build there is no database at all.
 */
export function AuditLogPage() {
  const auditLog = useStore((s) => s.auditLog);
  const users = useStore((s) => s.users);
  const userById = new Map(users.map((u) => [u.id, u]));
  const entries = [...auditLog].sort((a, b) => b.changedAt.localeCompare(a.changedAt)).slice(0, 200);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Audit log</h1>
        <p className="text-[0.86rem] text-text-muted">
          Every approval, issue, receipt, dispatch and product-catalogue change writes an entry here.
          Append-only by construction — see the note below on what &quot;immutable&quot; means without a
          real database.
        </p>
      </div>

      <div className="rounded-xl border border-accent/30 bg-accent/[0.08] px-4 py-3 text-[0.82rem] text-accent">
        The RFQ requires the audit log to be immutable <em>enforced at the database level</em> — no record
        may ever be deleted or modified. The store here has no update/delete method at all, so nothing in
        this codebase can alter an entry once written, but that&apos;s an application-layer guarantee, not a
        database one. In this static build the log lives in your browser&apos;s local storage, so it is
        per-device and clearable by you — the real trigger that enforces immutability in Postgres is written
        and ready in the main repo&apos;s{' '}
        <code className="font-mono-brand">supabase/migrations/20260816100000_audit_log_immutability.sql</code>,
        waiting on a live Supabase project.
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
                          e.action === 'insert' ? 'bg-accent/15 text-accent' : 'bg-white/5 text-text-muted'
                        }`}
                      >
                        {e.action}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono-brand text-[0.72rem] text-text-faint">{e.recordId}</td>
                    <td className="px-5 py-3 text-text-muted">
                      {e.changedBy ? userById.get(e.changedBy)?.fullName ?? e.changedBy : '—'}
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
