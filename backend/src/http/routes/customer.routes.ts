import { Router } from 'express';
import { z } from 'zod';
import { NewPatientSchema } from '@nirantar/shared';
import {
  addPatient,
  getHome,
  getOrderForCustomer,
  listOrders,
  listPatients,
} from '../../services/customers/customer.service';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { parse, parseId } from '../validate';

/**
 * Routes for signed-in customers. Every handler passes the caller's own
 * account id to the service, which filters by it.
 *
 * The guard is attached per route (not with router.use) because this router
 * is mounted at /api: a router-wide guard would also catch unknown URLs and
 * answer "please sign in" instead of 404.
 */
export const customerRouter = Router();

const customerOnly = [requireAuth, requireRole('CUSTOMER')];

customerRouter.get('/home', ...customerOnly, async (req, res) => {
  res.json(await getHome(currentUser(req).id));
});

customerRouter.get('/patients', ...customerOnly, async (req, res) => {
  res.json(await listPatients(currentUser(req).id));
});

customerRouter.post('/patients', ...customerOnly, async (req, res) => {
  const input = parse(NewPatientSchema, req.body);
  res.status(201).json(await addPatient(currentUser(req).id, input));
});

const OrderListQuery = z.object({ state: z.enum(['active', 'past']).default('active') });

customerRouter.get('/orders', ...customerOnly, async (req, res) => {
  const { state } = parse(OrderListQuery, req.query);
  res.json(await listOrders(currentUser(req).id, state));
});

customerRouter.get('/orders/:id', ...customerOnly, async (req, res) => {
  res.json(await getOrderForCustomer(currentUser(req).id, parseId(req.params.id)));
});
