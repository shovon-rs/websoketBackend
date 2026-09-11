import { z } from 'zod';

export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

const assigneeIds = z
  .array(z.string().min(1))
  .min(1, 'At least one assignee is required')
  .transform((ids) => [...new Set(ids)]);

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).default(''),
  assigneeIds,
  status: z.enum(TASK_STATUSES).default('todo'),
});

export const updateTaskSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    assigneeIds: assigneeIds.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' });

export const updateTaskStatusSchema = z.object({
  status: z.enum(TASK_STATUSES),
});

export const createTaskCommentSchema = z.object({
  body: z.string().min(1).max(2000),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;
export type CreateTaskCommentInput = z.infer<typeof createTaskCommentSchema>;
