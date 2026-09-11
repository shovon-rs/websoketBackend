import { z } from 'zod';

export const createConversationSchema = z.object({
  memberIds: z.array(z.string().uuid()).min(1).max(50),
  type: z.enum(['direct', 'group']).default('direct'),
  name: z.string().min(1).max(120).optional(),
});

export const updateConversationSchema = z.object({
  name: z.string().min(1).max(120),
});

export const addMembersSchema = z.object({
  memberIds: z.array(z.string().uuid()).min(1).max(50),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
export type AddMembersInput = z.infer<typeof addMembersSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
