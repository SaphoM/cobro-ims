/**
 * The payload a Cobro QR label carries, and how to read one back.
 *
 * A product barcode on its own says only "which item". A delivery label can
 * usefully say "which item, from whom, how many" - so the receiving clerk
 * scans once instead of scanning and then filling in the rest by hand. That
 * is all this encodes: it does not replace the barcode, it wraps it.
 *
 *   COBRO1|<barcode>|<supplierId>
 *   COBRO2|<barcode>|<supplierId>|<expectedQuantity>
 *
 * Deliberately a delimited string rather than JSON: it stays short (QR size
 * grows with payload, and these are printed small), it survives a USB
 * scanner typing it as keyboard input without quoting or escaping trouble,
 * and it is readable by eye when something goes wrong.
 *
 * The version number is not decoration - COBRO2 exists because expected
 * quantity was added after COBRO1 already shipped on real labels, and both
 * still have to scan correctly forever. `parseScanPayload` reads either (and
 * any future COBRO*N*), so a label never goes stale just because a later
 * field was added.
 *
 * BACKWARDS COMPATIBILITY IS THE POINT OF `parseScanPayload`: every label
 * printed before this existed, and every manufacturer barcode on a bag of
 * cement, is a bare barcode with no prefix. Those still scan exactly as they
 * did - anything that isn't a recognised Cobro payload is treated as a plain
 * barcode, which is what it is.
 */

const SEPARATOR = '|';

export interface ScanPayload {
  /** The product barcode - the only part that is ever required. */
  barcode: string;
  /** Supplier this label was printed for, when the label carries one. Null
   *  for a plain barcode, which is most of them. */
  supplierId: string | null;
  /** How many units this delivery is supposed to contain, when the label
   *  carries one (COBRO2+). Null for a COBRO1 label or a plain barcode -
   *  neither says anything about quantity. */
  expectedQuantity: number | null;
}

/**
 * Builds the string a QR label should encode. Only as many fields as are
 * actually supplied get encoded, at the lowest format version that can carry
 * them - a label with nothing extra to say stays a plain barcode, and one
 * with only a supplier stays COBRO1, so nothing gains a field it doesn't use.
 */
export function encodeScanPayload({ barcode, supplierId, expectedQuantity }: ScanPayload): string {
  if (expectedQuantity != null) {
    return ['COBRO2', barcode, supplierId ?? '', String(expectedQuantity)].join(SEPARATOR);
  }
  if (supplierId) {
    return ['COBRO1', barcode, supplierId].join(SEPARATOR);
  }
  return barcode;
}

/** Reads a scanned string. Never throws: an unrecognised or malformed
 *  payload degrades to "this is a plain barcode" rather than failing the
 *  scan, because a clerk holding a scanner needs a lookup attempt, not a
 *  parser error. */
export function parseScanPayload(raw: string): ScanPayload {
  const trimmed = raw.replace(/[\r\n\t]/g, '').trim();
  const [prefix, barcode, supplierId, expectedQuantityRaw] = trimmed.split(SEPARATOR);

  if (prefix === 'COBRO2') {
    const expectedQuantity = Number(expectedQuantityRaw);
    return {
      // A malformed prefixed payload with no barcode falls back to the whole
      // string, so the lookup fails with "no product matches ..." rather
      // than silently searching for nothing.
      barcode: barcode || trimmed,
      supplierId: supplierId || null,
      expectedQuantity: Number.isFinite(expectedQuantity) && expectedQuantity > 0 ? expectedQuantity : null,
    };
  }

  if (prefix === 'COBRO1') {
    return { barcode: barcode || trimmed, supplierId: supplierId || null, expectedQuantity: null };
  }

  return { barcode: trimmed, supplierId: null, expectedQuantity: null };
}
