export const ROLES = ['user', 'manager', 'admin', 'super_admin'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_RANK: Record<Role, number> = { user: 0, manager: 1, admin: 2, super_admin: 3 };

export function hasRole(role: string, min: Role): boolean {
  return (ROLE_RANK[role as Role] ?? -1) >= ROLE_RANK[min];
}
