/**
 * A small, dependency-free CSV reader for the two bulk-import templates on
 * /dashboard/products (see public/templates/README.txt for the format these
 * files are documented to follow). Handles the one edge case that README
 * calls out explicitly - a quoted field containing a comma (e.g. a
 * description like `"Rubber, full-face"`) - and RFC 4180's `""` escape for a
 * literal quote inside a quoted field. Not a general-purpose CSV library:
 * no alternate delimiters, no BOM stripping beyond the one Excel commonly
 * adds, no streaming - these files are small (a few hundred rows at most)
 * and hand-filled in a spreadsheet, not machine-generated at scale.
 */

/** One data row, keyed by the (trimmed, lower-cased) header cell above it. */
export type CsvRow = Record<string, string>;

export interface ParsedCsv {
  headers: string[];
  rows: CsvRow[];
}

/** Splits one CSV line into raw field strings, honouring quoted fields.
 *  Not exported - `parseCsv` is the only entry point, since a lone line
 *  can't be parsed correctly in isolation when a quoted field spans
 *  multiple physical lines (an embedded newline inside quotes). */
function splitRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  // Strip a UTF-8 BOM, which Excel adds when saving CSV on Windows/macOS -
  // left in place, it would corrupt the very first header cell's name.
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\r') {
      // Swallowed; the paired \n (or its absence, for a lone \r) ends the record below.
    } else if (ch === '\n') {
      record.push(field);
      records.push(record);
      field = '';
      record = [];
    } else {
      field += ch;
    }
  }
  // Final record has no trailing newline to trigger the push above.
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

/**
 * Parses a full CSV file's text into a header row plus one object per data
 * row. Blank lines (no non-whitespace content anywhere in the line) are
 * skipped rather than turned into a row of empty strings - a trailing blank
 * line at the end of a spreadsheet export is normal, not a row to reject.
 */
export function parseCsv(text: string): ParsedCsv {
  const records = splitRecords(text).filter((r) => r.some((cell) => cell.trim() !== ''));
  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map((h) => h.trim().toLowerCase());
  const rows = records.slice(1).map((record) => {
    const row: CsvRow = {};
    headers.forEach((header, i) => {
      row[header] = (record[i] ?? '').trim();
    });
    return row;
  });
  return { headers, rows };
}
