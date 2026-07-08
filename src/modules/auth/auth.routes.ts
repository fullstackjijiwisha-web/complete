import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/requireAuth';
import { registerOrgSchema, loginSchema, acceptInviteSchema } from './auth.schema';
import * as controller from './auth.controller';

// Google OAuth for HR admins (PRD §6) is env-gated and lands post-P0 —
// add passport strategy in config/passport.ts when GOOGLE_CLIENT_ID is set.
export const authRoutes = Router();

authRoutes.post('/register-org', validate(registerOrgSchema), controller.registerOrg);
authRoutes.post('/login', validate(loginSchema), controller.login);
authRoutes.post('/refresh', controller.refresh);
authRoutes.post('/logout', requireAuth, controller.logout);
authRoutes.post('/invite/accept', validate(acceptInviteSchema), controller.acceptInvite);
