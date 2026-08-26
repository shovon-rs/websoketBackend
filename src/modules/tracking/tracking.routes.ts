import { Router } from 'express';
import * as trackingController from './tracking.controller';
import { requireAuth } from '../../middleware/auth.middleware';

export const trackingRouter = Router();

trackingRouter.use(requireAuth);
trackingRouter.post('/sessions', trackingController.createSession);
trackingRouter.get('/sessions/:id', trackingController.getSession);
trackingRouter.delete('/sessions/:id/locations', trackingController.deleteLocations);
