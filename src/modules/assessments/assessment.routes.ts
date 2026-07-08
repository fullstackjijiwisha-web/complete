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
assessmentRoutes.patch(
  '/attempts/:id/answers',
  validate(
    z.object({
      answers: z
        .array(z.object({ questionId: z.string().length(24), response: z.unknown() }))
        .min(1)
        .max(60),
    }),
  ),
  controller.saveAnswers,
);
assessmentRoutes.post('/attempts/:id/submit', controller.submit);
assessmentRoutes.get('/attempts/:id/review', controller.review);
