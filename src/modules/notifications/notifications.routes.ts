import { Router } from 'express';
import * as notificationController from './notification.controller';
import { requireAuth } from '../../middleware/auth.middleware';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);
notificationsRouter.get('/', notificationController.list);
