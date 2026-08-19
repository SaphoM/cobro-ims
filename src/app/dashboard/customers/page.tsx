import { customerRepository } from '@/lib/data';
import { CustomerForm } from '@/app/dashboard/customers/customer-form';

export default async function CustomersPage() {
  const customers = await customerRepository.list();
  const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Departments</h1>
        <p className="text-[0.86rem] text-text-muted">
          Internal workshops and departments — feeds the requesting-department picker on the requisitions
          page. Not customer records; Cobro IMS is internal MRO stock control, not a sales platform.
        </p>
      </div>

      <CustomerForm />

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
