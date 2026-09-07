/**
 * The payload a Cobro QR label carries, and how to read one back.
 *
 * A product barcode on its own says only "which item". A delivery label can
 * usefully say "which item, from whom" - so the receiving clerk scans once
 * instead of scanning and then picking the supplier by hand. That is all
 * this encodes: it does not replace the barcode, it wraps it.
 *
 *   COBRO1|<barcode>|<supplierId>
 *
 * Deliberately a delimited string rather than JSON: it stays short (QR size
 * grows with payload, and these are printed small), it survives a USB
 * scanner typing it as keyboard input without quoting or escaping trouble,
 * and it is readable by eye when something goes wrong.
 *
 * `COBRO1` is a format version, not decoration - a later format can add
 * fields as COBRO2 without a scanner having to guess which it is holding.
 *
 * BACKWARDS COMPATIBILITY IS THE POINT OF `parseScanPayload`: every label
 * printed before this existed, and every manufacturer barcode on a bag of
 * cement, is a bare barcode with no prefix. Those still scan exactly as they
 * did - anything that isn't a recognised Cobro payload is treated as a plain
 * barcode, which is what it is.
 */

const PREFIX = 'COBRO1';
const SEPARATOR = '|';

export interface ScanPayload {
  /** The product barcode - the only part that is ever required. */
  barcode: string;
  /** Supplier this label was printed for, when the label carries one. Null
   *  for a plain barcode, which is most of them. */
  supplierId: string | null;
}

/** Builds the string a QR label should encode. Without a supplier this
 *  returns the bare barcode, so a label that has nothing extra to say stays
 *  a plain barcode that any scanner anywhere already understands. */
export function encodeScanPayload({ barcode, supplierId }: ScanPayload): string {
  if (!supplierId) return barcode;
  return [PREFIX, barcode, supplierId].join(SEPARATOR);
}

/** Reads a scanned string. Never throws: an unrecognised or malformed
 *  payload degrades to "this is a plain barcode" rather than failing the
 *  scan, because a clerk holding a scanner needs a lookup attempt, not a
 *  parser error. */
export function parseScanPayload(raw: string): ScanPayload {
  const trimmed = raw.replace(/[\r\n\t]/g, '').trim();
  if (!trimmed.startsWith(`${PREFIX}${SEPARATOR}`)) {
    return { barcode: trimmed, supplierId: null };
  }
  const [, barcode = '', supplierId = ''] = trimmed.split(SEPARATOR);
  return {
    // A prefixed payload with an empty barcode is malformed; fall back to
    // the whole string so the lookup fails with "no product matches ..."
    // rather than silently searching for nothing.
    barcode: barcode || trimmed,
    supplierId: supplierId || null,
  };
}
