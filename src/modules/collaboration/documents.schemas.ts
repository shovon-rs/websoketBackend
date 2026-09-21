import { z } from 'zod';

export const createDocumentSchema = z.object({
  title: z.string().min(1).max(200),
});

export const updateDocumentTitleSchema = z.object({
  title: z.string().min(1).max(200),
});

export const updateDocumentVisibilitySchema = z.object({
  visibility: z.enum(['private', 'public']),
});

export const addCollaboratorSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['editor', 'viewer']).optional().default('editor'),
});

export const updateCollaboratorRoleSchema = z.object({
  role: z.enum(['editor', 'viewer']),
});

export const createVersionSchema = z.object({
  title: z.string().min(1).max(200),
  html: z.string().max(500_000),
  state: z.string().max(2_000_000),
});

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentTitleInput = z.infer<typeof updateDocumentTitleSchema>;
export type UpdateDocumentVisibilityInput = z.infer<typeof updateDocumentVisibilitySchema>;
export type AddCollaboratorInput = z.infer<typeof addCollaboratorSchema>;
export type UpdateCollaboratorRoleInput = z.infer<typeof updateCollaboratorRoleSchema>;
export type CreateVersionInput = z.infer<typeof createVersionSchema>;
