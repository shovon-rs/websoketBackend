import 'express-async-errors';
import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import { env } from './config/env';
import { logger } from './utils/logger';
import { apiRouter } from './routes';
import { restRateLimiter } from './middleware/rate-limit.middleware';
import { metricsMiddleware } from './middleware/metrics.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { registry } from './metrics/prometheus';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger }));
  app.use(metricsMiddleware);
  app.use(restRateLimiter);

  app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

  app.get(env.METRICS_PATH, async (_req, res) => {
    res.set('Content-Type', registry.contentType);
    res.send(await registry.metrics());
  });

  if (env.NODE_ENV !== 'production') {
    try {
      const spec = YAML.load(path.join(__dirname, '..', 'docs', 'openapi.yaml'));
      app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec));
    } catch (err) {
      logger.warn({ err }, 'OpenAPI spec not loaded — /api/docs disabled');
    }
  }

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
