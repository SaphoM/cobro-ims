import { warehouseRepository } from '@/lib/data';
import { ScanStation } from '@/app/dashboard/scan/scan-station';
import { ScanHelp } from '@/app/dashboard/scan/scan-help';

/**
 * The scan station. Unlike the earlier lookup-only version of this page, a
 * scan here can post real stock: the station's mode decides whether a scanned
 * code is looked up, received (IN) or issued (OUT), and the posting itself
 * goes through the inventory engine — see ./actions.ts.
 */
export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ barcode?: string }>;
}) {
  const { barcode } = await searchParams;
  const warehouses = await warehouseRepository.list();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.3rem] font-medium text-text">Barcode / QR scan</h1>
          <p className="text-[0.86rem] text-text-muted">
            A working scan-in / scan-out station. Pick a mode, then scan continuously with a USB scanner
            (it types the code and presses Enter), a phone/tablet camera, or by typing the barcode. In IN
            and OUT mode every scan posts a real stock movement through the same inventory engine as goods
            receiving and requisitions - quantity and weighted-average cost are re-derived, and each
            movement lands in the audit log.
          </p>
        </div>
        <ScanHelp />
      </div>

      <ScanStation warehouses={warehouses} initialBarcode={barcode?.trim() ?? ''} />

      <p className="text-[0.78rem] text-text-faint">
        Print scannable labels for any product on{' '}
        <a href="/dashboard/labels" className="text-accent-strong hover:underline">
          Product labels
        </a>
        , then scan them straight back in here. The demo dataset seeds barcodes on the product catalogue -
        try <code className="font-mono-brand">6001240912345</code> (Cement 42.5N, 50kg bag). Scanning IN
        requires the receiving permission and scanning OUT the requisition-issuing permission, so an
        Engineer / Requester can look codes up but cannot move stock.
      </p>
    </div>
  );
}
