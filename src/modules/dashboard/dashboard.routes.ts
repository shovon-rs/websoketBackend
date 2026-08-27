import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import * as dashboardController from './dashboard.controller';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);
dashboardRouter.get('/summary', dashboardController.getSummary);
dashboardRouter.get('/message-activity', dashboardController.getMessageActivity);
