import bcrypt from 'bcryptjs';
import { env } from './config/env';
import { connectDb } from './config/db';
import { logger } from './utils/logger';
import { User } from './modules/users/user.model';
import { seedCuratedBank } from './modules/questions/question.seed';

let preparePromise: Promise<void> | null = null;

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

export async function prepareRuntime(): Promise<void> {
  if (preparePromise) return preparePromise;

  preparePromise = (async () => {
    await connectDb();
    await seedSuperAdmin();
    // Sync the curated question bank on startup so every deploy keeps the live
    // bank in step with the code. Non-fatal: a seeding hiccup must not take the
    // API down — the site stays up and retries on the next cold start.
    try {
      const { inserted, retired, total } = await seedCuratedBank();
      if (inserted || retired) {
        logger.info(`Question bank synced: ${inserted} inserted, ${retired} legacy retired, ${total} active`);
      }
    } catch (err) {
      logger.error('Question bank seeding failed (continuing)', { message: (err as Error).message });
    }
  })().catch((err) => {
    preparePromise = null;
    throw err;
  });

  return preparePromise;
}