import { Router } from 'express';
import * as callsController from './calls.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { createCallSchema } from './calls.schemas';

export const callsRouter = Router();

callsRouter.use(requireAuth);
callsRouter.get('/ice-servers', callsController.iceServers);
callsRouter.post('/', validateBody(createCallSchema), callsController.createCall);
callsRouter.get('/:id', callsController.getCall);
