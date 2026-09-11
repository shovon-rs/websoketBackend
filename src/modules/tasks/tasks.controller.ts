import { Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import * as tasksService from './tasks.service';
import * as storageService from '../../services/storage.service';
import { dispatchNotification } from '../../services/push-dispatcher.service';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import {
  CreateTaskCommentInput,
  CreateTaskInput,
  UpdateTaskInput,
  UpdateTaskStatusInput,
} from './tasks.schemas';

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/zip': 'zip',
};

async function notifyTaskEvent(
  recipientIds: string[],
  actorId: string,
  params: { title: string; body: string; kind: string; taskId: string },
): Promise<void> {
  const targets = new Set(recipientIds);
  targets.delete(actorId);
  await Promise.all(
    [...targets].map((userId) =>
      dispatchNotification(userId, {
        type: 'info',
        title: params.title,
        body: params.body,
        data: { kind: params.kind, taskId: params.taskId },
      }),
    ),
  );
}

export async function createTask(req: Request<unknown, unknown, CreateTaskInput>, res: Response): Promise<void> {
  const task = await tasksService.createTask(req.user!, req.body);
  await notifyTaskEvent(
    task.assignees.map((a) => a.id),
    req.user!.id,
    {
      title: 'New task assigned',
      body: `${task.creator.displayName} assigned you: ${task.title}`,
      kind: 'task:assigned',
      taskId: task.id,
    },
  );
  res.status(201).json(task);
}

export async function listTasks(req: Request, res: Response): Promise<void> {
  const rawStatus = typeof req.query.status === 'string' ? req.query.status : undefined;
  const status = (['todo', 'in_progress', 'done'] as const).find((s) => s === rawStatus);
  const tasks = await tasksService.listTasks(req.user!, status);
  res.json({ tasks });
}

export async function getTask(req: Request<{ id: string }>, res: Response): Promise<void> {
  const task = await tasksService.getTask(req.user!, req.params.id);
  res.json(task);
}

export async function updateTask(req: Request<{ id: string }, unknown, UpdateTaskInput>, res: Response): Promise<void> {
  const previousAssigneeIds = req.body.assigneeIds ? await tasksService.getAssigneeIds(req.params.id) : [];
  const task = await tasksService.updateTask(req.params.id, req.body);

  if (req.body.assigneeIds) {
    const newlyAssigned = task.assignees.filter((a) => !previousAssigneeIds.includes(a.id)).map((a) => a.id);
    if (newlyAssigned.length > 0) {
      const actor = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { displayName: true } });
      await notifyTaskEvent(newlyAssigned, req.user!.id, {
        title: 'Task assigned to you',
        body: `${actor.displayName} assigned you: ${task.title}`,
        kind: 'task:assigned',
        taskId: task.id,
      });
    }
  }

  res.json(task);
}

export async function updateStatus(req: Request<{ id: string }, unknown, UpdateTaskStatusInput>, res: Response): Promise<void> {
  const task = await tasksService.updateStatus(req.user!, req.params.id, req.body.status);
  const actor = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { displayName: true } });

  await notifyTaskEvent(
    [task.creatorId, ...task.assignees.map((a) => a.id)],
    req.user!.id,
    {
      title: 'Task status updated',
      body: `${actor.displayName} moved "${task.title}" to ${req.body.status.replace('_', ' ')}`,
      kind: 'task:status-changed',
      taskId: task.id,
    },
  );

  res.json(task);
}

export async function deleteTask(req: Request<{ id: string }>, res: Response): Promise<void> {
  await tasksService.deleteTask(req.params.id);
  res.status(204).send();
}

export async function addComment(req: Request<{ id: string }, unknown, CreateTaskCommentInput>, res: Response): Promise<void> {
  const comment = await tasksService.addComment(req.user!, req.params.id, req.body.body);
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: req.params.id },
    select: { title: true, creatorId: true, assignees: { select: { userId: true } } },
  });

  await notifyTaskEvent(
    [task.creatorId, ...task.assignees.map((a) => a.userId)],
    req.user!.id,
    {
      title: 'New comment on a task',
      body: `${comment.author.displayName} commented on "${task.title}"`,
      kind: 'task:comment-new',
      taskId: req.params.id,
    },
  );

  res.status(201).json(comment);
}

export async function uploadAttachments(req: Request<{ id: string }>, res: Response): Promise<void> {
  const taskId = req.params.id;

  if (!storageService.isStorageConfigured()) {
    res.status(503).json({ error: { code: 'STORAGE_NOT_CONFIGURED', message: 'File storage is not configured on this server' } });
    return;
  }

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) {
    res.status(400).json({ error: { code: 'MISSING_FILE', message: 'No files were provided' } });
    return;
  }

  const uploaded = await Promise.all(
    files.map(async (file) => {
      const extension = EXTENSION_BY_MIME[file.mimetype] ?? 'bin';
      const key = `tasks/${taskId}/${uuid()}.${extension}`;
      await storageService.uploadObject(key, file.buffer, file.mimetype);
      return { bucket: env.S3_BUCKET, key, mimeType: file.mimetype, size: file.size, fileName: file.originalname };
    }),
  );

  const attachments = await tasksService.addAttachments(taskId, req.user!.id, uploaded);
  const withUrls = await Promise.all(
    attachments.map(async (a) => ({ ...a, url: await storageService.getDownloadUrl(a.key) })),
  );

  res.status(201).json({ attachments: withUrls });
}

export async function deleteAttachment(req: Request<{ id: string; attachmentId: string }>, res: Response): Promise<void> {
  await tasksService.deleteAttachment(req.params.id, req.params.attachmentId);
  res.status(204).send();
}
