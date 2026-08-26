import { redisClient } from '../config/redis';

/**
 * Sliding-window rate limit backed by a Redis sorted set.
 * Returns true if the action is allowed, false if the limit was exceeded.
 */
export async function checkWsRateLimit(
  userId: string,
  eventType: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const key = `ratelimit:ws:${userId}:${eventType}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  const pipeline = redisClient.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now, `${now}-${Math.random()}`);
  pipeline.zcard(key);
  pipeline.pexpire(key, windowMs);

  const results = await pipeline.exec();
  const count = (results?.[2]?.[1] as number) ?? 0;

  return count <= limit;
}
