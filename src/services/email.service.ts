import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// Delivery mode is chosen once at startup, in priority order:
//   1. Brevo HTTP API (BREVO_API_KEY) — sends over HTTPS:443, so it works on
//      hosts that block outbound SMTP ports (Render, many PaaS). Preferred.
//   2. SMTP (SMTP_HOST/USER/PASS) — works locally / on hosts that allow SMTP.
//   3. Neither — emails are logged, not sent (local dev without config).
const brevoApiKey = env.BREVO_API_KEY;
let transporter: Transporter | null = null;

if (brevoApiKey) {
  logger.info('Email via Brevo HTTP API — emails WILL be sent', { from: env.EMAIL_FROM });
} else if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 465,
    secure: (env.SMTP_PORT ?? 465) === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  logger.info('Email via SMTP — emails WILL be sent', {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 465,
    from: env.EMAIL_FROM,
  });
} else {
  logger.warn('Email NOT configured — emails are LOGGED, not sent. Set BREVO_API_KEY (recommended on Render) or SMTP_*', {
    BREVO_API_KEY: brevoApiKey ? 'set' : 'MISSING',
    SMTP_HOST: env.SMTP_HOST ? 'set' : 'MISSING',
    SMTP_USER: env.SMTP_USER ? 'set' : 'MISSING',
    SMTP_PASS: env.SMTP_PASS ? 'set' : 'MISSING',
  });
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  cc?: string | string[];
}

function ccList(cc?: string | string[]): Array<{ email: string }> {
  if (!cc) return [];
  return (Array.isArray(cc) ? cc : [cc]).filter(Boolean).map((email) => ({ email }));
}

// Brevo transactional email over HTTPS — the sender (EMAIL_FROM) must be a
// verified sender in the Brevo account, or Brevo returns a 400.
async function sendViaBrevo(message: EmailMessage): Promise<void> {
  const cc = ccList(message.cc);
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': brevoApiKey as string,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: env.EMAIL_FROM, name: 'POSH Compass' },
      to: [{ email: message.to }],
      ...(cc.length ? { cc } : {}),
      subject: message.subject,
      textContent: message.text,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brevo API ${res.status}: ${detail}`);
  }
}

// Best-effort: a delivery failure is logged, never thrown into the caller (an
// email problem must not fail an enrolment, certificate, etc.).
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!brevoApiKey && !transporter) {
    logger.info('Email (log mode — not sent)', {
      to: message.to,
      cc: message.cc,
      subject: message.subject,
      body: message.text,
    });
    return;
  }
  try {
    if (brevoApiKey) {
      await sendViaBrevo(message);
    } else if (transporter) {
      await transporter.sendMail({ from: env.EMAIL_FROM, ...message });
    }
  } catch (err) {
    logger.error('Email send failed', { to: message.to, message: (err as Error).message });
  }
}
