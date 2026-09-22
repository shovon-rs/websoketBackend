import { z } from 'zod';

export const TASK_STATUSES = ['new', 'in_progress', 'ready_for_qa', 'testing', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

const assigneeIds = z
  .array(z.string().min(1))
  .min(1, 'At least one assignee is required')
  .transform((ids) => [...new Set(ids)]);

const nullableDateTime = z
  .string()
  .datetime()
  .nullable();

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).default(''),
  assigneeIds,
  status: z.enum(TASK_STATUSES).default('new'),
  projectId: z.string().min(1).optional(),
  sectionId: z.string().min(1).optional(),
  dueDate: nullableDateTime.optional(),
  startDate: nullableDateTime.optional(),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
});

export const updateTaskSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    assigneeIds: assigneeIds.optional(),
    projectId: z.string().min(1).nullable().optional(),
    sectionId: z.string().min(1).nullable().optional(),
    dueDate: nullableDateTime.optional(),
    startDate: nullableDateTime.optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' });

export const updateTaskStatusSchema = z.object({
  status: z.enum(TASK_STATUSES),
});

export const updateTaskOrderSchema = z.object({
  sectionId: z.string().min(1),
  order: z.number().int(),
});

export const createTaskCommentSchema = z.object({
  body: z.string().min(1).max(2000),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;
export type UpdateTaskOrderInput = z.infer<typeof updateTaskOrderSchema>;
export type CreateTaskCommentInput = z.infer<typeof createTaskCommentSchema>;
