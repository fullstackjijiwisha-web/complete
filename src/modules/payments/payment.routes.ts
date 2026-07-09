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

// Standard Checkout signature verification (missing fields → 400 via validate).
paymentRoutes.post(
  '/verify',
  requireAuth,
  roleGuard('hr_admin'),
  validate(
    z.object({
      razorpay_order_id: z.string().min(1),
      razorpay_payment_id: z.string().min(1),
      razorpay_signature: z.string().min(1),
    }),
  ),
  controller.verifyPayment,
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
