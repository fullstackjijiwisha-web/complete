import bcrypt from 'bcryptjs';
import { env } from './config/env';
import { connectDb } from './config/db';
import { logger } from './utils/logger';
import { User } from './modules/users/user.model';

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
  })().catch((err) => {
    preparePromise = null;
    throw err;
  });

  return preparePromise;
}