import type { Role } from '@nirantar/shared';
import { Suspense, lazy, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';
import { OnboardingPage } from '../features/auth/OnboardingPage';
import { SignInPage } from '../features/auth/SignInPage';
import { HomePage } from '../features/home/HomePage';
import { NewOrderPage } from '../features/order/NewOrderPage';
import { OrderStatusPage } from '../features/order/OrderStatusPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { LoadingNote } from '../design-system/States';
import { RequireRole, RootRedirect } from './guards';

// Staff screens and the design preview are separate downloads: customers on a
// phone never pay for code they can't open.
const QueuePage = lazy(() => import('../features/staff/QueuePage').then((m) => ({ default: m.QueuePage })));
const WorkspacePage = lazy(() => import('../features/staff/WorkspacePage').then((m) => ({ default: m.WorkspacePage })));
const StoreOrdersPage = lazy(() => import('../features/staff/StoreOrdersPage').then((m) => ({ default: m.StoreOrdersPage })));
const OperationsPage = lazy(() => import('../features/operations/OperationsPage').then((m) => ({ default: m.OperationsPage })));
const DesignPreviewPage = lazy(() => import('../pages/DesignPreviewPage').then((m) => ({ default: m.DesignPreviewPage })));

const only = (roles: Role[], page: ReactNode) => (
  <RequireRole roles={roles}>
    <Suspense fallback={<LoadingNote />}>{page}</Suspense>
  </RequireRole>
);

/**
 * Routes. Each screen checks the role on the client for a smooth experience;
 * the API checks it again on every request (the real protection).
 */
export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  { path: '/signin', element: <SignInPage /> },
  // Customer (C1–C4)
  { path: '/welcome', element: only(['CUSTOMER'], <OnboardingPage />) },
  { path: '/home', element: only(['CUSTOMER'], <HomePage />) },
  { path: '/order/new', element: only(['CUSTOMER'], <NewOrderPage />) },
  { path: '/orders/:id', element: only(['CUSTOMER'], <OrderStatusPage />) },
  // Pharmacist (P1, P2, S1)
  { path: '/pharmacist', element: only(['PHARMACIST'], <QueuePage />) },
  { path: '/pharmacist/orders/:id', element: only(['PHARMACIST'], <WorkspacePage />) },
  { path: '/pharmacist/store', element: only(['PHARMACIST'], <StoreOrdersPage />) },
  // Central operations (O1)
  { path: '/ops/*', element: only(['OPS'], <OperationsPage />) },
  ...(import.meta.env.DEV ? [{ path: '/__design', element: <Suspense fallback={<LoadingNote />}><DesignPreviewPage /></Suspense> }] : []),
  { path: '*', element: <NotFoundPage /> },
]);
