import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import crypto from 'crypto';

const limitBody = {
  success: false,
  error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, slow down' },
};

// Whole organisations sit behind a single corporate NAT/proxy, so a purely
// IP-keyed budget is shared by every employee of that office at once — a
// 450-seat client taking the assessment (autosave fires ~1 req/s per person)
// exhausts it and everyone starts seeing "Too many requests". Authenticated
// traffic is therefore keyed per access token (i.e. per employee) and only
// anonymous traffic falls back to the IP bucket.
function perUserOrIp(req: Request): string {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return 'u:' + crypto.createHash('sha256').update(header.slice(7)).digest('hex').slice(0, 32);
  }
  return ipKeyGenerator(req.ip ?? '');
}

// Global cap on all /api traffic (health endpoints are mounted outside it).
export const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  keyGenerator: perUserOrIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitBody,
});

// Strict limit on credential endpoints — successful requests don't count.
// Invite activation is skipped here and handled by inviteLimiter instead
// (per-token, not per-office-IP).
export const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: perUserOrIp,
  skip: (req: Request) =>
    req.path === '/invite/accept' || req.originalUrl.startsWith('/api/v1/auth/invite/accept'),
  standardHeaders: true,
  legacyHeaders: false,
  message: limitBody,
});

// Invite activation is keyed by the invite token, not the IP: hundreds of
// colleagues activate from the same office address within minutes, and one
// person retrying a dead link must never lock the rest of the office out.
// Guessing a 64-hex token is infeasible, so a generous per-token budget is safe.
export const inviteLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  keyGenerator: (req: Request): string => {
    const token = (req.body as { token?: unknown } | undefined)?.token;
    if (typeof token === 'string' && token.length >= 16) {
      return 'inv:' + crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
    }
    return ipKeyGenerator(req.ip ?? '');
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: limitBody,
});

// Public unauthenticated tier: certificate verify, public stats, sample assessment.
export const publicLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  keyGenerator: perUserOrIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitBody,
});
