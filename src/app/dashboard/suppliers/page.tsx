import { supplierRepository } from '@/lib/data';
import { SupplierForm } from '@/app/dashboard/suppliers/supplier-form';

export default async function SuppliersPage() {
  const suppliers = await supplierRepository.list();
  const sorted = [...suppliers].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Suppliers</h1>
        <p className="text-[0.86rem] text-text-muted">Feeds the supplier picker on the goods receiving page.</p>
      </div>

      <SupplierForm />

      <section className="rounded-2xl border border-accent/[0.14] bg-surface">
        <div className="border-b border-accent/[0.14] px-5 py-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">{sorted.length} suppliers</h2>
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
              {sorted.map((s) => (
                <tr key={s.id} className="border-t border-accent/[0.08]">
                  <td className="px-5 py-3 text-text">{s.name}</td>
                  <td className="px-5 py-3 text-text-muted">{s.contactEmail ?? '—'}</td>
                  <td className="px-5 py-3 text-text-muted">{s.contactPhone ?? '—'}</td>
                  <td className="px-5 py-3 text-text-muted">{s.address ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
