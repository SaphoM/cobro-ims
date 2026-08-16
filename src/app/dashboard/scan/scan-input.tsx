'use client';

import { useEffect, useRef } from 'react';

/**
 * Plain GET form, not a Server Action — a USB barcode scanner behaves like
 * a keyboard typing the barcode then pressing Enter, which is exactly what
 * submits an ordinary <form>. No client JS is required for the scan itself;
 * this component only adds autofocus (so the field is always ready to
 * receive scanner input without a click) and re-focuses after each lookup.
 */
export function ScanInput({ initialValue }: { initialValue: string }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [initialValue]);

  return (
    <form action="/dashboard/scan" method="GET" className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
      <label className="flex flex-col gap-2">
        <span className="text-[0.8rem] font-semibold text-text-muted">Scan or enter barcode</span>
        <input
          ref={inputRef}
          type="text"
          name="barcode"
          defaultValue={initialValue}
          autoComplete="off"
          placeholder="Focus here, then scan — or type and press Enter"
          className="rounded-xl border border-accent/[0.14] bg-surface-2 px-4 py-3.5 font-mono-brand text-[1.1rem] tracking-wide text-text placeholder:font-body placeholder:text-[0.9rem] placeholder:tracking-normal placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/[0.18]"
        />
      </label>
    </form>
  );
}
