import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface WhatsAppMessage {
  to: string; // recipient's number, any common format — normalised below
  body: string;
}

// Meta expects E.164 digits with no '+', spaces or punctuation. Indian numbers
// entered as a bare 10-digit mobile get the 91 country code prepended.
function normalise(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

const configured = Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);

// Mirrors the email service: with credentials it delivers via the Meta
// WhatsApp Cloud API; without them it logs the message it would have sent so
// the whole enrolment/result flow is exercisable in development. Best-effort —
// never throws into the caller (a delivery failure must not fail an assessment).
export async function sendWhatsApp(message: WhatsAppMessage): Promise<void> {
  const to = normalise(message.to);
  if (!to) return;

  if (!configured) {
    logger.info('WhatsApp (log mode — not sent; set WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID to deliver)', {
      to,
      body: message.body,
    });
    return;
  }

  try {
    const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message.body },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.error('WhatsApp send failed', { to, status: res.status, detail });
    }
  } catch (err) {
    logger.error('WhatsApp send error', { to, message: (err as Error).message });
  }
}
