import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

function createRedisClient(name: string): Redis {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

  client.on('error', (err) => logger.error({ err, client: name }, 'Redis client error'));
  client.on('connect', () => logger.info({ client: name }, 'Redis client connected'));

  return client;
}

// Separate connections: a blocking subscriber cannot also issue normal commands.
export const redisClient = createRedisClient('main');
export const redisPublisher = createRedisClient('publisher');
export const redisSubscriber = createRedisClient('subscriber');
