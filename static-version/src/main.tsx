import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom';
import '@/index.css';

import { DashboardLayout } from '@/layout/DashboardLayout';
import { RequireAuth } from '@/layout/RequireAuth';
import { LoginPage } from '@/pages/Login';
import { OverviewPage } from '@/pages/Overview';
import { ProductsPage } from '@/pages/Products';
import { BomPage } from '@/pages/Bom';
import { PurchaseOrdersPage } from '@/pages/PurchaseOrders';
import { ReceivingPage } from '@/pages/Receiving';
import { SuppliersPage } from '@/pages/Suppliers';
import { TransfersPage } from '@/pages/Transfers';
import { AdjustmentsPage } from '@/pages/Adjustments';
import { RequisitionsPage } from '@/pages/Requisitions';
import { DepartmentsPage } from '@/pages/Departments';
import { ReportsPage } from '@/pages/Reports';
import { ScanPage } from '@/pages/Scan';
import { LabelsPage } from '@/pages/Labels';
import { AuditLogPage } from '@/pages/AuditLog';
import { SecurityPage } from '@/pages/Security';
import { InvoicesPage } from '@/pages/Invoices';

/**
 * HASH routing (`/#/dashboard/products`), deliberately.
 *
 * On a static host every URL must map to a file that exists. With browser
 * history routing, a hard refresh on /dashboard/reports asks the host for a
 * /dashboard/reports file, gets a 404, and the app never boots — unless the
 * host is configured with a catch-all rewrite to index.html. Hash routing
 * puts the route after the `#`, which servers never see, so deep links and
 * refreshes work on Render (or any static host) with ZERO configuration.
 */
const router = createHashRouter([
  { path: '/', element: <Navigate to="/dashboard" replace /> },
  { path: '/login', element: <LoginPage /> },
  {
    path: '/dashboard',
    element: (
      <RequireAuth>
        <DashboardLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'products', element: <ProductsPage /> },
      { path: 'bom', element: <BomPage /> },
      { path: 'purchase-orders', element: <PurchaseOrdersPage /> },
      { path: 'receiving', element: <ReceivingPage /> },
      { path: 'suppliers', element: <SuppliersPage /> },
      { path: 'transfers', element: <TransfersPage /> },
      { path: 'adjustments', element: <AdjustmentsPage /> },
      { path: 'sales', element: <RequisitionsPage /> },
      { path: 'customers', element: <DepartmentsPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'scan', element: <ScanPage /> },
      { path: 'labels', element: <LabelsPage /> },
      { path: 'audit-log', element: <AuditLogPage /> },
      { path: 'security', element: <SecurityPage /> },
      // Dormant, exactly as in the original: real, working, reachable by URL,
      // but absent from the nav and never populated by a requisition.
      { path: 'invoices', element: <InvoicesPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
