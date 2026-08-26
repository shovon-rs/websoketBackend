import { createServer } from 'http';
import { createApp } from './app';
import { attachWebSocketServer } from './websocket/websocket.server';
import { startPushWorker } from './queue/push.queue';
import { startLocationRetentionJob } from './jobs/location-retention.job';
import { startDashboardMetricsJob } from './jobs/dashboard-metrics.job';
import { env } from './config/env';
import { logger } from './utils/logger';
import { prisma } from './config/database';
import { redisClient, redisPublisher, redisSubscriber } from './config/redis';

const app = createApp();
const httpServer = createServer(app);

attachWebSocketServer(httpServer);
const pushWorker = startPushWorker();
const retentionTimer = startLocationRetentionJob();
const dashboardMetricsTimer = startDashboardMetricsJob();

httpServer.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server listening');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down gracefully');

  clearInterval(retentionTimer);
  clearInterval(dashboardMetricsTimer);
  httpServer.close();

  await Promise.allSettled([
    pushWorker.close(),
    prisma.$disconnect(),
    redisClient.quit(),
    redisPublisher.quit(),
    redisSubscriber.quit(),
  ]);

  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
