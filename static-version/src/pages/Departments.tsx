import { useState } from 'react';
import { useStore, type ActionResult } from '@/store/useStore';
import { inputClass } from '@/ui/form-control-classes';
import { Feedback } from '@/ui/Feedback';

/**
 * PORTED from src/app/dashboard/customers/page.tsx + customer-form.tsx.
 * Labeled "Departments" in the UI while the route and the underlying
 * Customer type keep their original names — the same deliberate split the
 * original made during the MRO scope alignment.
 */
export function DepartmentsPage() {
  const customers = useStore((s) => s.customers);
  const createCustomer = useStore((s) => s.createCustomer);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);

  const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setPending(true);
    const r = createCustomer({
      name: String(data.get('name')).trim(),
      contactEmail: String(data.get('contactEmail') ?? ''),
      contactPhone: String(data.get('contactPhone') ?? ''),
      address: String(data.get('address') ?? ''),
    });
    setPending(false);
    setResult(r);
    if (r.ok) form.reset();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Departments</h1>
        <p className="text-[0.86rem] text-text-muted">
          Internal workshops and departments — feeds the requesting-department picker on the requisitions
          page. Not customer records; Cobro IMS is internal MRO stock control, not a sales platform.
        </p>
      </div>

      <div className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
        <h2 className="mb-4 font-display text-[1.05rem] font-medium text-text">Add a department</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1.5 lg:col-span-2">
            <span className="text-[0.75rem] font-semibold text-text-muted">Name</span>
            <input name="name" required placeholder="Maintenance workshop" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">Contact email</span>
            <input type="email" name="contactEmail" placeholder="Optional" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] font-semibold text-text-muted">Contact phone</span>
            <input name="contactPhone" placeholder="Optional" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5 lg:col-span-4">
            <span className="text-[0.75rem] font-semibold text-text-muted">Address</span>
            <input name="address" placeholder="Optional" className={inputClass} />
          </label>
          <div className="flex items-end lg:col-span-4">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-90"
            >
              {pending ? 'Adding…' : 'Add department'}
            </button>
          </div>
        </form>
        <Feedback result={result} />
      </div>

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">{sorted.length} departments</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[0.86rem]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="px-5 py-2.5 font-medium">Name</th>
                <th className="px-5 py-2.5 font-medium">Email</th>
                <th className="px-5 py-2.5 font-medium">Phone</th>
                <th className="px-5 py-2.5 font-medium">Address</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.id} className="border-t border-accent/[0.08]">
                  <td className="px-5 py-3 text-text">{c.name}</td>
                  <td className="px-5 py-3 text-text-muted">{c.contactEmail ?? '—'}</td>
                  <td className="px-5 py-3 text-text-muted">{c.contactPhone ?? '—'}</td>
                  <td className="px-5 py-3 text-text-muted">{c.address ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
