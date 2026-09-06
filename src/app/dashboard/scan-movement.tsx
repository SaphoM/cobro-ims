'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { CameraScanner } from '@/components/scanner/camera-scanner';
import { lookupBarcodeAction } from '@/app/dashboard/scan/actions';
import { recordMovementAction } from '@/app/dashboard/actions';
import { HIDDEN_COST } from '@/lib/ui/cost-display';
import { beep } from '@/lib/ui/beep';

interface Identified {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  unitOfMeasure: string;
  unitPrice: number | null;
  costsVisible: boolean;
}

/**
 * Deliberate pause after every accepted scan.
 *
 * Two jobs. It absorbs a scanner double-firing one physical trigger, which
 * would otherwise silently count an item twice - the failure that matters
 * most here, because nothing on screen would look wrong afterwards. And it
 * gives the operator a beat to see the tick and the new count before the
 * next item is read, so counting stays something they can follow rather than
 * a number that blurs upward.
 */
const SCAN_COOLDOWN_MS = 1500;

/** How long the code-number field's border stays green after a confirmed match, before the field clears for the next entry. */
const CONFIRM_FLASH_MS = 450;

/** How long the "wrong item" toast stays up. */
const TOAST_MS = 3000;

/**
 * The Overview's single action: Scan. It replaces the old submit button -
 * the scan IS the posting.
 *
 * Two steps, and the dialog stays open across both until the operator closes
 * it themselves:
 *
 *   1. SCAN  - read a code (USB scanner, camera, or typed). This only
 *              identifies the product against the catalogue; nothing is
 *              written yet, so a mis-scan costs nothing.
 *   2. COUNT - the product is pinned, and every further scan of that same
 *              code adds one to the quantity. Quantity is not typeable:
 *              the count comes from scanning, which is the whole point of
 *              standing at the bench with a scanner. Over-scanned by one?
 *              "Remove 1" walks it back.
 *
 * Nothing here closes the dialog. Posting returns to step 1 with the product
 * cleared, ready for the next item, because a store receiving a delivery is
 * working through a stack - reopening the dialog per item is the thing that
 * makes a scanner slower than a clipboard.
 *
 * Quantity and unit cost are lifted to the parent form rather than held
 * here, so the values in the dialog and the values shown in the form are
 * always the same ones - the form can't display something different from
 * what gets posted.
 *
 * The overlay is portalled onto document.body: this is mounted inside the
 * form's grid, and rendering a dialog inline puts interactive controls
 * inside that form where an Enter keypress can submit it.
 */
export function ScanMovement({
  warehouseId,
  movementType,
  quantity,
  unitCost,
  onQuantityChange,
  onUnitCostChange,
  onProductIdentified,
  onPosted,
  canEditPrice = false,
  triggerHeightClassName = 'h-9',
}: {
  warehouseId: string;
  movementType: string;
  quantity: string;
  unitCost: string;
  onQuantityChange: (value: string) => void;
  onUnitCostChange: (value: string) => void;
  onProductIdentified: (productId: string) => void;
  onPosted: (message: string) => void;
  /** `manage_pricing` - Admin only. Gates CHANGING the unit cost, not seeing
   *  it: every role that may see money still sees the figure here, as bold
   *  read-only text. Gating it on the form alone would be theatre, since
   *  this dialog posts the movement - and the server ignores a non-Admin's
   *  submitted cost regardless (see recordMovementAction). */
  canEditPrice?: boolean;
  /** Height utility class for the trigger button - defaults to the 36px
   *  (`h-9`) standard every other control on this form uses, so it lines up
   *  with Store/Type/Quantity/Unit cost when rendered inline with them.
   *  Overridable because the mobile-only, full-width instance on
   *  record-movement-form.tsx is a standalone CTA with nothing beside it to
   *  align to, and wants a taller, easier tap target instead. */
  triggerHeightClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'scan' | 'count'>('scan');
  const [product, setProduct] = useState<Identified | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchRef, setBatchRef] = useState('');
  /** Last successful post, kept on screen so the operator sees it after the dialog resets. */
  const [lastPosted, setLastPosted] = useState<string | null>(null);

  // The one shared camera instance's open state. Lifted here (rather than
  // left inside CameraScanner) because TWO places need to be able to open it:
  // the primary code-entry button, and the small inline "switch to camera"
  // icon next to the text field - see ScanCodeRow below. Both drive this same
  // flag instead of each owning a separate camera/MediaStream.
  const [cameraOpen, setCameraOpen] = useState(false);

  // Controlled text for the two code-entry fields (one per step). Controlled
  // rather than left to the DOM: the border colour (idle/red/green) depends
  // on whether there is text and whether it has been confirmed, which needs
  // to be read on every keystroke.
  const [scanTyped, setScanTyped] = useState('');
  const [scanConfirmed, setScanConfirmed] = useState(false);
  const [countTyped, setCountTyped] = useState('');
  const [countConfirmed, setCountConfirmed] = useState(false);

  /*
    One entry per accepted scan, not just a running total. This is what lets
    "Remove 1" offer a choice when there is more than one to choose from -
    without it there is nothing to show a picker over, just a number. The
    array is the source of truth for the count; `quantity` (the parent
    form's field) is kept in step with it on every change via
    onQuantityChange, so the posted quantity can never drift from what these
    entries actually add up to.
  */
  const [scanEvents, setScanEvents] = useState<{ id: number; at: string }[]>([]);
  const nextEventIdRef = useRef(1);

  function resetScanEventsTo(count: 0 | 1) {
    if (count === 0) {
      setScanEvents([]);
      return;
    }
    const id = nextEventIdRef.current++;
    setScanEvents([{ id, at: new Date().toLocaleTimeString('en-ZA', { hour12: false }) }]);
    onQuantityChange('1');
  }

  function addScanEvent() {
    const id = nextEventIdRef.current++;
    setScanEvents((prev) => {
      const next = [...prev, { id, at: new Date().toLocaleTimeString('en-ZA', { hour12: false }) }];
      onQuantityChange(String(next.length));
      return next;
    });
  }

  /** Omit `id` to remove the most recent scan - what a bare "Remove 1" click does when there is only one to remove. */
  function removeScanEvent(id?: number) {
    setScanEvents((prev) => {
      if (prev.length === 0) return prev;
      const next = id === undefined ? prev.slice(0, -1) : prev.filter((e) => e.id !== id);
      onQuantityChange(String(next.length));
      return next;
    });
  }

  const scanRef = useRef<HTMLInputElement>(null);
  const countScanRef = useRef<HTMLInputElement>(null);

  /*
    Cooldown is held in BOTH a ref and state on purpose. The ref is what the
    scan handler tests against: a scanner firing twice in the same tick would
    read a stale value from state, which is precisely the double-count this
    exists to stop. The state copy only drives the countdown display.
  */
  const cooldownUntilRef = useRef(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(0);

  // The "wrong item while counting" toast. Keyed so a second mismatch while
  // the first toast is still up restarts its 3-second clock and its slide-in
  // animation, rather than being swallowed by the first timer.
  const [toast, setToast] = useState<{ key: number; message: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastCounterRef = useRef(0);

  function showToast(message: string) {
    toastCounterRef.current += 1;
    setToast({ key: toastCounterRef.current, message });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), TOAST_MS);
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (cooldownUntil === 0) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= cooldownUntil) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const cooling = cooldownUntil > now;
  const secondsLeft = cooling ? Math.max(1, Math.ceil((cooldownUntil - now) / 1000)) : 0;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Focus follows the step, after that step's DOM has committed. Both steps
  // put focus on a code field, because in both a USB scanner is the
  // expected next input.
  useEffect(() => {
    if (!open) return;
    if (step === 'scan') scanRef.current?.focus();
    else countScanRef.current?.focus();
  }, [open, step]);

  function startCooldown() {
    const until = Date.now() + SCAN_COOLDOWN_MS;
    cooldownUntilRef.current = until;
    setCooldownUntil(until);
    setNow(Date.now());
  }

  /** Back to step 1 with nothing pinned. Does NOT close the dialog. */
  function backToScan() {
    setStep('scan');
    setProduct(null);
    setError(null);
    setBatchRef('');
    setScanTyped('');
    setScanConfirmed(false);
    setCountTyped('');
    setCountConfirmed(false);
    resetScanEventsTo(0);
    cooldownUntilRef.current = 0;
    setCooldownUntil(0);
  }

  async function identify(raw: string) {
    const code = raw.replace(/[\r\n\t]/g, '').trim();
    if (!code) return;
    setBusy(true);
    setError(null);
    try {
      const res = await lookupBarcodeAction(code);
      if (res.ok && res.product) {
        setProduct({
          id: res.product.id,
          sku: res.product.sku,
          name: res.product.name,
          barcode: res.product.barcode,
          unitOfMeasure: res.product.unitOfMeasure,
          unitPrice: res.product.unitPrice,
          costsVisible: res.product.costsVisible,
        });
        // Mirror it into the form so the Product field shows what was scanned.
        onProductIdentified(res.product.id);
        // The scan that identified the item is itself the first one counted -
        // starting at 0 would make the operator scan the same item twice to
        // record one of it.
        resetScanEventsTo(1);
        // Prefill from the product's own price rather than leaving whatever
        // a previous scan left behind - a stale cost from the last item is
        // worse than a fresh one the operator has to type. Still just a
        // starting point: the field stays editable for a delivery that
        // negotiated a different price this time.
        onUnitCostChange(
          res.product.costsVisible && res.product.unitPrice !== null
            ? String(res.product.unitPrice)
            : '0'
        );
        setLastPosted(null);
        beep(true);
        startCooldown();
        // Green flash before the screen changes, so the confirmation is
        // actually seen rather than replaced by the next screen instantly.
        setScanConfirmed(true);
        setError(null);
        await new Promise((resolve) => setTimeout(resolve, CONFIRM_FLASH_MS));
        setStep('count');
      } else {
        beep(false);
        setScanConfirmed(false);
        setError(res.message);
        // Deliberately NOT clearing the field - the red border and the code
        // that was rejected stay on screen together, so the operator can see
        // exactly what was typed instead of it vanishing and the message
        // being the only trace anything happened.
        scanRef.current?.focus();
      }
    } finally {
      setBusy(false);
    }
  }

  /**
   * A scan while counting: one more of the pinned item, or a rejection.
   *
   * `refocus` is false for camera scans. The camera overlay sits on top of
   * the dialog, so pulling focus back into the field underneath it does
   * nothing visible on a desktop and pops the on-screen keyboard up behind
   * the viewfinder on a phone - which is where this feature is actually used.
   */
  function countScan(raw: string, refocus = true) {
    const code = raw.replace(/[\r\n\t]/g, '').trim();
    if (!code || !product) {
      if (refocus) countScanRef.current?.focus();
      return;
    }

    if (Date.now() < cooldownUntilRef.current) {
      // Inside the pause. Silent by design: this is overwhelmingly a scanner
      // double-fire rather than a person, and an error for it would cry wolf.
      if (refocus) {
        setCountTyped('');
        countScanRef.current?.focus();
      }
      return;
    }

    /*
      A different code is refused rather than silently switching the pinned
      product. Switching would fold two items into one count with no visible
      sign - the operator would post a quantity of the wrong thing. Refusing
      costs them one scan; switching costs a wrong stock movement.
    */
    if (product.barcode && code !== product.barcode) {
      beep(false);
      setCountConfirmed(false);
      setError(
        `That's a different item, not ${product.sku}. Scan ${product.sku} to keep counting it, or press ✕ to start a new count.`
      );
      showToast(`Wrong item - please scan ${product.sku} instead.`);
      if (refocus) countScanRef.current?.focus();
      return;
    }

    setError(null);
    setCountConfirmed(true);
    addScanEvent();
    beep(true);
    startCooldown();
    // Same green-flash-then-clear beat as the identify step, so a repeat
    // scan reads the same way the first one did.
    setTimeout(() => {
      setCountTyped('');
      setCountConfirmed(false);
      if (refocus) countScanRef.current?.focus();
    }, CONFIRM_FLASH_MS);
  }

  /** Bare "Remove 1": drops the most recent scan. Used when there's only one to choose from. */
  function removeLastScan() {
    removeScanEvent();
    setError(null);
  }

  /** From the picker: drop one specific scan, chosen by the operator rather than always "the last one". */
  function removeSpecificScan(id: number) {
    removeScanEvent(id);
    setError(null);
  }

  /**
   * The single camera's scan handler. Routes on the CURRENT step, which is
   * safe because CameraScanner holds `onScan` in a ref it refreshes every
   * render - the decode loop always calls this closure, never a stale one.
   */
  function handleCameraScan(value: string) {
    if (step === 'scan') void identify(value);
    else countScan(value, false);
  }

  async function post() {
    if (!product) return;
    if (!quantity || Number(quantity) <= 0) {
      setError('Nothing counted yet - scan the item to add one.');
      countScanRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('productId', product.id);
      fd.set('warehouseId', warehouseId);
      fd.set('movementType', movementType);
      fd.set('quantity', quantity);
      // The action requires a cost; a blank box is a real zero, not a guess.
      fd.set('unitCost', unitCost === '' ? '0' : unitCost);
      fd.set('batchRef', batchRef);

      const res = await recordMovementAction({ error: null, success: null }, fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      const message = `${res.success ?? 'Posted.'} (${Number(quantity).toLocaleString()} ${product.unitOfMeasure} of ${product.sku})`;
      onPosted(message);
      setLastPosted(message);
      // Straight back to scanning the next item. The dialog stays open.
      backToScan();
    } finally {
      setBusy(false);
    }
  }

  /*
    What the operator sees INSIDE the camera overlay. The overlay covers the
    dialog completely, so the running count, the success tick and the
    over-scan correction have to be drawn here - rendering them only in the
    dialog underneath would mean that during camera scanning, which is the
    whole point of this screen, none of them are visible.
  */
  const cameraStatus = (
    <div className="flex flex-col gap-2">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[0.78rem] leading-snug text-danger-text"
        >
          {error}
        </p>
      )}

      {step === 'count' && product ? (
        <div className="rounded-xl border-2 border-accent/50 bg-surface-3 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              {/* Product name: minty green and prominent, per the request that it be unmistakable in this compact panel. */}
              <div className="truncate text-[0.92rem] font-bold leading-snug text-[#3ddc97]">
                {product.name}
              </div>
              <div className="truncate font-mono-brand text-[0.68rem] text-text-faint">{product.sku}</div>
              <div
                aria-live="polite"
                aria-label={`Scanned quantity: ${Number(quantity) || 0} ${product.unitOfMeasure}`}
                className="mt-0.5 font-display text-[1.7rem] font-bold leading-tight tabular-nums text-text"
              >
                {Number(quantity) || 0}
                <span className="ml-1 text-[0.78rem] font-semibold text-text-muted">
                  {product.unitOfMeasure}
                </span>
              </div>
            </div>
            <RemoveOneControl
              events={scanEvents}
              onRemoveLast={removeLastScan}
              onRemoveSpecific={removeSpecificScan}
              disabled={(Number(quantity) || 0) <= 0}
            />
          </div>
          <div
            aria-live="polite"
            className="mt-1.5 flex items-center gap-1.5 border-t border-accent/20 pt-1.5"
          >
            {cooling ? (
              <>
                <span className="text-accent-strong">
                  <CheckIcon />
                </span>
                <span className="text-[0.76rem] font-semibold text-accent-strong">Counted</span>
                <span className="text-[0.76rem] text-text-faint">· ready in {secondsLeft}s</span>
              </>
            ) : (
              <span className="text-[0.95rem] font-bold text-[#9c2b2b]">Ready - scan to add 1.</span>
            )}
          </div>
        </div>
      ) : (
        <>
          {lastPosted && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-lg border border-accent/40 bg-accent/[0.12] px-3 py-2 text-[0.78rem] leading-snug text-text"
            >
              <span className="mt-0.5 flex-none text-accent-strong">
                <CheckIcon />
              </span>
              <span>{lastPosted}</span>
            </p>
          )}
          <p className="rounded-lg border border-accent/[0.14] bg-surface-2 px-3 py-2 text-[0.78rem] text-text-muted">
            Scan an item to start counting it.
          </p>
        </>
      )}
    </div>
  );

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan stock"
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      {/*
        No backdrop-click-to-close. A half-counted stack is easy to lose to a
        stray click beside the dialog, and re-counting it is the expensive
        kind of mistake. Escape and the ✕ are the two deliberate ways out.
      */}
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-accent/[0.14] bg-surface p-5">
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 className="font-display text-[1.05rem] font-medium text-text">
            {step === 'scan' ? 'Scan the item' : 'Counting'}
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close scanner"
            className="rounded-lg px-2 py-1 text-text-faint transition-colors hover:bg-neutral-soft hover:text-accent-strong"
          >
            ✕
          </button>
        </div>

        {step === 'scan' && (
          <>
            {lastPosted && (
              <p
                role="status"
                className="mb-3 flex items-start gap-2 rounded-xl border border-accent/40 bg-accent/[0.12] px-3 py-2.5 text-[0.82rem] text-text"
              >
                <span className="mt-0.5 flex-none text-accent-strong">
                  <CheckIcon />
                </span>
                <span>{lastPosted}</span>
              </p>
            )}
            <p className="mb-3 text-[1.33rem] text-text-muted">
              Scan to check-in / check-out stock.
            </p>

            {/* The scan input is the first, most prominent thing on this screen. */}
            <ScanCodeRow
              inputRef={scanRef}
              value={scanTyped}
              onChange={setScanTyped}
              confirmed={scanConfirmed}
              disabled={busy}
              placeholder="Type product id code or scan QR code"
              onSubmitCode={(code) => void identify(code)}
              onOpenCamera={() => setCameraOpen(true)}
            />
          </>
        )}

        {step === 'count' && product && (
          <>
            {/*
              "Scan the next one" moved to the top of the Counting screen -
              the same reasoning as step 1: scanning is the primary action
              here, so it is the first thing the operator sees and reaches
              for, not something found after the quantity display.
            */}
            <div className="mb-3">
              <ScanCodeRow
                inputRef={countScanRef}
                value={countTyped}
                onChange={setCountTyped}
                confirmed={countConfirmed}
                disabled={busy}
                placeholder={cooling ? `Ready in ${secondsLeft}s…` : 'Scan the next one'}
                onSubmitCode={(code) => countScan(code)}
                onOpenCamera={() => setCameraOpen(true)}
              />
              <div
                aria-live="polite"
                className="mt-1.5 flex items-center gap-1.5"
              >
                {cooling ? (
                  <>
                    <span className="text-accent-strong">
                      <CheckIcon />
                    </span>
                    <span className="text-[0.78rem] font-semibold text-accent-strong">Counted</span>
                    <span className="text-[0.78rem] text-text-faint">· ready in {secondsLeft}s</span>
                  </>
                ) : (
                  <span className="text-[0.95rem] font-bold text-[#9c2b2b]">Ready - scan to add 1.</span>
                )}
              </div>
            </div>

            {/*
              The identity block: what was scanned, and the standing facts
              about it. Unit and price are read-only here on purpose - they
              belong to the product, not this movement, and price is
              admin-set on the catalogue.
            */}
            <div className="mb-3 overflow-hidden rounded-xl border border-accent/15 bg-surface-2">
              <div className="px-4 pt-3 pb-2.5">
                <div className="text-[0.68rem] font-semibold uppercase tracking-wide text-text-faint">
                  Counting
                </div>
                {/* Product name: minty green and clearly visible, as requested. */}
                <div className="mt-1 text-[0.95rem] font-bold leading-snug text-[#3ddc97]">
                  {product.name}
                </div>
                <div className="font-mono-brand text-[0.72rem] text-text-faint">{product.sku}</div>
              </div>
              <dl className="grid grid-cols-2 gap-px border-t border-accent/10 bg-accent/10">
                <div className="bg-surface-2 px-4 py-2">
                  <dt className="text-[0.66rem] font-semibold uppercase tracking-wide text-text-faint">
                    Unit
                  </dt>
                  <dd className="mt-0.5 text-[0.82rem] text-text-muted">{product.unitOfMeasure}</dd>
                </div>
                <div className="bg-surface-2 px-4 py-2">
                  <dt className="text-[0.66rem] font-semibold uppercase tracking-wide text-text-faint">
                    Price
                  </dt>
                  <dd className="mt-0.5 text-[0.82rem] tabular-nums text-text-muted">
                    {!product.costsVisible ? (
                      <span className="text-text-faint" title="Hidden by your administrator">
                        {HIDDEN_COST}
                      </span>
                    ) : product.unitPrice === null ? (
                      <span className="text-text-faint">Not priced</span>
                    ) : (
                      `R ${product.unitPrice.toFixed(2)}`
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            {/*
              The count. Read-only on purpose: it is what the scanner has
              actually read, and a typeable box beside a scanner invites the
              two to disagree with no way to tell which is right. "Remove 1"
              is the single correction, which is all an over-scan needs.
            */}
            <div className="rounded-xl border-2 border-accent/50 bg-surface-3 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-text-faint">
                    Scanned quantity ({product.unitOfMeasure})
                  </div>
                  <div
                    aria-live="polite"
                    aria-label={`Scanned quantity: ${quantity} ${product.unitOfMeasure}`}
                    className="font-display text-[2.1rem] font-bold leading-tight tabular-nums text-text"
                  >
                    {Number(quantity) || 0}
                  </div>
                </div>
                <RemoveOneControl
                  events={scanEvents}
                  onRemoveLast={removeLastScan}
                  onRemoveSpecific={removeSpecificScan}
                  disabled={busy || (Number(quantity) || 0) <= 0}
                  size="large"
                />
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-3">
              {product.costsVisible && !canEditPrice ? (
                /*
                  Visible but not editable - the usual case for Stores.
                  Bold orange text, no field outline: setting what stock cost
                  is a pricing decision (`manage_pricing`, Admin only), while
                  seeing it is governed separately by `costsVisible`. The
                  figure shown is the product's own catalogue price, which is
                  what the server will post for this user no matter what the
                  form sends.
                */
                <div className="flex flex-col gap-1.5">
                  <span className="text-[0.8rem] font-semibold text-text-muted">
                    Unit cost (R) <span className="font-normal text-text-faint">from the catalogue</span>
                  </span>
                  <div className="text-right text-[1.15rem] font-bold tabular-nums text-accent-strong">
                    {product.unitPrice != null ? `R ${product.unitPrice.toFixed(2)}` : 'No price set'}
                  </div>
                </div>
              ) : product.costsVisible ? (
                /*
                  A plain, right-aligned number field - no +/- steppers. Unit
                  cost is usually just confirmed as-is (it's prefilled from
                  the product's price) or corrected once by typing a
                  negotiated figure, not nudged up from zero the way a count
                  is, so the steppers were an extra control with nothing to
                  usefully add here.
                */
                <label className="flex flex-col gap-1.5">
                  <span className="text-[0.8rem] font-semibold text-text-muted">Unit cost (R)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    aria-label="Unit cost in Rand"
                    min={0}
                    step={0.01}
                    value={unitCost}
                    disabled={busy}
                    onChange={(e) => onUnitCostChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      void post();
                    }}
                    className="w-full rounded-xl border-2 border-accent/50 bg-surface-3 px-4 py-3 text-right text-[1.15rem] font-semibold tabular-nums text-text outline-none transition-colors focus:border-accent focus:ring-[3px] focus:ring-accent/[0.18] disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </label>
              ) : (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[0.8rem] font-semibold text-text-muted">Unit cost (R)</span>
                  {/*
                    Not merely disabled: when costs are withheld the server
                    never sent a figure, so there is nothing to show and
                    nothing to submit. The movement still posts - the action
                    falls back to the location's weighted-average cost.
                  */}
                  <div
                    title="Hidden by your administrator"
                    className="rounded-xl border border-accent/[0.14] bg-surface-3 px-4 py-3.5 text-[1.05rem] text-text-faint"
                  >
                    {HIDDEN_COST}
                  </div>
                </label>
              )}

              {/*
                Live total - the number the operator is actually here to
                check before committing. Bold and set apart in its own
                highlighted row rather than folded into the field list, since
                it's the answer, not another input.
              */}
              <div className="flex items-center justify-between rounded-xl border border-accent/40 bg-accent/[0.12] px-4 py-3">
                <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-text-muted">
                  Total
                </span>
                <span className="font-display text-[1.3rem] font-bold tabular-nums text-accent-strong">
                  {product.costsVisible
                    ? `R ${(
                        (Number(quantity) || 0) * (Number(unitCost) || 0)
                      ).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : HIDDEN_COST}
                </span>
              </div>
            </div>

            {/*
              Batch is per-movement, unlike unit and price above: it records
              which consignment THIS stock arrived on. It sits below the
              total - it's optional context for the record, not part of
              deciding whether the total is right.
            */}
            <label className="mt-3 flex flex-col gap-1.5">
              <span className="text-[0.75rem] font-semibold text-text-muted">
                Batch / delivery note <span className="font-normal text-text-faint">(optional)</span>
              </span>
              <input
                type="text"
                value={batchRef}
                onChange={(e) => setBatchRef(e.target.value)}
                disabled={busy}
                placeholder="e.g. DEL-4471"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  void post();
                }}
                className="rounded-xl border border-accent/[0.14] bg-surface-2 px-4 py-3 font-mono-brand text-[0.95rem] text-text placeholder:font-body placeholder:text-[0.85rem] placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/[0.18] disabled:opacity-60"
              />
            </label>

            <button
              type="button"
              onClick={() => void post()}
              disabled={busy}
              className="mt-4 w-full rounded-lg bg-accent px-4 py-3 text-[0.92rem] font-bold text-ink shadow-[0_1px_0_0_rgba(0,0,0,0.15)] transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {busy
                ? 'Posting…'
                : `Post movement (${Number(quantity) || 0} ${product.unitOfMeasure})`}
            </button>
          </>
        )}

        {/*
          ONE camera for the whole dialog, mounted outside both step blocks
          and controlled (open/onOpenChange) rather than owning its own
          trigger. It used to be rendered twice - once per step - which meant
          a successful identify flipped step 'scan' -> 'count', unmounted the
          first instance and mounted the second, tearing the camera stream
          down and closing the overlay after every single scan. Keeping a
          single instance here is what lets the camera stay open across
          identify, counting, posting and on to the next item; `continuous`
          then stops the decode loop from closing it on a hit. `hideTrigger`
          is set because ScanCodeRow supplies its own triggers (the primary
          button and the inline flip icon) that both open this same instance.
        */}
        <CameraScanner
          open={cameraOpen}
          onOpenChange={setCameraOpen}
          hideTrigger
          continuous
          statusSlot={cameraStatus}
          onScan={handleCameraScan}
        />

        <p aria-live="polite" className="mt-3 min-h-[1.25rem] text-[0.82rem]">
          {busy ? (
            <span className="text-text-muted">Working…</span>
          ) : error ? (
            <span className="text-danger-text">✕ {error}</span>
          ) : (
            <span className="text-text-faint">
              {step === 'scan'
                ? 'Waiting for a scan…'
                : 'Keep scanning to count. Press Enter in Unit cost or Batch to post.'}
            </span>
          )}
        </p>
      </div>

      {/*
        The "wrong item" toast - separate from the inline error above,
        deliberately. The inline error sits inside the dialog card; this
        rides underneath it, anchored to the bottom of the screen, so it
        reads as rising up from behind the dialog rather than living inside
        it. It disappears on its own after a few seconds and needs no
        dismissal, which the inline error (still visible until the next
        scan) does not.
      */}
      {toast && <MismatchToast key={toast.key} message={toast.message} />}
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          backToScan();
          setLastPosted(null);
          setOpen(true);
        }}
        className={`flex ${triggerHeightClassName} w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 text-[0.85rem] font-bold text-ink transition-colors hover:bg-accent-hover`}
      >
        <BarcodeIcon />
        Scan
      </button>

      {/* Portalled: `open` only turns true from an onClick, so document.body exists. */}
      {open && createPortal(overlay, document.body)}
    </>
  );
}

/**
 * The "Code number" input shared by both steps: a label, the text field
 * itself (border colour tracks idle/typing/confirmed), a small
 * always-available flip-camera icon inside the field so the operator can
 * switch to the camera mid-type without losing what they've typed, and one
 * primary button - "Scan item" - below the field. Empty, it opens the
 * camera; with text typed, it submits that code, same as pressing Enter.
 *
 * The button sits BELOW the input rather than beside it: side by side
 * squeezed both into a fraction of the dialog's width, in the one place
 * that most needs room to breathe. Stacked, each gets the full width and
 * its own proper padding.
 *
 * Border colour: the brand orange (#FE5000) at rest, so the field reads as
 * "ready, waiting for you" rather than blending into the rest of the
 * form's default border; red the moment there's unconfirmed text in it, on
 * the same logic as everywhere else in this app that flags "not yet
 * verified"; green only once that text has actually resolved to a real
 * product.
 */
function ScanCodeRow({
  value,
  onChange,
  onSubmitCode,
  onOpenCamera,
  confirmed,
  disabled,
  placeholder,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmitCode: (code: string) => void;
  onOpenCamera: () => void;
  confirmed: boolean;
  disabled?: boolean;
  placeholder: string;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const hasText = value.trim() !== '';
  /*
    Driven by inline `style`, not a Tailwind class, and this is deliberate,
    not a style preference. `.border-danger`, `.border-[#22c55e]` and
    `.border-[#FE5000]` all compile into the same `@layer utilities` and are
    swapped on and off this exact element every keystroke - and under that
    specific combination (rapid class swaps on one live node, all competing
    for the same `border-color` property from the same cascade layer) the
    browser was observed getting stuck showing a stale colour after a swap,
    on a plain reload with nothing else going on. An inline style always
    wins the cascade outright, regardless of any class, layer, or specificity
    question, which sidesteps the whole failure mode rather than explaining
    it. The ring (a box-shadow, a different property, never seen the issue)
    stays a Tailwind class below.
  */
  const borderColor = !hasText ? '#FE5000' : confirmed ? '#22c55e' : 'var(--danger)';
  const ringClass = !hasText
    ? 'focus:ring-[#FE5000]/20'
    : confirmed
      ? 'bg-[#22c55e]/[0.07] focus:ring-[#22c55e]/20'
      : 'focus:ring-danger/20';

  return (
    <div className="flex flex-col">
      <span className="mb-1.5 text-[0.75rem] font-semibold text-text-muted">Code number</span>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            onSubmitCode(e.currentTarget.value);
          }}
          style={{ borderColor }}
          className={`w-full rounded-xl border-2 bg-surface-2 py-3.5 pr-14 pl-4 font-mono-brand text-[1rem] tracking-wide text-text placeholder:font-body placeholder:text-[0.85rem] placeholder:tracking-normal placeholder:text-text-faint transition-colors focus:outline-none focus:ring-[3px] disabled:opacity-60 ${ringClass}`}
        />
        {/* Always available, whatever is (or isn't) typed - the "change my mind, switch to camera" escape hatch. */}
        <button
          type="button"
          aria-label="Switch to camera scan"
          title="Switch to camera scan"
          disabled={disabled}
          onClick={onOpenCamera}
          className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg border border-accent/20 bg-surface-3 text-text-muted transition-colors hover:border-accent/50 hover:bg-neutral-soft hover:text-accent-strong disabled:opacity-50"
        >
          <FlipCameraIcon />
        </button>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => (hasText ? onSubmitCode(value) : onOpenCamera())}
        className="mt-3 w-full rounded-xl bg-accent px-4 py-3 text-[0.92rem] font-bold text-ink shadow-[0_1px_0_0_rgba(0,0,0,0.15)] transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        Scan item
      </button>
    </div>
  );
}

/**
 * The "wrong item" toast: drops in from the top edge of the screen and
 * fades in, sits for a few seconds, then the parent unmounts it (see
 * `TOAST_MS` / `showToast` above). Anchored to the TOP rather than the
 * bottom so it appears where the operator's eyes already are - looking at
 * the code field and the camera view, both up near the top of the dialog -
 * instead of below everything, easy to miss while scanning.
 *
 * The mount-then-transition dance below (render off-screen, flip a class on
 * the next tick) is a plain Tailwind `transition` rather than a CSS
 * `@keyframes` animation - this codebase doesn't use styled-jsx anywhere
 * else, every other motion in the app (the theme toggle, hover states,
 * dialogs) is a Tailwind `transition-*` utility, and pulling in styled-jsx
 * for one component would be a second, inconsistent way of doing the same
 * job.
 */
function MismatchToast({ message }: { message: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      role="alert"
      className="pointer-events-none fixed inset-x-0 top-6 z-[60] flex justify-center px-4"
    >
      <div
        className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border-2 border-danger/60 bg-surface px-5 py-4 text-[0.95rem] font-semibold text-danger-text shadow-[0_16px_40px_-8px_rgba(0,0,0,0.55)] transition-all duration-200 ease-out ${
          shown ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
        }`}
      >
        <span className="flex-none scale-125">
          <WarningIcon />
        </span>
        {message}
      </div>
    </div>
  );
}

/**
 * "Remove 1", now aware of what it's removing.
 *
 * With exactly one item scanned there is nothing to choose between, so a
 * bare click removes it directly - unchanged from before. With more than
 * one, a click instead opens a picker listing every individual scan (most
 * recent first, each timestamped), so the operator removes the specific one
 * that was a mistake rather than always "whichever was last", which is not
 * necessarily the one they meant to undo if a second wrong scan slipped in
 * between.
 */
function RemoveOneControl({
  events,
  onRemoveLast,
  onRemoveSpecific,
  disabled,
  size = 'small',
}: {
  events: { id: number; at: string }[];
  onRemoveLast: () => void;
  onRemoveSpecific: (id: number) => void;
  disabled?: boolean;
  size?: 'small' | 'large';
}) {
  const [open, setOpen] = useState(false);
  const hasChoice = events.length > 1;

  const buttonClass =
    size === 'large'
      ? 'flex flex-none items-center gap-1.5 rounded-lg border border-accent/30 bg-surface-2 px-3 py-2 text-[0.8rem] font-semibold text-text-muted transition-colors hover:border-danger/60 hover:text-danger-text disabled:opacity-40'
      : 'flex flex-none items-center gap-1.5 rounded-lg border border-accent/30 bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-text-muted transition-colors hover:border-danger/60 hover:text-danger-text disabled:opacity-40';

  return (
    <div className="relative flex-none">
      <button
        type="button"
        onClick={() => (hasChoice ? setOpen((o) => !o) : onRemoveLast())}
        disabled={disabled}
        aria-haspopup={hasChoice ? 'listbox' : undefined}
        aria-expanded={hasChoice ? open : undefined}
        className={buttonClass}
      >
        <MinusIcon />
        Remove 1
      </button>

      {open && hasChoice && (
        <>
          {/* Click-outside-to-close. Transparent, sits below the picker, above everything else. */}
          <button
            type="button"
            aria-label="Close"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            role="listbox"
            aria-label="Choose which scan to remove"
            className="absolute top-full right-0 z-20 mt-1.5 w-60 overflow-hidden rounded-xl border border-accent/30 bg-surface shadow-[0_16px_40px_-12px_rgba(0,0,0,0.5)]"
          >
            <div className="border-b border-accent/10 px-3 py-2 text-[0.7rem] font-semibold uppercase tracking-wide text-text-faint">
              Remove which scan?
            </div>
            <ul className="max-h-48 overflow-y-auto">
              {[...events].reverse().map((event, i) => (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onRemoveSpecific(event.id);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[0.82rem] text-text transition-colors hover:bg-danger/10 hover:text-danger-text"
                  >
                    <span>
                      Scan #{events.length - i} <span className="text-text-faint">· {event.at}</span>
                    </span>
                    <MinusIcon />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function BarcodeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
      <path d="M3 5v14M7 5v14M11 5v14M14 5v14M18 5v14M21 5v14" />
    </svg>
  );
}

/**
 * A camera lens with two curved arrows chasing each other around it - the
 * standard "switch/flip" motif (the same two-arrows-in-a-circle language as
 * a refresh icon), so this reads as "change scan method" rather than as a
 * second, redundant camera button sitting right next to the primary one.
 */
/**
 * An actual camera silhouette (body + top flash bump + lens), with ONE bold
 * curved arrow and a clear arrowhead in the top-right corner - not two thin
 * symmetric arcs. The previous version was a plain circular-refresh glyph
 * with a dot in the middle: at 16px that reads as a loading spinner, not a
 * camera, and has no obvious "camera" content at all - reported back as
 * unclear. A recognisable camera shape plus a single unambiguous arrow is
 * legible at small size in a way two thin mirrored arcs never were.
 */
/**
 * Second redesign, in response to "the camera icon is not make sure, do
 * better" AFTER the first redesign (camera silhouette + thin arrow) was
 * screenshotted and zoomed in on: at real render size the thin arrow lines
 * were indistinguishable from noise next to the bolder camera body - it
 * read as a camera with a stray squiggle, not "camera that flips".
 *
 * This version keeps the camera body plain and unambiguous, then puts the
 * "flip/switch" meaning in its own high-contrast badge - a small filled
 * accent-coloured circle overlapping the camera's bottom-right corner,
 * containing a bold circular arrow with a solid (filled, not stroked)
 * triangular arrowhead. This is the same visual pattern real camera apps
 * use for their flip-camera control, and separating the two glyphs into
 * "body" + "badge" means the arrow never has to compete for pixels with
 * the camera outline - it has its own contained space and its own colour.
 */
function FlipCameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
      {/* Camera body - plain, bold, unambiguous on its own. */}
      <path
        d="M2.5 8.2a1.2 1.2 0 0 1 1.2-1.2h1.9l.95-1.5a1 1 0 0 1 .84-.46h4.7a1 1 0 0 1 .82.43l1.02 1.53h1.86a1.2 1.2 0 0 1 1.2 1.2v6.9a1.2 1.2 0 0 1-1.2 1.2H3.7a1.2 1.2 0 0 1-1.2-1.2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.4" cy="11.6" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
      {/* Flip badge - its own filled circle, own colour, own bold arrow. */}
      <circle cx="18" cy="16.6" r="5.3" fill="var(--accent)" />
      <path
        d="M15.9 14.3a3 3 0 0 1 4.9-1"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M20.9 12.6l.5 2.1-2.1-.6z" fill="var(--ink)" />
      <path
        d="M20.1 18.9a3 3 0 0 1-4.9 1"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M15.1 20.6l-.5-2.1 2.1.6z" fill="var(--ink)" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 flex-none">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-4 w-4">
      <path d="M5 12h14" />
    </svg>
  );
}

