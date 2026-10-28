'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { switchMockUserAction } from '@/app/dashboard/mock-user-actions';

const MOCK_USERS = [
  { id: 'user-demo',        label: 'Demo Admin',          role: 'Admin' },
  { id: 'user-procurement', label: 'Demo Stores Manager', role: 'Stores Manager' },
  { id: 'user-clerk',       label: 'Demo Stores Clerk',   role: 'Stores Clerk' },
  { id: 'user-viewer',      label: 'Demo Engineer',        role: 'Engineer (Mechanical)' },
  { id: 'user-engineer-2',  label: 'Sarah Naidoo',         role: 'Engineer (Electrical)' },
  { id: 'user-supervisor',  label: 'Demo Supervisor',      role: 'Supervisor' },
];

export function MockUserSwitcher({ currentUserId }: { currentUserId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const userId = e.target.value;
    if (userId === currentUserId) return;
    const fd = new FormData();
    fd.set('userId', userId);
    startTransition(async () => {
      await switchMockUserAction(fd);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[0.78rem] text-accent-strong">
        Running on mock data · Testing as:
      </span>
      <select
        value={currentUserId}
        onChange={handleChange}
        disabled={pending}
        className="rounded-lg border border-accent/40 bg-surface-2 px-2 py-0.5 text-[0.78rem] font-semibold text-text focus:border-accent focus:outline-none disabled:opacity-60"
      >
        {MOCK_USERS.map((u) => (
          <option key={u.id} value={u.id}>
            {u.label} — {u.role}
          </option>
        ))}
      </select>
      {pending && <span className="text-[0.78rem] text-text-faint">Switching…</span>}
    </div>
  );
}
