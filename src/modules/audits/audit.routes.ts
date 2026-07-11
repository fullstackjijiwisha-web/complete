import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/requireAuth';
import { roleGuard } from '../../middleware/roleGuard';
import { validate } from '../../middleware/validate';
import * as controller from './audit.controller';

export const auditRoutes = Router();

auditRoutes.use(requireAuth);

auditRoutes.get('/slots', roleGuard('hr_admin', 'super_admin'), controller.listSlots);
auditRoutes.get('/current', roleGuard('hr_admin'), controller.getCurrentForOrg);
auditRoutes.post(
  '/',
  roleGuard('hr_admin'),
  controller.book,
);
auditRoutes.post(
  '/:id/documents',
  roleGuard('hr_admin'),
  validate(z.object({ name: z.string().min(1).max(200), url: z.string().url().max(2000) })),
  controller.addDocument,
);
auditRoutes.get('/:id', roleGuard('hr_admin', 'auditor', 'super_admin'), controller.getById);
auditRoutes.get(
  '/:id/pack',
  roleGuard('hr_admin', 'auditor', 'super_admin'),
  controller.exportPack,
);
auditRoutes.patch(
  '/:id/checklist',
  roleGuard('auditor', 'super_admin'),
  validate(
    z.object({
      index: z.number().int().min(0).max(50),
      status: z.enum(['pending', 'ok', 'issue']),
      note: z.string().max(2000).optional(),
    }),
  ),
  controller.updateChecklist,
);
auditRoutes.post(
  '/:id/decision',
  roleGuard('auditor', 'super_admin'),
  validate(
    z.object({
      decision: z.enum(['passed', 'failed', 'changes_requested']),
      findings: z.string().max(10_000).optional(),
    }),
  ),
  controller.decide,
);
