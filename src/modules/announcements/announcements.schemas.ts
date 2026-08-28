import { z } from 'zod';

export const createAnnouncementSchema = z
  .object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(2000),
    audience: z.enum(['everyone', 'invited']),
    inviteUserIds: z.array(z.string().uuid()).max(500).optional(),
  })
  .refine((data) => data.audience !== 'invited' || (data.inviteUserIds && data.inviteUserIds.length > 0), {
    message: 'inviteUserIds is required and non-empty when audience is "invited"',
    path: ['inviteUserIds'],
  });

export const submitLiveStreamRequestSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  proposedAt: z.string().datetime().optional(),
});

export const approveLiveStreamRequestSchema = z.object({
  scheduledAt: z.string().datetime(),
});

export const rejectLiveStreamRequestSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type SubmitLiveStreamRequestInput = z.infer<typeof submitLiveStreamRequestSchema>;
export type ApproveLiveStreamRequestInput = z.infer<typeof approveLiveStreamRequestSchema>;
export type RejectLiveStreamRequestInput = z.infer<typeof rejectLiveStreamRequestSchema>;
