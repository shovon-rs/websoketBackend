import { Router } from 'express';
import * as usersController from './users.controller';
import { requireAuth } from '../../middleware/auth.middleware';

export const usersRouter = Router();

usersRouter.use(requireAuth);
usersRouter.get('/', usersController.listUsers);
