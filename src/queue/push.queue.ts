import { Queue, Worker, Job } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import * as pushTokenRepo from '../repositories/push-token.repository';
import { pushDispatchDuration } from '../metrics/prometheus';
import { sendFcm, sendWebPush } from '../services/push-senders.service';

const connection = { url: env.REDIS_URL };

export interface PushJobData {
  userId: string;
  payload: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
  };
}

export const pushQueue = new Queue<PushJobData>('push-dispatch', { connection });

export async function enqueuePush(data: PushJobData): Promise<void> {
  await pushQueue.add('send-push', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });
}

export function startPushWorker(): Worker<PushJobData> {
  return new Worker<PushJobData>(
    'push-dispatch',
    async (job: Job<PushJobData>) => {
      const start = Date.now();
      const { userId, payload } = job.data;
      const tokens = await pushTokenRepo.getByUser(userId);

      for (const token of tokens) {
        try {
          if (token.platform === 'fcm') await sendFcm(token.token, payload);
          if (token.platform === 'web') await sendWebPush(token.subscription, payload);
          // APNs is intentionally not wired up yet — add a sender when iOS support lands.
        } catch (err) {
          logger.error({ err, userId, platform: token.platform }, 'Push delivery failed');
        }
      }

      pushDispatchDuration.observe(Date.now() - start);
    },
    { connection },
  );
}
