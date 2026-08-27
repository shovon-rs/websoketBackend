import { prisma } from '../config/database';
import * as presence from '../redis/presence';
import { logger } from '../utils/logger';

export async function markUserOnline(userId: string): Promise<void> {
  await Promise.all([presence.markOnlineSince(userId), presence.setPresence(userId)]);
}

/** Called on every heartbeat — extends both TTLs without disturbing the original "online since" value. */
export async function touchUserOnline(userId: string): Promise<void> {
  await Promise.all([presence.refreshOnlineSince(userId), presence.refreshPresence(userId)]);
}

/** Called once the user's last socket disconnects — records when they were last seen. */
export async function markUserOffline(userId: string): Promise<void> {
  await Promise.all([presence.clearOnlineSince(userId), presence.clearPresence(userId)]);
  await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } }).catch((err) => {
    logger.warn({ err, userId }, 'Failed to record last-seen timestamp');
  });
}
