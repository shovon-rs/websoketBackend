import { z } from 'zod';
import { strongPasswordSchema } from '../../utils/password';

export const registerSchema = z.object({
  email: z.string().email(),
  password: strongPasswordSchema,
  displayName: z.string().min(1).max(80),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(80),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: strongPasswordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
