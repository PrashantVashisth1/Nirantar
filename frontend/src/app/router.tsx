import type { Role } from '@nirantar/shared';
import type { ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';
import { OnboardingPage } from '../features/auth/OnboardingPage';
import { SignInPage } from '../features/auth/SignInPage';
import { HomePage } from '../features/home/HomePage';
import { OperationsPage } from '../features/operations/OperationsPage';
import { NewOrderPage } from '../features/order/NewOrderPage';
import { OrderStatusPage } from '../features/order/OrderStatusPage';
import { QueuePage } from '../features/staff/QueuePage';
import { StoreOrdersPage } from '../features/staff/StoreOrdersPage';
import { WorkspacePage } from '../features/staff/WorkspacePage';
import { NotFoundPage } from '../pages/BuildingPage';
import { DesignPreviewPage } from '../pages/DesignPreviewPage';
import { RequireRole, RootRedirect } from './guards';

const only = (roles: Role[], page: ReactNode) => <RequireRole roles={roles}>{page}</RequireRole>;

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
  ...(import.meta.env.DEV ? [{ path: '/__design', element: <DesignPreviewPage /> }] : []),
  { path: '*', element: <NotFoundPage /> },
]);
