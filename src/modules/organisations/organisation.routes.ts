import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/requireAuth';
import { roleGuard } from '../../middleware/roleGuard';
import { validate } from '../../middleware/validate';
import * as controller from './organisation.controller';

export const organisationRoutes = Router();

organisationRoutes.use(requireAuth, roleGuard('hr_admin'));

organisationRoutes.get('/me', controller.getMyOrg);
organisationRoutes.patch(
  '/me',
  validate(
    z.object({
      headcount: z.number().int().min(1).max(1_000_000).optional(),
      reportingPeriod: z
        .object({ start: z.coerce.date(), end: z.coerce.date() })
        .refine((p) => p.end > p.start, { message: 'end must be after start' })
        .optional(),
    }),
  ),
  controller.patchMyOrg,
);
organisationRoutes.get('/me/readiness', controller.getReadiness);
organisationRoutes.get('/me/dashboard', controller.getDashboard);
organisationRoutes.get('/me/ready-certificate', controller.getReadyCertificate);
organisationRoutes.get('/me/ready-certificate/pdf', controller.getReadyCertificatePdf);
organisationRoutes.post('/me/audit/decline', controller.declineAudit);
