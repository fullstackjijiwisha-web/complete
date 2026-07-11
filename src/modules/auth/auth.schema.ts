import { z } from 'zod';

// Password complexity: ≥10 chars, at least one uppercase, one digit, one special char.
// Same rule applied to HR-admin registration and employee invite acceptance.
const strongPassword = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .refine((p) => /[A-Z]/.test(p), { message: 'Password must contain at least one uppercase letter' })
  .refine((p) => /[0-9]/.test(p), { message: 'Password must contain at least one number' })
  .refine((p) => /[^A-Za-z0-9]/.test(p), { message: 'Password must contain at least one special character' });

export const registerOrgSchema = z.object({
  orgName: z.string().min(2).max(200),
  registrationNo: z.string().max(100).optional(),
  industry: z.string().min(1).max(100).optional(),
  companySize: z.enum(['micro', 'small', 'medium', 'large']).optional(),
  /** GST is optional — format varies by state */
  gst: z.string().max(20).optional(),
  billingContact: z
    .object({
      name: z.string().min(1).max(120).optional(),
      email: z.string().email().max(254).optional(),
    })
    .optional(),
  headcount: z.number().int().min(1).max(1_000_000),
  adminName: z.string().min(2).max(120),
  email: z.string().email().max(254),
  adminMobile: z.string().max(20).optional(),
  adminWhatsapp: z.string().max(20).optional(),
  password: strongPassword,
});
export type RegisterOrgInput = z.infer<typeof registerOrgSchema>;

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().length(64),
  password: strongPassword,
  // DPDP Act 2023: explicit consent captured at invite acceptance (PRD §11)
  consent: z.literal(true),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

