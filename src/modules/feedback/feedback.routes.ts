import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/requireAuth';
import { roleGuard } from '../../middleware/roleGuard';
import { validate } from '../../middleware/validate';
import { SUGGESTION_KEYS } from './feedback.model';
import * as controller from './feedback.controller';

export const feedbackRoutes = Router();

feedbackRoutes.use(requireAuth, roleGuard('employee'));

const stars = z.number().int().min(1).max(5);
feedbackRoutes.post(
  '/',
  validate(
    z.object({
      attemptId: z.string().length(24),
      ratings: z.object({
        overall: stars,
        content: stars,
        caseScenarios: stars,
        application: stars,
        recommendation: z.number().int().min(0).max(10),
      }),
      suggestions: z.array(z.enum(SUGGESTION_KEYS)).max(SUGGESTION_KEYS.length).optional(),
      suggestionOther: z.string().max(200).optional(),
      comments: z.string().max(500).optional(),
    }),
  ),
  controller.submitFeedback,
);
