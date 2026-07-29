import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// Delivery is attempted across EVERY configured provider in order, so one
// account's daily allowance is not the whole platform's ceiling: a send the
// first provider rejects (typically "daily limit reached") is retried on the
// next one automatically. Configure as many as needed —
//   BREVO_API_KEY + BREVO_API_KEYS (comma-separated extra keys), then SMTP.
// With none configured, messages are logged instead of sent (local dev).
interface Provider {
  name: string;
  send: (message: EmailMessage) => Promise<void>;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  cc?: string | string[];
  attachments?: Array<{ filename: string; content: Buffer }>;
}

// Outcome of an attempted send. 'logged' means no provider is configured
// (local dev) — the message was written to the log instead of delivered.
export interface EmailResult {
  delivered: boolean;
  mode: 'sent' | 'logged' | 'failed';
  provider?: string;
  error?: string;
}

function ccList(cc?: string | string[]): Array<{ email: string }> {
  if (!cc) return [];
  return (Array.isArray(cc) ? cc : [cc]).filter(Boolean).map((email) => ({ email }));
}

// Brevo transactional email over HTTPS — the sender (EMAIL_FROM) must be a
// verified sender in the Brevo account, or Brevo returns a 400.
async function sendViaBrevo(apiKey: string, message: EmailMessage): Promise<void> {
  const cc = ccList(message.cc);
  const attachmentsMapped = message.attachments?.map((a) => ({
    name: a.filename,
    content: a.content.toString('base64'),
  }));

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: env.EMAIL_FROM, name: 'POSH Compass' },
      to: [{ email: message.to }],
      ...(cc.length ? { cc } : {}),
      subject: message.subject,
      textContent: message.text,
      ...(attachmentsMapped?.length ? { attachment: attachmentsMapped } : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brevo API ${res.status}: ${detail.slice(0, 200)}`);
  }
}

function buildProviders(): Provider[] {
  const list: Provider[] = [];
  const keys = [env.BREVO_API_KEY, ...(env.BREVO_API_KEYS ?? '').split(',')]
    .map((k) => (k ?? '').trim())
    .filter(Boolean);
  const seen = new Set<string>();
  keys.forEach((key, i) => {
    if (seen.has(key)) return;
    seen.add(key);
    list.push({
      name: `brevo${i === 0 ? '' : `#${i + 1}`}`,
      send: (message) => sendViaBrevo(key, message),
    });
  });

  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    const transporter: Transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 465,
      secure: (env.SMTP_PORT ?? 465) === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
    list.push({
      name: 'smtp',
      send: async (message) => {
        await transporter.sendMail({ from: env.EMAIL_FROM, ...message });
      },
    });
  }
  return list;
}

const providers = buildProviders();

if (providers.length) {
  logger.info('Email delivery configured — emails WILL be sent', {
    providers: providers.map((p) => p.name).join(', '),
    from: env.EMAIL_FROM,
  });
} else {
  logger.warn(
    'Email NOT configured — emails are LOGGED, not sent. Set BREVO_API_KEY (and optionally BREVO_API_KEYS for more daily capacity) or SMTP_*',
    {
      BREVO_API_KEY: 'MISSING',
      SMTP_HOST: env.SMTP_HOST ? 'set' : 'MISSING',
      SMTP_USER: env.SMTP_USER ? 'set' : 'MISSING',
      SMTP_PASS: env.SMTP_PASS ? 'set' : 'MISSING',
    },
  );
}

export function emailProviderNames(): string[] {
  return providers.map((p) => p.name);
}

// Best-effort: a delivery failure is logged and REPORTED to the caller, never
// thrown (an email problem must not fail an enrolment, certificate, etc.).
// Callers that care — invites especially — record the outcome so operators can
// see who actually received their email instead of guessing.
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (!providers.length) {
    logger.info('Email (log mode — not sent)', {
      to: message.to,
      cc: message.cc,
      subject: message.subject,
      body: message.text,
      attachmentsCount: message.attachments?.length ?? 0,
    });
    return { delivered: false, mode: 'logged' };
  }

  const errors: string[] = [];
  for (const provider of providers) {
    try {
      await provider.send(message);
      if (errors.length) {
        logger.info('Email delivered on a fallback provider', {
          to: message.to,
          provider: provider.name,
          afterFailures: errors.length,
        });
      }
      return { delivered: true, mode: 'sent', provider: provider.name };
    } catch (err) {
      const detail = `${provider.name}: ${(err as Error).message}`;
      errors.push(detail);
      logger.error('Email send failed on provider', { to: message.to, message: detail });
    }
  }
  return { delivered: false, mode: 'failed', error: errors.join(' | ').slice(0, 300) };
}
