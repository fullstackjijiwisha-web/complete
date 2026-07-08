import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/requireAuth';
import { validate } from '../../middleware/validate';
import * as controller from './user.controller';

export const userRoutes = Router();

userRoutes.use(requireAuth);

userRoutes.get('/me', controller.getMe);
userRoutes.patch('/me', validate(z.object({ name: z.string().min(2).max(120) })), controller.patchMe);
// DPDP Act 2023 data-principal rights (PRD §11)
userRoutes.get('/me/export', controller.exportMe);
userRoutes.delete(
  '/me',
  validate(z.object({ confirm: z.literal('DELETE MY ACCOUNT') })),
  controller.deleteMe,
);
