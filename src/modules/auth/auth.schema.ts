import { z } from 'zod';

export const registerOrgSchema = z.object({
  orgName: z.string().min(2).max(200),
  registrationNo: z.string().max(100).optional(),
  headcount: z.number().int().min(1).max(1_000_000),
  adminName: z.string().min(2).max(120),
  email: z.string().email().max(254),
  adminWhatsapp: z.string().max(20).optional(),
  password: z.string().min(10).max(128),
});
export type RegisterOrgInput = z.infer<typeof registerOrgSchema>;

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().length(64),
  password: z.string().min(10).max(128),
  // DPDP Act 2023: explicit consent captured at invite acceptance (PRD §11)
  consent: z.literal(true),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
