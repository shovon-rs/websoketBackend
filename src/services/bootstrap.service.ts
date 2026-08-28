import { prisma } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Self-heals an *existing* account into super_admin at boot. This only covers the case
 * where the account already exists — a user registering after the env var is set is
 * handled separately in auth.controller.ts::register (there's no other way to grant the
 * first super_admin, since nobody with the role exists yet to grant it through the API).
 */
export async function ensureSuperAdminBootstrap(): Promise<void> {
  if (!env.SUPER_ADMIN_EMAIL) return;

  const { count } = await prisma.user.updateMany({
    where: { email: { equals: env.SUPER_ADMIN_EMAIL, mode: 'insensitive' }, role: { not: 'super_admin' } },
    data: { role: 'super_admin' },
  });

  if (count > 0) logger.info({ email: env.SUPER_ADMIN_EMAIL }, 'Promoted configured super admin account');
}
