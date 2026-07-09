import type { RequestHandler } from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { Payment } from './payment.model';
import { Organisation } from '../organisations/organisation.model';
import { User } from '../users/user.model';
import { ApiError } from '../../utils/ApiError';
import { authOrgId } from '../../utils/authUser';
import { env } from '../../config/env';
import { safeCompare, hmacSha256Hex } from '../../utils/tokenCompare';
import { logger } from '../../utils/logger';
import { logAudit } from '../auditlog/auditLog.model';

const razorpay =
  env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET
    ? new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET })
    : null;

// Pricing bands (₹/employee by volume) — kept in lockstep with the published
// pricing page (frontend PC.TIERS in js/main.js); the audit fee remains an
// open business item (PRD §16.7). Amounts in paise only.
function seatPricePaisePerEmployee(headcount: number): number {
  if (headcount <= 30) return 48_00;
  if (headcount <= 100) return 36_00;
  if (headcount <= 200) return 24_00;
  return 12_00;
}
const AUDIT_FEE_PAISE = 25_000_00;

// Order amounts are computed server-side from the pricing tier —
// client-sent amounts are ignored (PRD §11).
export const createOrder: RequestHandler = async (req, res) => {
  if (!razorpay) {
    throw new ApiError(503, 'PAYMENTS_NOT_CONFIGURED', 'Payment gateway is not configured');
  }
  const org = await Organisation.findOne({ _id: authOrgId(req), isDeleted: false });
  if (!org) throw ApiError.notFound();

  const type = req.body.type as 'seats' | 'audit';
  const amountPaise =
    type === 'seats' ? org.headcount * seatPricePaisePerEmployee(org.headcount) : AUDIT_FEE_PAISE;

  const order = await razorpay.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt: `${org.orgCode}-${type}-${Date.now()}`,
  });

  await Payment.create({
    orgId: org._id,
    type,
    razorpayOrderId: order.id,
    amountPaise,
    status: 'created',
  });

  res.status(201).json({
    success: true,
    data: { orderId: order.id, amountPaise, currency: 'INR', keyId: env.RAZORPAY_KEY_ID },
  });
};

// Mounted BEFORE express.json() with express.raw() so the HMAC is computed
// over the exact bytes Razorpay signed. Signature comparison is timing-safe.
export const webhook: RequestHandler = async (req, res) => {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    res.status(503).json({ success: false, error: { code: 'PAYMENTS_NOT_CONFIGURED', message: 'Webhook not configured' } });
    return;
  }

  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.body as Buffer;
  if (typeof signature !== 'string' || !Buffer.isBuffer(rawBody)) {
    res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Bad webhook payload' } });
    return;
  }

  const expected = hmacSha256Hex(env.RAZORPAY_WEBHOOK_SECRET, rawBody);
  if (!safeCompare(expected, signature)) {
    logger.warn('Razorpay webhook signature mismatch');
    res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Signature verification failed' } });
    return;
  }

  const event = JSON.parse(rawBody.toString('utf8')) as {
    event: string;
    payload?: {
      payment?: { entity?: { order_id?: string } };
      order?: { entity?: { id?: string } };
    };
  };

  const orderId =
    event.payload?.payment?.entity?.order_id ?? event.payload?.order?.entity?.id;

  if ((event.event === 'payment.captured' || event.event === 'order.paid') && orderId) {
    const payment = await Payment.findOneAndUpdate(
      { razorpayOrderId: orderId, status: { $ne: 'paid' } },
      { $set: { status: 'paid', webhookVerifiedAt: new Date() } },
      { new: true },
    );
    if (payment?.type === 'seats') {
      // Seats activate only after verified payment (PRD F2).
      await Organisation.updateOne(
        { _id: payment.orgId },
        { $set: { seatsActive: true } },
      );
      await logAudit('payment.seats_activated', 'Organisation', payment.orgId.toString(), undefined, {
        orderId,
      });
    }
  } else if (event.event === 'payment.failed' && orderId) {
    await Payment.updateOne(
      { razorpayOrderId: orderId, status: 'created' },
      { $set: { status: 'failed' } },
    );
  }

  // Always 200 on verified webhooks so Razorpay doesn't retry forever.
  res.json({ success: true, data: { received: true } });
};

export const mockActivate: RequestHandler = async (req, res) => {
  const orgId = authOrgId(req);
  await Organisation.updateOne({ _id: orgId }, { $set: { seatsActive: true } });
  await logAudit('payment.seats_activated', 'Organisation', orgId, undefined, {
    mock: true,
  });
  res.json({ success: true, message: 'Seats mock-activated successfully' });
};

// ── Shopify checkout (one variant per pricing tier; quantity = headcount) ────
// Boundaries mirror seatPricePaisePerEmployee so the Shopify total equals the
// app's tiered price exactly (tier rate × headcount).
function seatVariantForHeadcount(headcount: number): string | undefined {
  if (headcount <= 30) return env.SHOPIFY_VARIANT_TIER1;
  if (headcount <= 100) return env.SHOPIFY_VARIANT_TIER2;
  if (headcount <= 200) return env.SHOPIFY_VARIANT_TIER3;
  return env.SHOPIFY_VARIANT_TIER4;
}

// Returns a Shopify cart permalink for the org's headcount, picking the variant
// whose price matches the org's tier. The org is matched back to us at webhook
// time by the orgCode cart attribute and, as a fallback, by the pre-filled
// HR-admin email (see shopifyWebhook).
export const shopifyCheckout: RequestHandler = async (req, res) => {
  if (!env.SHOPIFY_STORE_DOMAIN) {
    throw new ApiError(503, 'PAYMENTS_NOT_CONFIGURED', 'Shopify checkout is not configured');
  }
  const org = await Organisation.findOne({ _id: authOrgId(req), isDeleted: false });
  if (!org) throw ApiError.notFound();

  const variantId = seatVariantForHeadcount(org.headcount);
  if (!variantId) {
    throw new ApiError(
      503,
      'PAYMENTS_NOT_CONFIGURED',
      'No Shopify seat variant is configured for this headcount tier',
    );
  }

  const admin = await User.findOne({ orgId: org._id, role: 'hr_admin', isDeleted: false }).select('email');
  const qty = Math.max(1, org.headcount);
  const params = new URLSearchParams();
  params.set('attributes[orgCode]', org.orgCode);
  if (admin?.email) params.set('checkout[email]', admin.email);
  const url = `https://${env.SHOPIFY_STORE_DOMAIN}/cart/${variantId}:${qty}?${params.toString()}`;

  res.json({ success: true, data: { url } });
};

// Shopify order webhook. Mounted with express.raw() BEFORE the JSON parser so
// the HMAC covers the exact bytes Shopify signed (base64). On a paid order we
// match the organisation and activate its seats — idempotently.
export const shopifyWebhook: RequestHandler = async (req, res) => {
  if (!env.SHOPIFY_WEBHOOK_SECRET) {
    res.status(503).json({ success: false, error: { code: 'PAYMENTS_NOT_CONFIGURED', message: 'Webhook not configured' } });
    return;
  }
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  const rawBody = req.body as Buffer;
  if (typeof hmacHeader !== 'string' || !Buffer.isBuffer(rawBody)) {
    res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Bad webhook payload' } });
    return;
  }

  const digest = crypto.createHmac('sha256', env.SHOPIFY_WEBHOOK_SECRET).update(rawBody).digest('base64');
  if (!safeCompare(digest, hmacHeader)) {
    logger.warn('Shopify webhook signature mismatch');
    res.status(401).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Signature verification failed' } });
    return;
  }

  const order = JSON.parse(rawBody.toString('utf8')) as {
    id?: number | string;
    email?: string;
    financial_status?: string;
    note_attributes?: Array<{ name: string; value: string }>;
    total_price?: string;
  };

  // Only paid orders activate seats.
  if (order.financial_status !== 'paid') {
    res.json({ success: true, data: { ignored: true } });
    return;
  }

  // Identify the org: orgCode cart attribute first, then the buyer's email.
  const attrOrgCode = order.note_attributes?.find((a) => a.name === 'orgCode')?.value;
  let org = attrOrgCode
    ? await Organisation.findOne({ orgCode: attrOrgCode, isDeleted: false })
    : null;
  if (!org && order.email) {
    const admin = await User.findOne({ email: order.email.toLowerCase(), role: 'hr_admin', isDeleted: false });
    if (admin?.orgId) org = await Organisation.findById(admin.orgId);
  }
  if (!org) {
    logger.warn('Shopify order could not be matched to an org', { orderId: order.id, email: order.email });
    res.json({ success: true, data: { received: true, matched: false } });
    return;
  }

  const orderRef = `shopify-${order.id}`;
  const amountPaise = order.total_price ? Math.round(parseFloat(order.total_price) * 100) : 0;
  await Payment.findOneAndUpdate(
    { razorpayOrderId: orderRef },
    { $set: { orgId: org._id, type: 'seats', provider: 'shopify', amountPaise, status: 'paid', webhookVerifiedAt: new Date() } },
    { upsert: true, new: true },
  );
  await Organisation.updateOne({ _id: org._id }, { $set: { seatsActive: true } });
  await logAudit('payment.seats_activated', 'Organisation', org.id, undefined, {
    source: 'shopify',
    orderId: order.id,
  });

  res.json({ success: true, data: { received: true, matched: true } });
};

