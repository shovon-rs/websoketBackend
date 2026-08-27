import { Router } from 'express';
import * as usersController from './users.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { avatarUpload } from '../../middleware/upload.middleware';

export const usersRouter = Router();

usersRouter.use(requireAuth);
usersRouter.get('/', usersController.listUsers);
usersRouter.post('/me/avatar', avatarUpload, usersController.uploadAvatar);
usersRouter.delete('/me/avatar', usersController.removeAvatar);
