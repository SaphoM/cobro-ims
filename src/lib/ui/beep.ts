/**
 * Short WebAudio blip - the confirmation a warehouse operator actually works
 * off, since their eyes are on the item and the label, not the screen.
 *
 * Shared rather than duplicated: the scan station (/dashboard/scan) and the
 * Overview's scan dialog both count scans, and two copies of this would
 * eventually drift into sounding different for the same event.
 */
export function beep(ok: boolean) {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = ok ? 'square' : 'sawtooth';
    osc.frequency.value = ok ? 1180 : 220;
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (ok ? 0.11 : 0.32));
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.12 : 0.34));
    osc.onended = () => void ctx.close();
  } catch {
    // Audio is a nicety - never let it break a scan.
  }
}
