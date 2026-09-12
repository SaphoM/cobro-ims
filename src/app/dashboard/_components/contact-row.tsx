'use client';

import { useState, useTransition } from 'react';
import { inputClass } from '@/lib/ui/form-control-classes';

export type ContactFormState = { error: string | null; success: string | null };
type ContactAction = (prev: ContactFormState, fd: FormData) => Promise<ContactFormState>;

export type ContactRecord = {
  id: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
};

const initial: ContactFormState = { error: null, success: null };

/**
 * A single supplier/department table row with inline Edit and Delete.
 * Shared because both entities have the same shape. Edit swaps the row for an
 * inline form; Delete asks for confirmation first. Buttons disable while a
 * request is in flight (no double-submit), errors surface next to the row, and
 * on success the route revalidates so the UI reflects the real database state.
 */
export function ContactRow({
  record,
  updateAction,
  deleteAction,
  canManage,
  noun,
}: {
  record: ContactRecord;
  updateAction: ContactAction;
  deleteAction: ContactAction;
  canManage: boolean;
  noun: string;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [savePending, startSave] = useTransition();
  const [deletePending, startDelete] = useTransition();

  function handleSave(fd: FormData) {
    setSaveError(null);
    startSave(async () => {
      const res = await updateAction(initial, fd);
      if (res.error) setSaveError(res.error);
      else setEditing(false); // route revalidates → row shows the saved values
    });
  }

  function handleDelete(fd: FormData) {
    setDeleteError(null);
    startDelete(async () => {
      const res = await deleteAction(initial, fd);
      // On success the route revalidates and this row unmounts; on failure show why.
      if (res.error) setDeleteError(res.error);
    });
  }

  if (editing) {
    return (
      <tr className="border-t border-accent/[0.08] bg-surface-2/50">
        <td colSpan={5} className="px-5 py-3">
          <form action={handleSave} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
            <input type="hidden" name="id" value={record.id} />
            <label className="flex flex-col gap-1 lg:col-span-2">
              <span className="text-[0.7rem] font-semibold text-text-muted">Name</span>
              <input name="name" defaultValue={record.name} required className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.7rem] font-semibold text-text-muted">Email</span>
              <input type="email" name="contactEmail" defaultValue={record.contactEmail ?? ''} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.7rem] font-semibold text-text-muted">Phone</span>
              <input name="contactPhone" defaultValue={record.contactPhone ?? ''} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 lg:col-span-2">
              <span className="text-[0.7rem] font-semibold text-text-muted">Address</span>
              <input name="address" defaultValue={record.address ?? ''} className={inputClass} />
            </label>
            <div className="flex flex-wrap items-center gap-2 lg:col-span-6">
              <button
                type="submit"
                disabled={savePending}
                className="rounded-lg bg-accent px-4 py-2 text-[0.82rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                {savePending ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg border border-accent/30 px-4 py-2 text-[0.82rem] font-semibold text-text-muted transition-colors hover:text-text"
              >
                Cancel
              </button>
              {saveError && (
                <span role="alert" className="text-[0.8rem] text-danger-text">
                  {saveError}
                </span>
              )}
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-accent/[0.08]">
      <td className="px-5 py-3 text-text">{record.name}</td>
      <td className="px-5 py-3 text-text-muted">{record.contactEmail ?? '-'}</td>
      <td className="px-5 py-3 text-text-muted">{record.contactPhone ?? '-'}</td>
      <td className="px-5 py-3 text-text-muted">{record.address ?? '-'}</td>
      <td className="px-5 py-3 text-right">
        {canManage &&
          (confirming ? (
            <form action={handleDelete} className="flex flex-wrap items-center justify-end gap-2">
              <input type="hidden" name="id" value={record.id} />
              <span className="text-[0.78rem] text-text-muted">Delete this {noun}?</span>
              <button
                type="submit"
                disabled={deletePending}
                className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-1.5 text-[0.78rem] font-semibold text-danger-text transition-colors hover:bg-danger/20 disabled:opacity-60"
              >
                {deletePending ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-[0.78rem] text-text-muted transition-colors hover:text-text"
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex items-center justify-end gap-3">
              {deleteError && (
                <span role="alert" className="text-[0.78rem] text-danger-text">
                  {deleteError}
                </span>
              )}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-[0.78rem] font-semibold text-accent-strong transition-colors hover:underline"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="text-[0.78rem] font-semibold text-danger-text transition-colors hover:underline"
              >
                Delete
              </button>
            </div>
          ))}
      </td>
    </tr>
  );
}
