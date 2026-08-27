import { redisClient } from '../config/redis';

const PRESENCE_TTL_SECONDS = 60;
// Slightly longer than the heartbeat interval (25s) so a brief gap between beats doesn't
// let this key lapse and reset the "online since" timestamp.
const ONLINE_SINCE_TTL_SECONDS = 90;

const key = (userId: string) => `presence:${userId}`;
const onlineSinceKey = (userId: string) => `presence:online-since:${userId}`;

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

/** Stamps "online since now" only the first time — NX means a second call while still
 *  online leaves the original timestamp untouched. */
export async function markOnlineSince(userId: string): Promise<void> {
  await redisClient.set(onlineSinceKey(userId), new Date().toISOString(), 'EX', ONLINE_SINCE_TTL_SECONDS, 'NX');
}

export async function refreshOnlineSince(userId: string): Promise<void> {
  await redisClient.expire(onlineSinceKey(userId), ONLINE_SINCE_TTL_SECONDS);
}

export async function clearOnlineSince(userId: string): Promise<void> {
  await redisClient.del(onlineSinceKey(userId));
}

export async function getOnlineSince(userId: string): Promise<string | null> {
  return redisClient.get(onlineSinceKey(userId));
}
