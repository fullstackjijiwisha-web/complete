import express from 'express';
import type { Express } from 'express';
import path from 'path';
import * as Sentry from '@sentry/node';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env';
import { dbIsReady } from './config/db';
import { sanitizeRequest } from './middleware/sanitize';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { globalLimiter, authLimiter, publicLimiter } from './middleware/rateLimiters';
import { authRoutes } from './modules/auth/auth.routes';
import { userRoutes } from './modules/users/user.routes';
import { organisationRoutes } from './modules/organisations/organisation.routes';
import { employeeRoutes } from './modules/employees/employee.routes';
import { assessmentRoutes } from './modules/assessments/assessment.routes';
import { certificateRoutes } from './modules/certificates/certificate.routes';
import { auditRoutes } from './modules/audits/audit.routes';
import { paymentRoutes } from './modules/payments/payment.routes';
import { publicRoutes } from './modules/stats/stats.routes';
import { adminRoutes } from './modules/admin/admin.routes';
import { webhook as razorpayWebhook } from './modules/payments/payment.controller';

export function createApp(): Express {
  const app = express();
  app.set('trust proxy', 1); // behind Render/Railway — needed for rate-limit + secure cookies

  // Health endpoints first — no auth, outside all rate limits (blueprint §4).
  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'up' } });
  });
  app.get('/ready', (_req, res) => {
    if (dbIsReady()) res.json({ success: true, data: { status: 'ready' } });
    else res.status(503).json({ success: false, error: { code: 'NOT_READY', message: 'Database not connected' } });
  });

  // 1. Security headers. When we also serve the static frontend, the CSP must
  //    allow the site's inline scripts and the Razorpay checkout (script +
  //    iframe + API calls); helmet's default script-src 'self' would block both.
  app.use(
    helmet(
      env.FRONTEND_DIR
        ? {
            contentSecurityPolicy: {
              directives: {
                'script-src': ["'self'", "'unsafe-inline'", 'https://checkout.razorpay.com'],
                'frame-src': ['https://api.razorpay.com', 'https://checkout.razorpay.com'],
                'connect-src': ["'self'", 'https://api.razorpay.com', 'https://lumberjack.razorpay.com'],
                'img-src': ["'self'", 'data:', 'https:'],
              },
            },
          }
        : {},
    ),
  );

  // 2. CORS — explicit origin list only, never '*' with credentials
  app.use(
    cors({
      origin: env.CORS_ORIGINS.split(','),
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );

  // 3. Razorpay webhook BEFORE the JSON parser — the HMAC signature covers
  //    the exact raw bytes (PRD §11).
  app.post('/api/v1/payments/webhook', express.raw({ type: 'application/json' }), razorpayWebhook);

  // 4. Body parsing (CSV import mounts its own text parser route-level)
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // 5. NoSQL injection prevention (Express-5-safe replacement for
  //    express-mongo-sanitize)
  app.use(sanitizeRequest);

  // 6. Request logging (dev only)
  if (env.NODE_ENV === 'development') app.use(morgan('dev'));

  // 7. Rate limits: global → strict auth tier → public tier
  app.use('/api', globalLimiter);

  // 8. Routes — a friendly index at the bare prefix, then the modules
  app.get('/api/v1', (_req, res) => {
    res.json({
      success: true,
      data: {
        name: 'POSH Compass API',
        version: 'v1',
        docs: 'backend/docs/API.md',
        try: {
          publicStats: 'GET /api/v1/public/stats',
          verifyCertificate: 'GET /api/v1/public/verify/:certId',
          registerOrg: 'POST /api/v1/auth/register-org',
          login: 'POST /api/v1/auth/login',
          me: 'GET /api/v1/users/me (Bearer token)',
        },
      },
    });
  });
  app.use('/api/v1/auth', authLimiter, authRoutes);
  app.use('/api/v1/public', publicLimiter, publicRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/orgs/me/employees', employeeRoutes);
  app.use('/api/v1/orgs', organisationRoutes);
  app.use('/api/v1/assessments', assessmentRoutes);
  app.use('/api/v1/certificates', certificateRoutes);
  app.use('/api/v1/audits', auditRoutes);
  app.use('/api/v1/payments', paymentRoutes);
  app.use('/api/v1/admin', adminRoutes);

  // 9. Static frontend (same-origin — the SameSite=Strict refresh cookie and
  //    credentialed fetches only work when site and API share an origin).
  if (env.FRONTEND_DIR) {
    const frontendDir = path.resolve(process.cwd(), env.FRONTEND_DIR);
    // Clean URLs used in emailed links / certificate verifyUrl:
    app.get('/invite/accept', (_req, res) => res.sendFile(path.join(frontendDir, 'invite.html')));
    app.get('/verify/:certId', (_req, res) => res.sendFile(path.join(frontendDir, 'verify.html')));
    app.use(express.static(frontendDir));
  }

  // 10. Sentry error handler before our own (only when configured)
  if (env.SENTRY_DSN) Sentry.setupExpressErrorHandler(app);

  // 11. 404 + central error handler (always last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
