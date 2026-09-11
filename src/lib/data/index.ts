/**
 * Single entry point for all data access. Every service/route/component
 * imports repositories from here — never directly from `./mock` or
 * `./supabase`. That keeps the swap a one-file change instead of a
 * hunt-and-replace across the app.
 *
 * DATA_SOURCE=mock    in-memory seed data (resets on restart)
 * DATA_SOURCE=supabase  real Supabase/Postgres via service-role client
 */

import {
  mockAdjustmentReasonRepository,
  mockAuditLogRepository,
  mockCustomerRepository,
  mockInvoiceRepository,
  mockProductRepository,
  mockPurchaseOrderRepository,
  mockReceivingRepository,
  mockRoleRepository,
  mockSalesOrderRepository,
  mockScanHandoffRepository,
  mockStockAdjustmentRepository,
  mockStockLedgerRepository,
  mockStockMovementRepository,
  mockSupplierRepository,
  mockTransferRepository,
  mockSettingsRepository,
  mockUserRepository,
  mockWarehouseRepository,
} from '@/lib/data/mock/repositories';

import {
  sbAdjustmentReasonRepository,
  sbAuditLogRepository,
  sbCustomerRepository,
  sbInvoiceRepository,
  sbProductRepository,
  sbPurchaseOrderRepository,
  sbReceivingRepository,
  sbRoleRepository,
  sbSalesOrderRepository,
  sbScanHandoffRepository,
  sbStockAdjustmentRepository,
  sbStockLedgerRepository,
  sbStockMovementRepository,
  sbSupplierRepository,
  sbTransferRepository,
  sbSettingsRepository,
  sbUserRepository,
  sbWarehouseRepository,
} from '@/lib/data/supabase/repositories';

const DATA_SOURCE = process.env.DATA_SOURCE ?? 'mock';

if (DATA_SOURCE !== 'mock' && DATA_SOURCE !== 'supabase') {
  throw new Error(
    `DATA_SOURCE="${DATA_SOURCE}" is not recognised. Use "mock" or "supabase".`
  );
}

const useSb = DATA_SOURCE === 'supabase';

export const warehouseRepository = useSb ? sbWarehouseRepository : mockWarehouseRepository;
export const roleRepository = useSb ? sbRoleRepository : mockRoleRepository;
export const auditLogRepository = useSb ? sbAuditLogRepository : mockAuditLogRepository;
export const productRepository = useSb ? sbProductRepository : mockProductRepository;
export const stockLedgerRepository = useSb ? sbStockLedgerRepository : mockStockLedgerRepository;
export const stockMovementRepository = useSb ? sbStockMovementRepository : mockStockMovementRepository;
export const supplierRepository = useSb ? sbSupplierRepository : mockSupplierRepository;
export const customerRepository = useSb ? sbCustomerRepository : mockCustomerRepository;
export const receivingRepository = useSb ? sbReceivingRepository : mockReceivingRepository;
export const purchaseOrderRepository = useSb ? sbPurchaseOrderRepository : mockPurchaseOrderRepository;
export const transferRepository = useSb ? sbTransferRepository : mockTransferRepository;
export const salesOrderRepository = useSb ? sbSalesOrderRepository : mockSalesOrderRepository;
export const invoiceRepository = useSb ? sbInvoiceRepository : mockInvoiceRepository;
export const adjustmentReasonRepository = useSb ? sbAdjustmentReasonRepository : mockAdjustmentReasonRepository;
export const stockAdjustmentRepository = useSb ? sbStockAdjustmentRepository : mockStockAdjustmentRepository;
export const userRepository = useSb ? sbUserRepository : mockUserRepository;
export const settingsRepository = useSb ? sbSettingsRepository : mockSettingsRepository;
export const scanHandoffRepository = useSb ? sbScanHandoffRepository : mockScanHandoffRepository;

export const isUsingMockData = DATA_SOURCE === 'mock';
