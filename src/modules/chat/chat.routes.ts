import { Router } from 'express';
import * as chatController from './chat.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { attachmentUpload } from '../../middleware/upload.middleware';
import { createConversationSchema } from './chat.schemas';

export const chatRouter = Router();

chatRouter.use(requireAuth);
chatRouter.get('/conversations', chatController.listConversations);
chatRouter.post('/conversations', validateBody(createConversationSchema), chatController.createConversation);
chatRouter.get('/conversations/:id/messages', chatController.getMessages);
chatRouter.post('/conversations/:id/attachments', attachmentUpload, chatController.uploadAttachment);
