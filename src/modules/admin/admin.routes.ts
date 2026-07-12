import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/requireAuth';
import { roleGuard } from '../../middleware/roleGuard';
import { validate } from '../../middleware/validate';
import * as controller from './admin.controller';

export const adminRoutes = Router();

adminRoutes.use(requireAuth, roleGuard('super_admin'));

// Question bank (PRD F3) — versioned CRUD, four formats. No defaults on the
// base schema: with zod, `.partial()` still substitutes a `.default()` value
// when a key is entirely absent from the body, which would make every PATCH
// silently reset tags/isActive/difficulty to their defaults on fields the
// admin dashboard doesn't send (e.g. wiping a question's tags, or
// reactivating a soft-deleted one). Defaults are applied only for creation.
const optionSchema = z.object({ text: z.string().min(1), weight: z.number().min(0).max(1) });
const questionBaseSchema = z.object({
  type: z.enum(['mcq', 'fib', 'case_study', 'simulation']),
  tags: z.array(z.string().min(1)).optional(),
  actReference: z.string().max(200).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  body: z.string().min(10),
  options: z.array(optionSchema).min(2).optional(),
  blanks: z.array(z.object({ acceptedAnswers: z.array(z.string().min(1)).min(1) })).optional(),
  nodes: z
    .array(
      z.object({
        nodeId: z.string().min(1),
        prompt: z.string().min(1),
        choices: z
          .array(
            z.object({
              choiceId: z.string().min(1),
              text: z.string().min(1),
              impact: z.number().min(0).max(1),
              nextNodeId: z.string().optional(),
            }),
          )
          .min(2),
      }),
    )
    .optional(),
  isActive: z.boolean().optional(),
});
const createQuestionSchema = questionBaseSchema.extend({
  tags: z.array(z.string().min(1)).default([]),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  isActive: z.boolean().default(true),
});

adminRoutes.get('/questions', controller.listQuestions);
adminRoutes.post('/questions', validate(createQuestionSchema), controller.createQuestion);
adminRoutes.patch('/questions/:id', validate(questionBaseSchema.partial()), controller.updateQuestion);
adminRoutes.delete('/questions/:id', controller.deleteQuestion);

adminRoutes.get('/orgs', controller.listOrgs);
adminRoutes.patch(
  '/orgs/:id',
  validate(z.object({ seatsActive: z.boolean().optional(), isDeleted: z.boolean().optional() })),
  controller.patchOrg,
);

// Danger zone — permanently deletes every organisation and everything scoped
// to it. A confirmation phrase is required in the body so a bare/replayed POST
// can never trigger it. A full backup is taken before deleting (see
// organisation.reset.ts); wipe-backups routes let it be retrieved afterward.
adminRoutes.get('/organisations/wipe-preview', controller.previewWipeOrganisations);
adminRoutes.post(
  '/organisations/wipe',
  validate(z.object({ confirm: z.literal('DELETE ALL ORGANISATIONS') })),
  controller.wipeOrganisations,
);
adminRoutes.get('/organisations/wipe-backups', controller.listWipeBackups);
adminRoutes.get('/organisations/wipe-backups/:id', controller.getWipeBackup);

adminRoutes.get('/audit-log', controller.listAuditLog);
adminRoutes.get('/config', controller.getConfig);

adminRoutes.post(
  '/audit-slots',
  validate(z.object({ startsAt: z.coerce.date() })),
  controller.createAuditSlot,
);
adminRoutes.patch(
  '/audits/:id/assign',
  validate(z.object({ auditorId: z.string().length(24) })),
  controller.assignAuditor,
);
adminRoutes.post(
  '/auditors',
  validate(
    z.object({
      name: z.string().min(2).max(120),
      email: z.string().email().max(254),
      password: z.string().min(10).max(128),
    }),
  ),
  controller.createAuditor,
);

// Public-stats moderation: trust score source is survey-based (PRD §16.8)
adminRoutes.patch(
  '/public-stats',
  validate(z.object({ trustScore: z.number().min(0).max(5) })),
  controller.setTrustScore,
);

// Upload a custom PDF compliance certificate to a specific organisation
adminRoutes.post(
  '/orgs/:id/upload-certificate',
  validate(
    z.object({
      filename: z.string().min(1),
      base64Data: z.string().min(1),
    }),
  ),
  controller.uploadCertificate,
);

// Download the compliance certificate for a specific organisation
adminRoutes.get('/orgs/:id/certificate', controller.downloadOrgCertificate);

// Download an evidence document uploaded by an organisation (by org id + doc index)
adminRoutes.get('/orgs/:id/documents/:docIndex', controller.downloadOrgAuditDocument);
