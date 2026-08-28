import { Router } from 'express';
import * as announcementsController from './announcements.controller';
import * as livestreamRequestsController from './livestream-requests.controller';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import {
  approveLiveStreamRequestSchema,
  createAnnouncementSchema,
  rejectLiveStreamRequestSchema,
  submitLiveStreamRequestSchema,
} from './announcements.schemas';

export const announcementsRouter = Router();

announcementsRouter.use(requireAuth);

// Live-stream requests — registered before the /:id routes below so "requests" isn't
// swallowed as an :id param.
announcementsRouter.post('/requests', validateBody(submitLiveStreamRequestSchema), livestreamRequestsController.submit);
announcementsRouter.get('/requests', requireRole('super_admin'), livestreamRequestsController.listPending);
announcementsRouter.get('/requests/mine', livestreamRequestsController.listMine);
announcementsRouter.post(
  '/requests/:id/approve',
  requireRole('super_admin'),
  validateBody(approveLiveStreamRequestSchema),
  livestreamRequestsController.approve,
);
announcementsRouter.post(
  '/requests/:id/reject',
  requireRole('super_admin'),
  validateBody(rejectLiveStreamRequestSchema),
  livestreamRequestsController.reject,
);

announcementsRouter.post('/', requireRole('super_admin'), validateBody(createAnnouncementSchema), announcementsController.create);
announcementsRouter.get('/', announcementsController.list);
announcementsRouter.get('/upcoming', announcementsController.upcoming);
announcementsRouter.get('/:id', announcementsController.get);
announcementsRouter.patch('/:id/cancel', requireRole('super_admin'), announcementsController.cancel);
