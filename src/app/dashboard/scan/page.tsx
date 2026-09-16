import { warehouseRepository } from '@/lib/data';
import { getSession } from '@/lib/auth';
import { AccessDenied } from '@/components/access-denied';
import { ScanStation } from '@/app/dashboard/scan/scan-station';
import { ScanHelp } from '@/app/dashboard/scan/scan-help';

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ barcode?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    return <AccessDenied title="Barcode / QR scan" message="Your session has expired. Please sign in again." />;
  }

  const { barcode } = await searchParams;
  const warehouses = await warehouseRepository.list();
  // Only an Engineer / Requester owns a personal station - everyone else
  // gets no "Use" mode, same station-ownership rule the Overview's
  // EngineerScanCard and Stock-by-location picker already use.
  const stationWarehouseId = warehouses.find((w) => w.ownerUserId === session.id)?.id ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Barcode / QR scan</h1>
        <p className="text-[0.86rem] text-text-muted">
          Look up a product by barcode, or scan straight into a receipt, issue, or usage movement.
        </p>
      </div>

      <ScanStation warehouses={warehouses} initialBarcode={barcode ?? ''} stationWarehouseId={stationWarehouseId} />

      <ScanHelp />
    </div>
  );
}
