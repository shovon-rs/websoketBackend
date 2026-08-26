import { z } from 'zod';

export const createCallSchema = z.object({
  calleeId: z.string().uuid(),
  callType: z.enum(['audio', 'video']),
});
