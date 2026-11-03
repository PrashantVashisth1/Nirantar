import { createBrowserRouter } from 'react-router';
import { OnboardingPage } from '../features/auth/OnboardingPage';
import { SignInPage } from '../features/auth/SignInPage';
import { HomePage } from '../features/home/HomePage';
import { OperationsPage } from '../features/operations/OperationsPage';
import { StaffHomePage } from '../features/staff/StaffHomePage';
import { BuildingPage, NotFoundPage } from '../pages/BuildingPage';
import { DesignPreviewPage } from '../pages/DesignPreviewPage';
import { RequireRole, RootRedirect } from './guards';

/**
 * Routes. Each screen checks the role on the client for a smooth experience;
 * the API checks it again on every request (the real protection).
 */
export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  { path: '/signin', element: <SignInPage /> },
  { path: '/welcome', element: <RequireRole roles={['CUSTOMER']}><OnboardingPage /></RequireRole> },
  { path: '/home', element: <RequireRole roles={['CUSTOMER']}><HomePage /></RequireRole> },
  // Built later this week (plan §11): cart & checkout (Day 4), order tracking (Day 5).
  { path: '/order/*', element: <RequireRole roles={['CUSTOMER']}><BuildingPage /></RequireRole> },
  { path: '/orders/:id', element: <RequireRole roles={['CUSTOMER']}><BuildingPage /></RequireRole> },
  { path: '/pharmacist/*', element: <RequireRole roles={['PHARMACIST']}><StaffHomePage /></RequireRole> },
  { path: '/ops/*', element: <RequireRole roles={['OPS']}><OperationsPage /></RequireRole> },
  ...(import.meta.env.DEV ? [{ path: '/__design', element: <DesignPreviewPage /> }] : []),
  { path: '*', element: <NotFoundPage /> },
]);
