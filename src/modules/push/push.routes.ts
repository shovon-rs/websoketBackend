import { Router } from 'express';
import * as pushController from './push.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { registerTokenSchema, unregisterTokenSchema } from './push.schemas';

export const pushRouter = Router();

pushRouter.use(requireAuth);
pushRouter.post('/register', validateBody(registerTokenSchema), pushController.registerToken);
pushRouter.delete('/register', validateBody(unregisterTokenSchema), pushController.unregisterToken);
