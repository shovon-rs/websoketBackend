import { Router } from 'express';
import * as usersController from './users.controller';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { avatarUpload } from '../../middleware/upload.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { updateUserRoleSchema } from './users.schemas';

export const usersRouter = Router();

usersRouter.use(requireAuth);
usersRouter.get('/', usersController.listUsers);
usersRouter.get('/presence', usersController.listPresence);
usersRouter.post('/me/avatar', avatarUpload, usersController.uploadAvatar);
usersRouter.delete('/me/avatar', usersController.removeAvatar);

// Deliberately a separate path from GET / above: that route is the capped, self-excluding,
// no-role picker used by UserSearchDropdown and must not change shape or gating.
usersRouter.get('/admin', requireRole('admin'), usersController.listAllUsersForAdmin);
usersRouter.patch('/:id/role', requireRole('admin'), validateBody(updateUserRoleSchema), usersController.updateUserRole);
