import { Router } from 'express';
import * as chatController from './chat.controller';
import { requireAuth } from '../../middleware/auth.middleware';

export const chatRouter = Router();

chatRouter.use(requireAuth);
chatRouter.get('/conversations', chatController.listConversations);
chatRouter.get('/conversations/:id/messages', chatController.getMessages);
