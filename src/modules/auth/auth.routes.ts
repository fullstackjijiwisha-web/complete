import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/requireAuth';
import { inviteLimiter } from '../../middleware/rateLimiters';
import { registerOrgSchema, loginSchema, acceptInviteSchema } from './auth.schema';
import * as controller from './auth.controller';

// Google OAuth for HR admins (PRD §6) is env-gated and lands post-P0 —
// add passport strategy in config/passport.ts when GOOGLE_CLIENT_ID is set.
export const authRoutes = Router();

authRoutes.post('/register-org', validate(registerOrgSchema), controller.registerOrg);
authRoutes.post('/login', validate(loginSchema), controller.login);
authRoutes.post('/refresh', controller.refresh);
authRoutes.post('/logout', requireAuth, controller.logout);
// Per-token budget (see inviteLimiter) overrides the office-wide auth limiter
// mounted on /api/v1/auth — colleagues activating together must not throttle
// each other.
authRoutes.post(
  '/invite/accept',
  inviteLimiter,
  validate(acceptInviteSchema),
  controller.acceptInvite,
);
