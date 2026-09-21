import { z } from 'zod';

export const PROJECT_MEMBER_ROLES = ['admin', 'member'] as const;
export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLES)[number];

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).default(''),
  color: z.string().min(1).max(20).default('#2f6f4f'),
});

export const updateProjectSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    color: z.string().min(1).max(20).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' });

export const addProjectMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(PROJECT_MEMBER_ROLES).default('member'),
});

export const updateProjectMemberRoleSchema = z.object({
  role: z.enum(PROJECT_MEMBER_ROLES),
});

export const createSectionSchema = z.object({
  name: z.string().min(1).max(200),
});

export const updateSectionSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    order: z.number().int().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type AddProjectMemberInput = z.infer<typeof addProjectMemberSchema>;
export type UpdateProjectMemberRoleInput = z.infer<typeof updateProjectMemberRoleSchema>;
export type CreateSectionInput = z.infer<typeof createSectionSchema>;
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;
