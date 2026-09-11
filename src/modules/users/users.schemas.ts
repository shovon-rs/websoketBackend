import { z } from 'zod';
import { ROLES } from '../../utils/roles';
import { strongPasswordSchema } from '../../utils/password';

export const updateUserRoleSchema = z.object({
  role: z.enum(ROLES),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: strongPasswordSchema,
  displayName: z.string().min(1).max(80),
  role: z.enum(ROLES).default('user'),
});

export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
