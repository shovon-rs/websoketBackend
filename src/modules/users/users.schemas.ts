import { z } from 'zod';
import { ROLES } from '../../utils/roles';

export const updateUserRoleSchema = z.object({
  role: z.enum(ROLES),
});

export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
