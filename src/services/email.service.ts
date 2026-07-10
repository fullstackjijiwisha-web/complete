import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';

let transporter: Transporter | null = null;

if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 465,
    secure: (env.SMTP_PORT ?? 465) === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  logger.info('SMTP configured — emails WILL be sent', {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 465,
    from: env.EMAIL_FROM,
  });
} else {
  // Startup diagnostic: shows exactly which SMTP variable is absent so a
  // misconfigured deployment is obvious in the logs instead of silently
  // falling back to log-only mode.
  logger.warn('SMTP NOT configured — emails are LOGGED, not sent. Check these Render env vars:', {
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

// Without SMTP config (local dev), emails are logged instead of sent —
// invite links still appear in the console for manual testing.
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!transporter) {
    logger.info('Email (dev mode — not sent)', {
      to: message.to,
      cc: message.cc,
      subject: message.subject,
      body: message.text,
    });
    return;
  }
  try {
    await transporter.sendMail({ from: env.EMAIL_FROM, ...message });
  } catch (err) {
    logger.error('Email send failed', { to: message.to, message: (err as Error).message });
  }
}
