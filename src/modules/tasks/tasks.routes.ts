import { Router } from 'express';
import * as tasksController from './tasks.controller';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { taskAttachmentsUpload } from '../../middleware/upload.middleware';
import {
  createTaskCommentSchema,
  createTaskSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
} from './tasks.schemas';

export const tasksRouter = Router();

tasksRouter.use(requireAuth);

tasksRouter.get('/', tasksController.listTasks);
tasksRouter.post('/', requireRole('manager'), validateBody(createTaskSchema), tasksController.createTask);
tasksRouter.get('/:id', tasksController.getTask);
tasksRouter.patch('/:id', requireRole('manager'), validateBody(updateTaskSchema), tasksController.updateTask);
tasksRouter.delete('/:id', requireRole('manager'), tasksController.deleteTask);

// Status changes and comments are visibility-scoped (tasksService.assertCanView), not
// role-gated — a plain user can act on a task they're assigned, per the platform's task
// permission model (only manager+ can create/edit a task or manage its attachments).
tasksRouter.patch('/:id/status', validateBody(updateTaskStatusSchema), tasksController.updateStatus);
tasksRouter.post('/:id/comments', validateBody(createTaskCommentSchema), tasksController.addComment);

tasksRouter.post('/:id/attachments', requireRole('manager'), taskAttachmentsUpload, tasksController.uploadAttachments);
tasksRouter.delete('/:id/attachments/:attachmentId', requireRole('manager'), tasksController.deleteAttachment);
