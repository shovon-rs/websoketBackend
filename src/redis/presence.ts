import { redisClient } from '../config/redis';

const PRESENCE_TTL_SECONDS = 60;
const key = (userId: string) => `presence:${userId}`;

export type PresenceState = 'online' | 'away';

export async function setPresence(userId: string, state: PresenceState = 'online'): Promise<void> {
  await redisClient.set(key(userId), state, 'EX', PRESENCE_TTL_SECONDS);
}

export async function refreshPresence(userId: string): Promise<void> {
  await redisClient.expire(key(userId), PRESENCE_TTL_SECONDS);
}

export async function clearPresence(userId: string): Promise<void> {
  await redisClient.del(key(userId));
}

export async function getPresence(userId: string): Promise<PresenceState | null> {
  return (await redisClient.get(key(userId))) as PresenceState | null;
}
