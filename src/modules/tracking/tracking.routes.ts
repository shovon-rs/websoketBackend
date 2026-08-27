import { Router } from 'express';
import * as trackingController from './tracking.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { addViewerSchema } from './tracking.schemas';

export const trackingRouter = Router();

trackingRouter.use(requireAuth);
trackingRouter.get('/sessions', trackingController.listSessions);
trackingRouter.post('/sessions', trackingController.createSession);
trackingRouter.get('/sessions/:id', trackingController.getSession);
trackingRouter.delete('/sessions/:id/locations', trackingController.deleteLocations);
trackingRouter.post('/sessions/:id/viewers', validateBody(addViewerSchema), trackingController.addViewer);
trackingRouter.delete('/sessions/:id/viewers/:userId', trackingController.removeViewer);
