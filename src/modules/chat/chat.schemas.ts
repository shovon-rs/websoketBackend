import { z } from 'zod';

export const createConversationSchema = z.object({
  memberIds: z.array(z.string().uuid()).min(1).max(50),
  type: z.enum(['direct', 'group']).default('direct'),
  name: z.string().min(1).max(120).optional(),
});
