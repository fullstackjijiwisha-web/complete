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
  kind: 'zeptomail' | 'brevo' | 'smtp';
  apiKey?: string; // API providers only — used by the health check, never exposed
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

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  csv: 'text/csv',
  txt: 'text/plain',
  html: 'text/html',
};

function mimeFor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

// Zoho ZeptoMail transactional API. The key is a "Send Mail token" and must be
// sent verbatim after the `Zoho-enczapikey ` prefix. The sending domain has to
// be verified in the ZeptoMail console — free-webmail senders are rejected.
async function sendViaZeptoMail(apiKey: string, message: EmailMessage): Promise<void> {
  const cc = ccList(message.cc).map((c) => ({ email_address: { address: c.email } }));
  const res = await fetch(env.ZEPTOMAIL_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-enczapikey ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      from: { address: env.EMAIL_FROM, name: 'POSH Compass' },
      to: [{ email_address: { address: message.to } }],
      ...(cc.length ? { cc } : {}),
      subject: message.subject,
      textbody: message.text,
      ...(message.attachments?.length
        ? {
            attachments: message.attachments.map((a) => ({
              name: a.filename,
              content: a.content.toString('base64'),
              mime_type: mimeFor(a.filename),
            })),
          }
        : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ZeptoMail API ${res.status}: ${detail.slice(0, 200)}`);
  }
}

function buildProviders(): Provider[] {
  const list: Provider[] = [];

  // ZeptoMail first — the primary provider (INR billing, India data centre).
  const zeptoKeys = [env.ZEPTOMAIL_API_KEY, ...(env.ZEPTOMAIL_API_KEYS ?? '').split(',')]
    .map((k) => (k ?? '').trim())
    .filter(Boolean);
  const zeptoSeen = new Set<string>();
  zeptoKeys.forEach((key, i) => {
    if (zeptoSeen.has(key)) return;
    zeptoSeen.add(key);
    list.push({
      name: `zeptomail${i === 0 ? '' : `#${i + 1}`}`,
      kind: 'zeptomail',
      apiKey: key,
      send: (message) => sendViaZeptoMail(key, message),
    });
  });

  const keys = [env.BREVO_API_KEY, ...(env.BREVO_API_KEYS ?? '').split(',')]
    .map((k) => (k ?? '').trim())
    .filter(Boolean);
  const seen = new Set<string>();
  keys.forEach((key, i) => {
    if (seen.has(key)) return;
    seen.add(key);
    list.push({
      name: `brevo${i === 0 ? '' : `#${i + 1}`}`,
      kind: 'brevo',
      apiKey: key,
      send: (message) => sendViaBrevo(key, message),
    });
  });

  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    smtpTransporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 465,
      secure: (env.SMTP_PORT ?? 465) === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
    list.push({
      name: 'smtp',
      kind: 'smtp',
      send: async (message) => {
        await smtpTransporter!.sendMail({ from: env.EMAIL_FROM, ...message });
      },
    });
  }
  return list;
}

// Kept module-level so the health check can verify() the same connection.
let smtpTransporter: Transporter | null = null;

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

// ── Health check ────────────────────────────────────────────────────────
// Answers "why is no email going out?" from inside the product: asks each
// configured Brevo account for its plan/credits and whether the sender
// address is verified. API keys are used but never returned.
export interface ProviderHealth {
  name: string;
  kind: 'zeptomail' | 'brevo' | 'smtp';
  ok: boolean;
  status?: number;
  error?: string;
  hint?: string;
  accountEmail?: string;
  company?: string;
  plans?: Array<{ type: string; creditsType?: string; credits?: number }>;
  creditsRemaining?: number | null;
}

export interface EmailHealth {
  configured: boolean;
  from: string;
  providerCount: number;
  providers: ProviderHealth[];
  senders?: Array<{ email: string; active: boolean }>;
  fromVerified?: boolean | null;
  totalCreditsRemaining?: number | null;
  summary: 'ok' | 'degraded' | 'down' | 'not_configured';
}

interface BrevoPlan {
  type?: string;
  creditsType?: string;
  credits?: number;
}

function zeptoHint(status: number | undefined, body: string): string | undefined {
  if (status === 401 || status === 403) {
    return 'Send Mail token rejected — check ZEPTOMAIL_API_KEY, and confirm ZEPTOMAIL_API_URL matches your account\'s data centre (.in for India, .com for global).';
  }
  if (/domain|sender/i.test(body)) {
    return `The sending domain for ${env.EMAIL_FROM} is not verified in ZeptoMail — verify the domain (SPF/DKIM) and send from an address on it.`;
  }
  if (status === 429) return 'ZeptoMail is rate-limiting — sends are retried on the next provider and by the nightly retry.';
  return undefined;
}

function hintFor(status: number | undefined, body: string): string | undefined {
  if (status === 401) return 'API key is invalid, revoked or regenerated — create a new key in Brevo and update BREVO_API_KEY.';
  if (status === 402) return 'Brevo reports no credits / payment required — top up or upgrade the plan.';
  if (status === 429) return "Rate or daily sending limit reached — it resets on Brevo's schedule; add another account for more headroom.";
  if (/block|suspend|review/i.test(body)) return 'Brevo appears to have blocked or paused this account — contact Brevo support to lift it.';
  return undefined;
}

async function brevoGet(key: string, path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`https://api.brevo.com/v3${path}`, {
    headers: { 'api-key': key, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  return { status: res.status, body: await res.text().catch(() => '') };
}

export async function checkEmailHealth(): Promise<EmailHealth> {
  if (!providers.length) {
    return {
      configured: false,
      from: env.EMAIL_FROM,
      providerCount: 0,
      providers: [],
      summary: 'not_configured',
    };
  }

  const results: ProviderHealth[] = [];
  let sendersList: Array<{ email: string; active: boolean }> | undefined;

  for (const p of providers) {
    if (p.kind === 'zeptomail' && p.apiKey) {
      // ZeptoMail exposes no account endpoint, so authenticate against the
      // send endpoint with an empty payload: 401/403 means the token is bad,
      // while a 400 proves the credentials were accepted. No mail is sent.
      try {
        const res = await fetch(env.ZEPTOMAIL_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Zoho-enczapikey ${p.apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: '{}',
          signal: AbortSignal.timeout(8000),
        });
        const body = await res.text().catch(() => '');
        const authFailed = res.status === 401 || res.status === 403;
        results.push({
          name: p.name,
          kind: 'zeptomail',
          ok: !authFailed,
          ...(authFailed ? { status: res.status, error: body.slice(0, 200) } : {}),
          ...(zeptoHint(res.status, body) ? { hint: zeptoHint(res.status, body)! } : {}),
          ...(authFailed
            ? {}
            : { hint: 'Token accepted. Remaining credits are shown in the ZeptoMail console.' }),
        });
      } catch (err) {
        results.push({
          name: p.name,
          kind: 'zeptomail',
          ok: false,
          error: (err as Error).message.slice(0, 200),
          hint: 'Could not reach the ZeptoMail API (network/timeout).',
        });
      }
      continue;
    }

    if (p.kind === 'smtp') {
      // A real connect + authenticate, so SMTP problems surface here rather
      // than silently failing on the next invite run.
      try {
        await smtpTransporter?.verify();
        results.push({ name: p.name, kind: 'smtp', ok: true, hint: 'Connected and authenticated.' });
      } catch (err) {
        results.push({
          name: p.name,
          kind: 'smtp',
          ok: false,
          error: (err as Error).message.slice(0, 200),
          hint: 'SMTP host rejected the connection or credentials — check SMTP_HOST/PORT/USER/PASS.',
        });
      }
      continue;
    }

    if (p.kind !== 'brevo' || !p.apiKey) continue;
    try {
      const { status, body } = await brevoGet(p.apiKey, '/account');
      if (status !== 200) {
        results.push({
          name: p.name,
          kind: 'brevo',
          ok: false,
          status,
          error: body.slice(0, 200),
          ...(hintFor(status, body) ? { hint: hintFor(status, body)! } : {}),
        });
        continue;
      }
      const json = JSON.parse(body) as {
        email?: string;
        companyName?: string;
        plan?: BrevoPlan[];
      };
      const plans = (json.plan ?? []).map((pl) => ({
        type: pl.type ?? 'unknown',
        ...(pl.creditsType ? { creditsType: pl.creditsType } : {}),
        ...(typeof pl.credits === 'number' ? { credits: pl.credits } : {}),
      }));
      // Email-sending allowance: Brevo reports it as sendLimit (free plans)
      // or a credit balance on paid ones. SMS plans are ignored.
      const emailPlans = plans.filter((pl) => (pl.creditsType ?? '').toLowerCase() !== 'sms');
      const credits = emailPlans.reduce<number | null>(
        (sum, pl) => (typeof pl.credits === 'number' ? (sum ?? 0) + pl.credits : sum),
        null,
      );
      results.push({
        name: p.name,
        kind: 'brevo',
        ok: true,
        ...(json.email ? { accountEmail: json.email } : {}),
        ...(json.companyName ? { company: json.companyName } : {}),
        plans,
        creditsRemaining: credits,
      });

      if (!sendersList) {
        const s = await brevoGet(p.apiKey, '/senders');
        if (s.status === 200) {
          const parsed = JSON.parse(s.body) as { senders?: Array<{ email?: string; active?: boolean }> };
          sendersList = (parsed.senders ?? []).map((x) => ({
            email: x.email ?? '',
            active: Boolean(x.active),
          }));
        }
      }
    } catch (err) {
      results.push({
        name: p.name,
        kind: 'brevo',
        ok: false,
        error: (err as Error).message.slice(0, 200),
        hint: 'Could not reach the Brevo API (network/timeout).',
      });
    }
  }

  const working = results.filter((r) => r.ok);
  const totalCredits = results.reduce<number | null>(
    (sum, r) => (typeof r.creditsRemaining === 'number' ? (sum ?? 0) + r.creditsRemaining : sum),
    null,
  );
  const fromVerified = sendersList
    ? sendersList.some((s) => s.email.toLowerCase() === env.EMAIL_FROM.toLowerCase() && s.active)
    : null;

  let summary: EmailHealth['summary'] = 'ok';
  if (!working.length) summary = 'down';
  else if (working.length < results.length || fromVerified === false || totalCredits === 0) {
    summary = 'degraded';
  }

  return {
    configured: true,
    from: env.EMAIL_FROM,
    providerCount: providers.length,
    providers: results,
    ...(sendersList ? { senders: sendersList } : {}),
    fromVerified,
    totalCreditsRemaining: totalCredits,
    summary,
  };
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
