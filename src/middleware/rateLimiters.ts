import rateLimit from 'express-rate-limit';

const limitBody = {
  success: false,
  error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, slow down' },
};

// Global cap on all /api traffic (health endpoints are mounted outside it).
export const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitBody,
});

// Strict limit on credential endpoints — successful requests don't count.
export const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitBody,
});

// Public unauthenticated tier: certificate verify, public stats, sample assessment.
export const publicLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitBody,
});
