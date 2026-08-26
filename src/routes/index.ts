import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { chatRouter } from '../modules/chat/chat.routes';
import { notificationsRouter } from '../modules/notifications/notifications.routes';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes';
import { trackingRouter } from '../modules/tracking/tracking.routes';
import { callsRouter } from '../modules/calling/calls.routes';
import { pushRouter } from '../modules/push/push.routes';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/', chatRouter); // exposes /conversations, /conversations/:id/messages
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/tracking', trackingRouter);
apiRouter.use('/calls', callsRouter);
apiRouter.use('/push', pushRouter);
