import { z } from 'zod';

export const createDocumentSchema = z.object({
  title: z.string().min(1).max(200),
});
