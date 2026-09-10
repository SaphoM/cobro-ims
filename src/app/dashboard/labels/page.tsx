import { randomUUID } from 'crypto';
import { productRepository, supplierRepository } from '@/lib/data';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { AccessDenied } from '@/components/access-denied';
import { PrintButton } from '@/app/dashboard/labels/print-button';
import { generateQrDataUrl } from '@/lib/services/qrcode';
import { encodeScanPayload } from '@/lib/scan-payload';
import { inputClass, selectClass } from '@/lib/ui/form-control-classes';
import { InfoTooltip } from '@/components/info-tooltip';

export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; qty?: string; supplierId?: string; expectedQuantity?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    return <AccessDenied title="Product labels" message="Your session has expired. Please sign in again." />;
  }
  // The single authoritative check - `hasPermission` resolves the role
  // default AND this user's individual override (see User.labelPermission).
  // A revoked Stores Clerk lands here exactly as an Engineer does; a
  // specifically-allowed Engineer gets through. This is the route guard;
  // there is no separate label-generation POST endpoint - the "Generate
  // sheet" form is a GET back to this same page, so reaching a rendered
  // sheet always passes through this check.
  if (!(await hasPermission(session, 'create_product_labels'))) {
    return (
      <AccessDenied
        title="Product labels"
        message="You don't have permission to create product labels. This is set by your role and can be changed per user by an administrator."
      />
    );
  }

  const { productId, qty, supplierId, expectedQuantity } = await searchParams;
  const [products, suppliers] = await Promise.all([productRepository.list(), supplierRepository.list()]);
  const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name));

  const selected = productId ? products.find((p) => p.id === productId) : null;
  const selectedSupplier = supplierId ? suppliers.find((s) => s.id === supplierId) ?? null : null;
  const requestedQty = Math.max(Number(qty) || 1, 1);
  const parsedExpectedQuantity = Number(expectedQuantity);
  const selectedExpectedQuantity =
    Number.isFinite(parsedExpectedQuantity) && parsedExpectedQuantity > 0 ? parsedExpectedQuantity : null;
  /*
    A delivery label carries WHO it came from and, optionally, HOW MANY units
    it should contain, as well as WHAT it is, so receiving scans once instead
    of scanning and then filling in the rest by hand. Supplier is required -
    see src/lib/scan-payload.ts.

    Every "Generate sheet" run also stamps its labels with a shared set code
    and a 1-based sequence, so a scan can tell which run a label came off and
    which one of the run it is ("QR 3 of 100"). The code is minted per render
    - the page holds no state, so a refresh is a new run with a new code, and
    nothing server-side records a set's membership. That is deliberate and
    understood: the grouping + ordinal live entirely on the label. Each label
    therefore encodes a DISTINCT payload (the seq differs), so a QR is
    generated per copy rather than once and repeated.
  */
  const setId = selected?.barcode ? randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase() : null;
  const labelQrDataUrls = selected?.barcode
    ? await Promise.all(
        Array.from({ length: requestedQty }, (_, i) =>
          generateQrDataUrl(
            encodeScanPayload({
              barcode: selected.barcode!,
              supplierId: selectedSupplier?.id ?? null,
              expectedQuantity: selectedExpectedQuantity,
              setId,
              seq: i + 1,
              setSize: requestedQty,
            })
          )
        )
      )
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print">
        <h1 className="font-display text-[1.3rem] font-medium text-text">Product labels</h1>
        <p className="text-[0.86rem] text-text-muted">
          Generates a print-ready sheet: SKU, product name, barcode number in large clear text, and a real
          scannable QR code, for each label. A Code 128 barcode symbol graphic still isn&apos;t rendered -
          see the note at the bottom of this page for why.
        </p>
      </div>

      <form
        action="/dashboard/labels"
        method="GET"
        className="no-print flex flex-wrap items-end gap-3 rounded-2xl border border-accent/[0.14] bg-surface p-5"
      >
        <label className="flex flex-1 min-w-[240px] flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Product</span>
          <select
            name="productId"
            required
            defaultValue={selected?.id ?? ''}
            className={selectClass}
          >
            <option value="" disabled>
              Choose a product…
            </option>
            {sortedProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} - {p.name}
                {!p.barcode ? ' (no barcode set)' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <span className="flex items-center text-[0.75rem] font-semibold text-text-muted">
            Supplier
            <InfoTooltip text="Encodes into the QR." />
          </span>
          <select name="supplierId" required defaultValue={selectedSupplier?.id ?? ''} className={selectClass}>
            <option value="" disabled>
              Choose a supplier…
            </option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="flex items-center text-[0.75rem] font-semibold text-text-muted">
            Quantity expected
            <InfoTooltip text="Optional - encodes into the QR." />
          </span>
          <input
            type="number"
            name="expectedQuantity"
            min="1"
            step="1"
            placeholder="e.g. 100"
            defaultValue={selectedExpectedQuantity ?? ''}
            className={`${inputClass} w-32`}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] font-semibold text-text-muted">Copies</span>
          <input
            type="number"
            name="qty"
            min="1"
            defaultValue={requestedQty}
            className={`${inputClass} w-28`}
          />
        </label>

        <button
          type="submit"
          className="h-9 rounded-lg border border-accent/30 bg-surface-2 px-5 py-1.5 text-[0.88rem] font-semibold text-accent-strong hover:bg-accent/10"
        >
          Generate sheet
        </button>
      </form>

      {productId && !selected && (
        <p className="no-print rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-[0.85rem] text-danger-text">
          That product couldn&apos;t be found.
        </p>
      )}

      {selected && !selected.barcode && (
        <p className="no-print rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-[0.85rem] text-danger-text">
          {selected.sku} has no barcode set - add one on the{' '}
          <a href="/dashboard/products" className="underline">
            product catalogue
          </a>{' '}
          first.
        </p>
      )}

      {selected && selected.barcode && (
        <>
          <div className="no-print flex items-center justify-between rounded-2xl border border-accent/[0.14] bg-surface px-5 py-4">
            <div>
              <h2 className="font-display text-[1.05rem] font-medium text-text">
                {requestedQty} label{requestedQty === 1 ? '' : 's'} - {selected.sku}
              </h2>
              <p className="text-[0.82rem] text-text-muted">
                {selected.name}
                {setId && (
                  <>
                    {' · '}
                    <span className="font-mono-brand text-text-faint">
                      set {setId}
                      {requestedQty > 1 && <>, numbered 1&ndash;{requestedQty}</>}
                    </span>
                  </>
                )}
              </p>
            </div>
            <PrintButton />
          </div>

          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64mm, 1fr))' }}
          >
            {labelQrDataUrls.map((qrDataUrl, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-accent/30 bg-white px-3 py-2.5 text-black print:break-inside-avoid"
                style={{ minHeight: '30mm' }}
              >
                {qrDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- static data: URL, no next/image optimization to gain
                  <img
                    src={qrDataUrl}
                    alt={`QR code for ${selected.barcode} (label ${i + 1} of ${requestedQty})`}
                    width={72}
                    height={72}
                    className="shrink-0"
                  />
                )}
                <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch">
                  <div>
                    {/*
                      Cobro's corporate mark, printed as supplied — black on
                      white label stock, so no inversion here (unlike the dark
                      app chrome). `print-exact` keeps browsers from dropping
                      it when "background graphics" printing is off.
                    */}
                    {/* eslint-disable-next-line @next/next/no-img-element -- static public asset on a print sheet; next/image's optimizer buys nothing here */}
                    <img
                      src="/Asset3.png"
                      alt="Cobro Concrete"
                      width={217}
                      height={84}
                      className="print-exact mb-1 h-4 w-auto"
                    />
                    <div className="flex items-baseline justify-between gap-2 leading-tight">
                      <span className="text-[0.95rem] font-bold">{selected.sku}</span>
                      {setId && (
                        // Which run this label came off, and which one of the
                        // run it is - sits on the SKU line so the label keeps
                        // its original height. Small and mono: a tracing
                        // reference, not a headline for the person picking stock.
                        <span className="shrink-0 font-mono text-[0.62rem] tracking-wide text-gray-500">
                          {setId} · {i + 1}/{requestedQty}
                        </span>
                      )}
                    </div>
                    <div className="text-[0.78rem] leading-snug text-gray-700">{selected.name}</div>
                  </div>
                  <div className="mt-2 border-t border-gray-300 pt-1.5 text-center font-mono text-[1.05rem] tracking-[0.15em]">
                    {selected.barcode}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="no-print text-[0.78rem] text-text-faint">
        QR codes are generated with the <code className="font-mono-brand">qrcode</code> npm package - a
        widely-used, deterministic encoder, not a hand-rolled implementation - so the symbol is a real,
        spec-compliant QR that any phone camera or QR-capable scanner can read. Still not built: a rendered
        Code 128 linear barcode symbol. Code 128 has multiple checksum/subset rules that are easy to get
        subtly wrong, and this pass had no camera or physical scanner on hand to verify a hand-rolled
        encoder against - a wrong symbol would look legitimate but silently fail to scan. USB scanners set
        to type digits will still work fine against the human-readable code printed above.
      </p>
    </div>
  );
}
