import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { connectionManager } from '../../websocket/connection.manager';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get('/summary', (_req, res) => {
  res.json({
    activeConnections: [...connectionManager.all()].length,
    generatedAt: new Date().toISOString(),
  });
});
