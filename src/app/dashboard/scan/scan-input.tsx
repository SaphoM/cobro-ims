'use client';

import { useEffect, useRef } from 'react';
import { CameraScanner } from '@/components/scanner/camera-scanner';

/**
 * Plain GET form, not a Server Action — a USB barcode scanner behaves like
 * a keyboard typing the barcode then pressing Enter, which is exactly what
 * submits an ordinary <form>. No client JS is required for the scan itself;
 * this component only adds autofocus (so the field is always ready to
 * receive scanner input without a click) and re-focuses after each lookup.
 *
 * The camera button is an alternative input method for mobile/tablet users
 * without a USB scanner — it fills the same field and submits the same
 * form, so the lookup that runs is identical either way.
 */
export function ScanInput({ initialValue }: { initialValue: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [initialValue]);

  return (
    <form
      ref={formRef}
      action="/dashboard/scan"
      method="GET"
      className="rounded-2xl border border-accent/[0.14] bg-surface p-5"
    >
      <label className="flex flex-col gap-2">
        <span className="text-[0.8rem] font-semibold text-text-muted">Scan or enter barcode</span>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            ref={inputRef}
            type="text"
            name="barcode"
            defaultValue={initialValue}
            autoComplete="off"
            placeholder="Focus here, then scan — or type and press Enter"
            className="flex-1 rounded-xl border border-accent/[0.14] bg-surface-2 px-4 py-3.5 font-mono-brand text-[1.1rem] tracking-wide text-text placeholder:font-body placeholder:text-[0.9rem] placeholder:tracking-normal placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/[0.18]"
          />
          <CameraScanner
            buttonLabel="Scan with camera"
            className="rounded-xl border border-accent/30 bg-surface-2 px-4 py-3.5 text-[0.85rem] font-semibold text-accent hover:bg-accent/10 sm:w-auto"
            onScan={(value) => {
              if (inputRef.current) inputRef.current.value = value;
              formRef.current?.requestSubmit();
            }}
          />
        </div>
      </label>
    </form>
  );
}
