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
 *   COBRO3|<barcode>|<supplierId>|<expectedQuantity>|<setId>|<seq>|<setSize>
 *
 * Deliberately a delimited string rather than JSON: it stays short (QR size
 * grows with payload, and these are printed small), it survives a USB
 * scanner typing it as keyboard input without quoting or escaping trouble,
 * and it is readable by eye when something goes wrong.
 *
 * The version number is not decoration - COBRO2 exists because expected
 * quantity was added after COBRO1 already shipped on real labels, and both
 * still have to scan correctly forever. COBRO3 adds the label-set fields:
 * one "Generate sheet" run prints N labels, every one carrying the same
 * `setId` and its own `seq` out of `setSize`, so a scan can tell which print
 * run a label came from and which one of the run it is (QR 3 of 100). It is
 * a grouping + ordinal only - NOT a per-unit inventory identity, and NOT a
 * link to a goods receipt. `parseScanPayload` reads any COBRO*N*, so a label
 * never goes stale just because a later field was added.
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
  /** The print run this label belongs to (COBRO3). Every label from one
   *  "Generate sheet" run shares this code; two labels with the same `setId`
   *  came off the same run. Null for anything older or a plain barcode. */
  setId: string | null;
  /** This label's position in its run, 1-based (COBRO3) - the "3" in
   *  "QR 3 of 100". Null when the label carries no set. */
  seq: number | null;
  /** How many labels the run printed (COBRO3) - the "100" in "QR 3 of 100".
   *  Null when the label carries no set. */
  setSize: number | null;
}

/**
 * Builds the string a QR label should encode. Only as many fields as are
 * actually supplied get encoded, at the lowest format version that can carry
 * them - a label with nothing extra to say stays a plain barcode, one with
 * only a supplier stays COBRO1, and the set fields only appear (COBRO3) when
 * the label was printed as part of a numbered run.
 */
export function encodeScanPayload({
  barcode,
  supplierId,
  expectedQuantity,
  setId,
  seq,
  setSize,
}: ScanPayload): string {
  if (setId != null && seq != null && setSize != null) {
    return [
      'COBRO3',
      barcode,
      supplierId ?? '',
      expectedQuantity != null ? String(expectedQuantity) : '',
      setId,
      String(seq),
      String(setSize),
    ].join(SEPARATOR);
  }
  if (expectedQuantity != null) {
    return ['COBRO2', barcode, supplierId ?? '', String(expectedQuantity)].join(SEPARATOR);
  }
  if (supplierId) {
    return ['COBRO1', barcode, supplierId].join(SEPARATOR);
  }
  return barcode;
}

/** A positive integer or null - the shared shape of `seq` / `setSize` /
 *  `expectedQuantity` coming off a scanned string. */
function positiveIntOrNull(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Reads a scanned string. Never throws: an unrecognised or malformed
 *  payload degrades to "this is a plain barcode" rather than failing the
 *  scan, because a clerk holding a scanner needs a lookup attempt, not a
 *  parser error. */
export function parseScanPayload(raw: string): ScanPayload {
  const trimmed = raw.replace(/[\r\n\t]/g, '').trim();
  const [prefix, barcode, supplierId, expectedQuantityRaw, setIdRaw, seqRaw, setSizeRaw] =
    trimmed.split(SEPARATOR);

  if (prefix === 'COBRO3') {
    // seq/setSize only mean anything as a pair, alongside a setId - if any
    // part is missing or junk, treat the label as unnumbered rather than
    // reporting "3 of NaN".
    const setId = setIdRaw || null;
    const seq = positiveIntOrNull(seqRaw);
    const setSize = positiveIntOrNull(setSizeRaw);
    const numbered = setId != null && seq != null && setSize != null;
    return {
      // A malformed prefixed payload with no barcode falls back to the whole
      // string, so the lookup fails with "no product matches ..." rather
      // than silently searching for nothing.
      barcode: barcode || trimmed,
      supplierId: supplierId || null,
      expectedQuantity: positiveIntOrNull(expectedQuantityRaw),
      setId,
      seq: numbered ? seq : null,
      setSize: numbered ? setSize : null,
    };
  }

  if (prefix === 'COBRO2') {
    return {
      barcode: barcode || trimmed,
      supplierId: supplierId || null,
      expectedQuantity: positiveIntOrNull(expectedQuantityRaw),
      setId: null,
      seq: null,
      setSize: null,
    };
  }

  if (prefix === 'COBRO1') {
    return {
      barcode: barcode || trimmed,
      supplierId: supplierId || null,
      expectedQuantity: null,
      setId: null,
      seq: null,
      setSize: null,
    };
  }

  return { barcode: trimmed, supplierId: null, expectedQuantity: null, setId: null, seq: null, setSize: null };
}
