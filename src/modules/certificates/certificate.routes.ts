import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { roleGuard } from '../../middleware/roleGuard';
import * as controller from './certificate.controller';

export const certificateRoutes = Router();

certificateRoutes.get('/me', requireAuth, roleGuard('employee'), controller.getMine);
certificateRoutes.get('/me/pdf', requireAuth, roleGuard('employee'), controller.getMinePdf);
