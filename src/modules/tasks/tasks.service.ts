import { prisma } from '../../config/database';
import { AuthenticatedUser } from '../../types/ws';
import { hasRole } from '../../utils/roles';
import * as storageService from '../../services/storage.service';
import * as projectsService from '../projects/projects.service';
import { CreateTaskInput, TaskStatus, UpdateTaskInput, UpdateTaskOrderInput } from './tasks.schemas';

const USER_SELECT = { id: true, displayName: true, email: true } as const;

const TASK_INCLUDE = {
  creator: { select: USER_SELECT },
  assignees: { include: { user: { select: USER_SELECT } } },
  attachments: true,
  comments: {
    orderBy: { createdAt: 'asc' as const },
    include: { author: { select: USER_SELECT } },
  },
  assignmentEvents: {
    orderBy: { createdAt: 'desc' as const },
    include: { user: { select: USER_SELECT }, actor: { select: USER_SELECT } },
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
 * Visibility rule: manager/admin/super_admin see every task; a plain user sees a task
 * they're one of the assignees on, OR — when the task belongs to a project — any task in a
 * project they're a member of (project membership grants board visibility, separate from
 * assignment, matching Asana's model). This same check gates status updates and comments —
 * anyone who can see a task can move its status or comment on it. Create/edit/delete and
 * attachment management are a stricter, separate check — see assertCanMutate below.
 */
export async function assertCanView(taskId: string, actor: AuthenticatedUser) {
  const task = await getTaskOrThrow(taskId);
  if (hasRole(actor.role, 'manager')) return task;

  if (task.projectId) {
    await projectsService.assertCanViewProject(task.projectId, actor);
    return task;
  }

  const isAssignee = task.assignees.some((a) => a.userId === actor.id);
  if (!isAssignee) {
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
  }
  return task;
}

/**
 * Mutation rule (create/edit/delete a task, manage its attachments): a task that belongs to a
 * project may be managed by that project's admins (manager+ still always allowed); a task
 * with no project (legacy/global task) requires manager+, same as before this feature existed.
 */
async function assertCanMutate(actor: AuthenticatedUser, projectId: string | null | undefined): Promise<void> {
  if (hasRole(actor.role, 'manager')) return;
  if (projectId) {
    await projectsService.assertProjectAdmin(projectId, actor);
    return;
  }
  throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
}

/** Exported for controllers that need to authorize before doing side-effecting work (e.g. an
 * upload to storage) ahead of calling the mutating service function itself. */
export async function assertCanMutateExisting(actor: AuthenticatedUser, taskId: string): Promise<{ projectId: string | null }> {
  const task = await getTaskOrThrow(taskId);
  await assertCanMutate(actor, task.projectId);
  return { projectId: task.projectId };
}

export async function createTask(actor: AuthenticatedUser, input: CreateTaskInput) {
  await assertCanMutate(actor, input.projectId ?? null);

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        title: input.title,
        description: input.description,
        status: input.status,
        creatorId: actor.id,
        projectId: input.projectId,
        sectionId: input.sectionId,
        dueDate: input.dueDate ? new Date(input.dueDate) : input.dueDate,
        startDate: input.startDate ? new Date(input.startDate) : input.startDate,
        priority: input.priority,
        assignees: { create: input.assigneeIds.map((userId) => ({ userId })) },
      },
    });
    if (input.assigneeIds.length > 0) {
      await tx.taskAssignmentEvent.createMany({
        data: input.assigneeIds.map((userId) => ({ taskId: created.id, userId, actorId: actor.id, action: 'assigned' })),
      });
    }
    return tx.task.findUniqueOrThrow({ where: { id: created.id }, include: TASK_INCLUDE });
  });
  return withFlatAssignees(task);
}

export interface ListTasksFilters {
  status?: TaskStatus;
  projectId?: string;
  from?: Date;
  to?: Date;
}

export async function listTasks(actor: AuthenticatedUser, filters: ListTasksFilters = {}) {
  const { status, projectId, from, to } = filters;

  if (projectId) {
    await projectsService.assertCanViewProject(projectId, actor);
  }

  const dueDateFilter =
    from || to
      ? { dueDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {};

  const tasks = await prisma.task.findMany({
    where: {
      // A project member can see every task on that project's board, regardless of assignment.
      // Legacy tasks with no projectId keep the exact previous behavior: manager+ see all,
      // a plain user only sees tasks they're assigned to.
      ...(projectId
        ? { projectId }
        : hasRole(actor.role, 'manager')
          ? {}
          : { assignees: { some: { userId: actor.id } } }),
      ...(status ? { status } : {}),
      ...dueDateFilter,
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

export async function updateTask(actor: AuthenticatedUser, taskId: string, input: UpdateTaskInput) {
  await assertCanMutateExisting(actor, taskId);
  const { assigneeIds, dueDate, startDate, ...rest } = input;

  const task = await prisma.$transaction(async (tx) => {
    if (assigneeIds) {
      const previous = await tx.taskAssignee.findMany({ where: { taskId }, select: { userId: true } });
      const previousIds = previous.map((a) => a.userId);
      const added = assigneeIds.filter((id) => !previousIds.includes(id));
      const removed = previousIds.filter((id) => !assigneeIds.includes(id));

      await tx.taskAssignee.deleteMany({ where: { taskId } });
      await tx.taskAssignee.createMany({ data: assigneeIds.map((userId) => ({ taskId, userId })) });

      const events = [
        ...added.map((userId) => ({ taskId, userId, actorId: actor.id, action: 'assigned' as const })),
        ...removed.map((userId) => ({ taskId, userId, actorId: actor.id, action: 'unassigned' as const })),
      ];
      if (events.length > 0) {
        await tx.taskAssignmentEvent.createMany({ data: events });
      }
    }
    return tx.task.update({
      where: { id: taskId },
      data: {
        ...rest,
        ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
        ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
      },
      include: TASK_INCLUDE,
    });
  });

  return withFlatAssignees(task);
}

export async function updateStatus(actor: AuthenticatedUser, taskId: string, status: TaskStatus) {
  await assertCanView(taskId, actor);
  const task = await prisma.task.update({ where: { id: taskId }, data: { status }, include: TASK_INCLUDE });
  return withFlatAssignees(task);
}

/**
 * Board drag-drop: moves a task into a (possibly different) section within the same project at
 * a given position. `order` is stored as-is on the moved task only — siblings are not shifted
 * or renumbered server-side; the frontend is expected to treat `order` as a sortable float/int
 * and resend a full reorder (or renumber) if it needs stable gaps.
 */
export async function updateTaskOrder(actor: AuthenticatedUser, taskId: string, input: UpdateTaskOrderInput) {
  await assertCanMutateExisting(actor, taskId);
  const task = await prisma.task.update({
    where: { id: taskId },
    data: { sectionId: input.sectionId, order: input.order },
    include: TASK_INCLUDE,
  });
  return withFlatAssignees(task);
}

export async function deleteTask(actor: AuthenticatedUser, taskId: string): Promise<void> {
  await assertCanMutateExisting(actor, taskId);
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
  actor: AuthenticatedUser,
  taskId: string,
  uploaderId: string,
  files: { bucket: string; key: string; mimeType: string; size: number; fileName: string }[],
) {
  await assertCanMutateExisting(actor, taskId);
  await prisma.taskAttachment.createMany({
    data: files.map((f) => ({ taskId, uploaderId, ...f })),
  });
  return prisma.taskAttachment.findMany({ where: { taskId }, orderBy: { createdAt: 'desc' }, take: files.length });
}

export async function deleteAttachment(actor: AuthenticatedUser, taskId: string, attachmentId: string): Promise<void> {
  await assertCanMutateExisting(actor, taskId);
  const attachment = await prisma.taskAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.taskId !== taskId) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  await storageService.deleteObject(attachment.key);
  await prisma.taskAttachment.delete({ where: { id: attachmentId } });
}
