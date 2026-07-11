import express, { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/requireAuth';
import { roleGuard } from '../../middleware/roleGuard';
import { validate } from '../../middleware/validate';
import * as controller from './employee.controller';

export const employeeRoutes = Router();

employeeRoutes.use(requireAuth, roleGuard('hr_admin'));

employeeRoutes.get('/', controller.listEmployees);
employeeRoutes.post(
  '/',
  validate(
    z.object({
      name: z.string().min(2).max(120),
      email: z.string().email().max(254),
      whatsapp: z.string().max(20).optional(),
    }),
  ),
  controller.addEmployee,
);
// Blank CSV template download — helps HR admins format their employee file correctly.
employeeRoutes.get('/import/template', controller.downloadImportTemplate);
// Exposes a downloadable CSV error report of the last CSV bulk upload.
employeeRoutes.get('/import/errors', controller.downloadImportErrors);
// Raw CSV upload — parsed and re-validated entirely server-side (PRD §12).
employeeRoutes.post(
  '/import',
  express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }),
  controller.importEmployees,
);
employeeRoutes.post('/:id/resend-invite', controller.resendInvite);
employeeRoutes.patch('/:id/approve-reattempt', controller.approveReattempt);
employeeRoutes.delete('/:id', controller.removeEmployee);

