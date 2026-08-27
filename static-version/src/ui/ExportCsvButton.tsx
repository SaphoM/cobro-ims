/**
 * PORTED VERBATIM from src/components/export-csv-button.tsx — it was already
 * a 'use client' component doing everything in the browser, so nothing about
 * it needed to change for the static build.
 *
 * Covers the RFQ's non-functional requirement "All data exportable to
 * Excel / CSV at any time; no data lock-in." Excel opens CSV natively.
 */
export function ExportCsvButton<T extends object>({ filename, rows }: { filename: string; rows: T[] }) {
  function handleExport() {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]) as (keyof T)[];
    const csvLines = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((key) => {
            const value = row[key];
            const cell = value == null ? '' : String(value);
            // Quote any cell containing a comma, quote, or newline; escape embedded quotes.
            return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
          })
          .join(',')
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={rows.length === 0}
      className="rounded-lg border border-accent/30 bg-surface-2 px-3 py-1.5 text-[0.78rem] font-semibold text-accent transition-colors hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
    >
      Export CSV
    </button>
  );
}
