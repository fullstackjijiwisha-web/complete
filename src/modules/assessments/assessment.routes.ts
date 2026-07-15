import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/requireAuth';
import { roleGuard } from '../../middleware/roleGuard';
import { validate } from '../../middleware/validate';
import * as controller from './assessment.controller';

export const assessmentRoutes = Router();

assessmentRoutes.use(requireAuth, roleGuard('employee'));

assessmentRoutes.post('/attempts', controller.start);
assessmentRoutes.get('/attempts', controller.history);
assessmentRoutes.get('/attempts/current', controller.getCurrent);
const answerListSchema = z
  .array(z.object({ questionId: z.string().length(24), response: z.unknown() }))
  .max(60);

assessmentRoutes.patch(
  '/attempts/:id/answers',
  validate(z.object({ answers: answerListSchema.min(1) })),
  controller.saveAnswers,
);
// Submit carries the client's full answer set (optional for older clients) so
// scoring never races a still-in-flight autosave.
assessmentRoutes.post(
  '/attempts/:id/submit',
  validate(z.object({ answers: answerListSchema.optional() })),
  controller.submit,
);
assessmentRoutes.get('/attempts/:id/review', controller.review);
