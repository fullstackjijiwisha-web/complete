import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/requireAuth';
import { roleGuard } from '../../middleware/roleGuard';
import { validate } from '../../middleware/validate';
import * as controller from './payment.controller';

// Note: POST /payments/webhook is mounted directly in app.ts with express.raw()
// BEFORE the global JSON parser — it must see the exact signed bytes.
export const paymentRoutes = Router();

paymentRoutes.post(
  '/orders',
  requireAuth,
  roleGuard('hr_admin'),
  validate(z.object({ type: z.enum(['seats', 'audit']) })),
  controller.createOrder,
);

paymentRoutes.post(
  '/mock-activate',
  requireAuth,
  roleGuard('hr_admin'),
  controller.mockActivate,
);

// Returns a Shopify checkout URL for the org's seats (see shopifyCheckout).
paymentRoutes.post(
  '/shopify/checkout',
  requireAuth,
  roleGuard('hr_admin'),
  controller.shopifyCheckout,
);
