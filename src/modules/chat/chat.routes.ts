import { Router } from 'express';
import * as chatController from './chat.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { attachmentUpload } from '../../middleware/upload.middleware';
import { addMembersSchema, createConversationSchema, updateConversationSchema, updateMemberRoleSchema } from './chat.schemas';

export const chatRouter = Router();

chatRouter.use(requireAuth);
chatRouter.get('/conversations', chatController.listConversations);
chatRouter.post('/conversations', validateBody(createConversationSchema), chatController.createConversation);
chatRouter.get('/conversations/:id', chatController.getConversation);
chatRouter.patch('/conversations/:id', validateBody(updateConversationSchema), chatController.updateConversation);
chatRouter.post('/conversations/:id/members', validateBody(addMembersSchema), chatController.addMembers);
chatRouter.delete('/conversations/:id/members/:userId', chatController.removeMember);
chatRouter.patch('/conversations/:id/members/:userId/role', validateBody(updateMemberRoleSchema), chatController.updateMemberRole);
chatRouter.get('/conversations/:id/messages', chatController.getMessages);
chatRouter.post('/conversations/:id/attachments', attachmentUpload, chatController.uploadAttachment);
