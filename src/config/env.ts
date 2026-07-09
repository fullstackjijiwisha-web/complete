import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  MONGODB_URI: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  CLIENT_URL: z.string().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  // Absolute or cwd-relative path to the static frontend. When set, the API
  // also serves the site (same origin — required by the SameSite=Strict
  // refresh cookie, see README deployment notes). Leave unset to run API-only.
  FRONTEND_DIR: z.string().optional(),

  ENCRYPTION_KEY: z.string().length(64).optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('noreply@jijiwishasociety.org'),
  // Jijiwisha ops inbox — CC'd on every issued certificate and on POSH Ready.
  JIJIWISHA_NOTIFY_EMAIL: z.string().default('fullstackjijiwisha@gmail.com'),

  // Where an employee below the pass threshold is sent for refresher training.
  // Empty until Jijiwisha supplies the course link — the CTA degrades gracefully.
  TRAINING_URL: z.string().optional(),

  // WhatsApp (Meta Cloud API). Without a token+phone-number-id the service runs
  // in log mode — it records the message it would have sent but delivers nothing.
  WHATSAPP_BUSINESS_NUMBER: z.string().optional(),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),

  SENTRY_DSN: z.string().optional(),

  SUPER_ADMIN_EMAIL: z.string().optional(),
  SUPER_ADMIN_PASSWORD: z.string().optional(),

  // ── Domain thresholds (platform constants — never per-organisation) ──
  CERT_PASS_THRESHOLD: z.coerce.number().min(0).max(100).default(80),
  ORG_READY_THRESHOLD: z.coerce.number().min(0).max(100).default(95),
  ATTEMPT_TIME_LIMIT_MIN: z.coerce.number().positive().default(45),
  MAX_ATTEMPTS_PER_CYCLE: z.coerce.number().positive().default(3),

  PAPER_MCQ_COUNT: z.coerce.number().min(0).default(30),
  PAPER_FIB_COUNT: z.coerce.number().min(0).default(10),
  PAPER_CASE_COUNT: z.coerce.number().min(0).default(6),
  PAPER_SIM_COUNT: z.coerce.number().min(0).default(4),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Shopify checkout for seat purchases. STORE_DOMAIN like
  // "posh-compass.myshopify.com"; WEBHOOK_SECRET is the webhook signing secret.
  // One seat-product variant per pricing tier (qty = headcount), so the tiered
  // ₹48/36/24/12 rates are reproduced exactly:
  //   TIER1 ≤30 · TIER2 31–100 · TIER3 101–200 · TIER4 201+
  SHOPIFY_STORE_DOMAIN: z.string().optional(),
  SHOPIFY_VARIANT_TIER1: z.string().optional(),
  SHOPIFY_VARIANT_TIER2: z.string().optional(),
  SHOPIFY_VARIANT_TIER3: z.string().optional(),
  SHOPIFY_VARIANT_TIER4: z.string().optional(),
  SHOPIFY_WEBHOOK_SECRET: z.string().optional(),

  CERT_VERIFY_BASE_URL: z.string().default('http://localhost:5173/verify'),
  CERT_SIGNING_SECRET: z.string().min(32).optional(),

  PUBLIC_STATS_CACHE_TTL_SEC: z.coerce.number().positive().default(600),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Crash immediately — never run with bad config
  console.error('❌ Invalid environment variables:', z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
