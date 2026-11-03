import { createBrowserRouter } from 'react-router';
import { DesignPreviewPage } from '../pages/DesignPreviewPage';

/**
 * Routes. Day 1 only has the design-token preview; the customer, pharmacist,
 * store and operations screens are added from Day 2 (plan §11).
 */
export const router = createBrowserRouter([
  { path: '/', element: <DesignPreviewPage /> },
  { path: '/__design', element: <DesignPreviewPage /> },
]);
