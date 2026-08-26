import { z } from 'zod';

export const registerTokenSchema = z.object({
  platform: z.enum(['fcm', 'apns', 'web']),
  token: z.string().min(1),
  subscription: z.unknown().optional(),
});

export const unregisterTokenSchema = z.object({
  token: z.string().min(1),
});
