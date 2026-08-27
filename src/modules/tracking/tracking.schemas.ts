import { z } from 'zod';

export const addViewerSchema = z.object({
  userId: z.string().uuid(),
});
