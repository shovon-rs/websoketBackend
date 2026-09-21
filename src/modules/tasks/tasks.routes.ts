import { Router } from 'express';
import * as tasksController from './tasks.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { taskAttachmentsUpload } from '../../middleware/upload.middleware';
import {
  createTaskCommentSchema,
  createTaskSchema,
  updateTaskOrderSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
} from './tasks.schemas';

export const tasksRouter = Router();

tasksRouter.use(requireAuth);

// Create/edit/delete and attachment management used to be gated at the route level via
// requireRole('manager'). That's now enforced in the service layer instead
// (tasksService.assertCanMutate*): manager+ can still manage any task, and a task that
// belongs to a project can also be managed by that project's admins — a plain global 'user'
// role who is a project admin should be able to run their own project's board. A task with no
// projectId (legacy/global task) still requires manager+, same as before.
tasksRouter.get('/', tasksController.listTasks);
tasksRouter.post('/', validateBody(createTaskSchema), tasksController.createTask);
tasksRouter.get('/:id', tasksController.getTask);
tasksRouter.patch('/:id', validateBody(updateTaskSchema), tasksController.updateTask);
tasksRouter.delete('/:id', tasksController.deleteTask);

// Status changes, ordering, and comments are visibility-scoped (tasksService.assertCanView) or
// mutation-scoped (tasksService.assertCanMutate*), not blanket role-gated — see the note above.
tasksRouter.patch('/:id/status', validateBody(updateTaskStatusSchema), tasksController.updateStatus);
tasksRouter.patch('/:id/order', validateBody(updateTaskOrderSchema), tasksController.updateTaskOrder);
tasksRouter.post('/:id/comments', validateBody(createTaskCommentSchema), tasksController.addComment);

tasksRouter.post('/:id/attachments', taskAttachmentsUpload, tasksController.uploadAttachments);
tasksRouter.delete('/:id/attachments/:attachmentId', tasksController.deleteAttachment);
