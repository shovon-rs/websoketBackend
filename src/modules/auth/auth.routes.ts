import { Router } from 'express';
import * as authController from './auth.controller';
import { validateBody } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { authRateLimiter } from '../../middleware/rate-limit.middleware';
import { changePasswordSchema, loginSchema, registerSchema, updateProfileSchema } from './auth.schemas';

export const authRouter = Router();

authRouter.post('/register', authRateLimiter, validateBody(registerSchema), authController.register);
authRouter.post('/login', authRateLimiter, validateBody(loginSchema), authController.login);
authRouter.post('/refresh', authRateLimiter, authController.refresh);
authRouter.post('/logout', authController.logout);
authRouter.get('/me', requireAuth, authController.me);
authRouter.patch('/me', requireAuth, validateBody(updateProfileSchema), authController.updateMe);
authRouter.post(
  '/change-password',
  requireAuth,
  authRateLimiter,
  validateBody(changePasswordSchema),
  authController.changePassword,
);
