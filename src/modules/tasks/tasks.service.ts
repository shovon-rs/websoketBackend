import { prisma } from '../../config/database';
import { AuthenticatedUser } from '../../types/ws';
import { hasRole } from '../../utils/roles';
import * as storageService from '../../services/storage.service';
import { CreateTaskInput, TaskStatus, UpdateTaskInput } from './tasks.schemas';

const USER_SELECT = { id: true, displayName: true, email: true } as const;

const TASK_INCLUDE = {
  creator: { select: USER_SELECT },
  assignees: { include: { user: { select: USER_SELECT } } },
  attachments: true,
  comments: {
    orderBy: { createdAt: 'asc' as const },
    include: { author: { select: USER_SELECT } },
  },
} as const;

type AttachmentLike = { key: string };
type AssigneeLike = { user: { id: string; displayName: string; email: string } };

async function withAttachmentUrls<T extends { attachments: AttachmentLike[] }>(
  task: T,
): Promise<Omit<T, 'attachments'> & { attachments: (AttachmentLike & { url: string })[] }> {
  const attachments = await Promise.all(
    task.attachments.map(async (a) => ({ ...a, url: await storageService.getDownloadUrl(a.key) })),
  );
  return { ...task, attachments };
}

/** Flattens the join-table rows into plain assignee user objects for API responses. */
function withFlatAssignees<T extends { assignees: AssigneeLike[] }>(
  task: T,
): Omit<T, 'assignees'> & { assignees: AssigneeLike['user'][] } {
  return { ...task, assignees: task.assignees.map((a) => a.user) };
}

async function getTaskOrThrow(taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { assignees: true } });
  if (!task) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
  return task;
}

/**
 * Visibility rule: manager/admin/super_admin see every task; a plain user only sees a task
 * they're one of the assignees on. This same check gates status updates and comments — anyone
 * who can see a task can move its status or comment on it, per the platform's task permission
 * model (only manager+ can create/edit/delete a task or manage its attachments — that's
 * enforced at the route level via requireRole('manager'), not here).
 */
export async function assertCanView(taskId: string, actor: AuthenticatedUser) {
  const task = await getTaskOrThrow(taskId);
  const isAssignee = task.assignees.some((a) => a.userId === actor.id);
  if (!hasRole(actor.role, 'manager') && !isAssignee) {
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
  }
  return task;
}

export async function createTask(actor: AuthenticatedUser, input: CreateTaskInput) {
  const task = await prisma.task.create({
    data: {
      title: input.title,
      description: input.description,
      status: input.status,
      creatorId: actor.id,
      assignees: { create: input.assigneeIds.map((userId) => ({ userId })) },
    },
    include: TASK_INCLUDE,
  });
  return withFlatAssignees(task);
}

export async function listTasks(actor: AuthenticatedUser, status?: TaskStatus) {
  const tasks = await prisma.task.findMany({
    where: {
      ...(hasRole(actor.role, 'manager') ? {} : { assignees: { some: { userId: actor.id } } }),
      ...(status ? { status } : {}),
    },
    include: TASK_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return Promise.all(tasks.map((t) => withAttachmentUrls(withFlatAssignees(t))));
}

export async function getTask(actor: AuthenticatedUser, taskId: string) {
  await assertCanView(taskId, actor);
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: TASK_INCLUDE });
  return withAttachmentUrls(withFlatAssignees(task));
}

/** Current assignee user ids for a task — used by the controller to diff before/after a reassignment. */
export async function getAssigneeIds(taskId: string): Promise<string[]> {
  const rows = await prisma.taskAssignee.findMany({ where: { taskId }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

export async function updateTask(taskId: string, input: UpdateTaskInput) {
  await getTaskOrThrow(taskId);
  const { assigneeIds, ...rest } = input;

  const task = await prisma.$transaction(async (tx) => {
    if (assigneeIds) {
      await tx.taskAssignee.deleteMany({ where: { taskId } });
      await tx.taskAssignee.createMany({ data: assigneeIds.map((userId) => ({ taskId, userId })) });
    }
    return tx.task.update({ where: { id: taskId }, data: rest, include: TASK_INCLUDE });
  });

  return withFlatAssignees(task);
}

export async function updateStatus(actor: AuthenticatedUser, taskId: string, status: TaskStatus) {
  await assertCanView(taskId, actor);
  const task = await prisma.task.update({ where: { id: taskId }, data: { status }, include: TASK_INCLUDE });
  return withFlatAssignees(task);
}

export async function deleteTask(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { attachments: true } });
  if (!task) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  await Promise.all(task.attachments.map((a) => storageService.deleteObject(a.key)));
  await prisma.task.delete({ where: { id: taskId } });
}

export async function addComment(actor: AuthenticatedUser, taskId: string, body: string) {
  await assertCanView(taskId, actor);
  return prisma.taskComment.create({
    data: { taskId, authorId: actor.id, body },
    include: { author: { select: USER_SELECT } },
  });
}

export async function addAttachments(
  taskId: string,
  uploaderId: string,
  files: { bucket: string; key: string; mimeType: string; size: number; fileName: string }[],
) {
  await getTaskOrThrow(taskId);
  await prisma.taskAttachment.createMany({
    data: files.map((f) => ({ taskId, uploaderId, ...f })),
  });
  return prisma.taskAttachment.findMany({ where: { taskId }, orderBy: { createdAt: 'desc' }, take: files.length });
}

export async function deleteAttachment(taskId: string, attachmentId: string): Promise<void> {
  const attachment = await prisma.taskAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.taskId !== taskId) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  await storageService.deleteObject(attachment.key);
  await prisma.taskAttachment.delete({ where: { id: attachmentId } });
}
