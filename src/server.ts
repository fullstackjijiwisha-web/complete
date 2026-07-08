import http from 'http';
import * as Sentry from '@sentry/node';
import bcrypt from 'bcryptjs';
import { env } from './config/env';
import { connectDb, disconnectDb } from './config/db';
import { createApp } from './app';
import { initSockets } from './sockets';
import { startCronJobs } from './services/cron.service';
import { logger } from './utils/logger';
import { User } from './modules/users/user.model';

// Sentry first, with PII scrubbing (blueprint §6).
if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.data;
      }
      return event;
    },
  });
}

async function seedSuperAdmin(): Promise<void> {
  if (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD) return;
  const existing = await User.findOne({ email: env.SUPER_ADMIN_EMAIL.toLowerCase() });
  if (existing) return;
  await User.create({
    email: env.SUPER_ADMIN_EMAIL,
    name: 'Jijiwisha Super Admin',
    role: 'super_admin',
    passwordHash: await bcrypt.hash(env.SUPER_ADMIN_PASSWORD, 12),
    status: 'active',
  });
  logger.info('Super admin account seeded');
}

async function main(): Promise<void> {
  await connectDb();
  await seedSuperAdmin();

  const app = createApp();
  const server = http.createServer(app);
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(
        `Port ${env.PORT} is already in use — another 'npm run dev' is probably running in a different terminal. ` +
          `Stop it with Ctrl+C (or change PORT in .env). Only run ONE dev server at a time.`,
      );
      process.exit(1);
    }
    throw err;
  });
  initSockets(server);
  startCronJobs();

  server.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`POSH Compass API listening on :${env.PORT} (${env.NODE_ENV})`);
    logger.info(`➜ API base:      http://localhost:${env.PORT}/api/v1`);
    logger.info(`➜ Health check:  http://localhost:${env.PORT}/health`);
    logger.info(`➜ Readiness:     http://localhost:${env.PORT}/ready`);
    logger.info(`➜ Public stats:  http://localhost:${env.PORT}/api/v1/public/stats`);
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received — shutting down`);
    server.close(() => {
      void disconnectDb().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Fatal startup error', { message: (err as Error).message });
  process.exit(1);
});
