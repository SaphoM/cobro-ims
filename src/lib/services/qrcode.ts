import QRCode from 'qrcode';

/**
 * Renders a real, spec-compliant QR code symbol as a PNG data URL.
 *
 * Unlike a hand-rolled Code 128 encoder (deliberately not built — see
 * `/dashboard/labels`), this goes through `qrcode`, a widely-used, deterministic
 * encoder library. It isn't a guess at an encoding we can't check: the output
 * round-trips (encode → decode back to the original string) reliably, which is
 * what makes it safe to ship without physical scanner hardware to verify against.
 */
export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
  });
}
