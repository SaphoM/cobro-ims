/**
 * Single entry point for all data access. Every service/route/component
 * imports repositories from here — never directly from `./mock` or a future
 * `./supabase`. That keeps the swap to a real Supabase project a one-file
 * change instead of a hunt-and-replace across the app.
 *
 * DATA_SOURCE=mock (current default, and the only implemented option today)
 * DATA_SOURCE=supabase (future — throws until src/lib/data/supabase exists)
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
  mockStockAdjustmentRepository,
  mockStockLedgerRepository,
  mockStockMovementRepository,
  mockSupplierRepository,
  mockTransferRepository,
  mockUserRepository,
  mockWarehouseRepository,
} from '@/lib/data/mock/repositories';

const DATA_SOURCE = process.env.DATA_SOURCE ?? 'mock';

if (DATA_SOURCE !== 'mock') {
  throw new Error(
    `DATA_SOURCE="${DATA_SOURCE}" is not implemented yet. Only "mock" exists until a real Supabase ` +
      `project is provisioned and src/lib/data/supabase is built out.`
  );
}

export const warehouseRepository = mockWarehouseRepository;
export const roleRepository = mockRoleRepository;
export const auditLogRepository = mockAuditLogRepository;
export const productRepository = mockProductRepository;
export const stockLedgerRepository = mockStockLedgerRepository;
export const stockMovementRepository = mockStockMovementRepository;
export const supplierRepository = mockSupplierRepository;
export const customerRepository = mockCustomerRepository;
export const receivingRepository = mockReceivingRepository;
export const purchaseOrderRepository = mockPurchaseOrderRepository;
export const transferRepository = mockTransferRepository;
export const salesOrderRepository = mockSalesOrderRepository;
export const invoiceRepository = mockInvoiceRepository;
export const adjustmentReasonRepository = mockAdjustmentReasonRepository;
export const stockAdjustmentRepository = mockStockAdjustmentRepository;
export const userRepository = mockUserRepository;

export const isUsingMockData = DATA_SOURCE === 'mock';
