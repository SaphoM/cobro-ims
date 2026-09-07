'use client';

import { useActionState, useRef } from 'react';
import {
  importOpeningStockAction,
  importProductsAction,
  type BulkImportFormState,
} from '@/app/dashboard/products/bulk-import-actions';

const initialState: BulkImportFormState = { error: null, success: null };

/**
 * The upload half of the two templates on /dashboard/products - the
 * download half (plain `<a download>` links) lives in page.tsx alongside
 * this, unchanged. See public/templates/README.txt for what each file's
 * columns mean and public/templates/*.csv for the templates themselves.
 *
 * Two independent uploads, not one combined form: a completed products file
 * can be usefully imported well before opening stock is ready (README's own
 * documented order), and each has its own required columns to validate -
 * combining them would mean explaining two different error sets under one
 * button. Both go through the same server-side rule either way: validate
 * every row first, import nothing at all if any row has a problem (see
 * bulk-import-actions.ts's doc comment).
 */
export function BulkImportForm() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <UploadCard title="Upload products" action={importProductsAction} />
      <UploadCard title="Upload opening stock" action={importOpeningStockAction} />
    </div>
  );
}

function UploadCard({
  title,
  action,
}: {
  title: string;
  action: (prevState: BulkImportFormState, formData: FormData) => Promise<BulkImportFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        // Successful or not, the file input's own "chosen file" state
        // shouldn't survive a submit - a stale filename sitting in the
        // control after an import or a rejection reads as "still queued to
        // go", when in fact nothing is chosen for the next attempt.
        formRef.current?.reset();
      }}
      className="flex flex-col gap-2 rounded-xl border border-accent/[0.14] bg-surface-2 p-3.5"
    >
      <span className="text-[0.8rem] font-semibold text-text-muted">{title}</span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="file"
          accept=".csv"
          required
          className="flex-1 text-[0.78rem] text-text-muted file:mr-3 file:rounded-md file:border file:border-accent/30 file:bg-surface file:px-2.5 file:py-1.5 file:text-[0.76rem] file:font-semibold file:text-accent-strong hover:file:bg-accent/10"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-9 flex-none rounded-lg bg-accent px-4 text-[0.82rem] font-bold text-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? 'Importing…' : 'Import'}
        </button>
      </div>

      {state.error && (
        <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[0.78rem] text-danger-text">
          <p>{state.error}</p>
          {state.rowErrors && state.rowErrors.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
              {state.rowErrors.map((rowError, i) => (
                <li key={i}>{rowError}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {state.success && (
        <p role="status" className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[0.78rem] text-accent-strong">
          {state.success}
        </p>
      )}
    </form>
  );
}
