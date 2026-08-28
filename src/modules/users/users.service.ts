import { prisma } from '../../config/database';
import { AuthenticatedUser } from '../../types/ws';
import { Role, hasRole } from '../../utils/roles';

export async function listAllUsers(search?: string) {
  return prisma.user.findMany({
    where: search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { displayName: { contains: search, mode: 'insensitive' } },
          ],
        }
      : undefined,
    select: { id: true, email: true, displayName: true, role: true, createdAt: true, lastSeenAt: true },
    orderBy: { displayName: 'asc' },
  });
}

/**
 * Escalation rule: only a super_admin may grant/revoke super_admin. An admin may move a
 * user between user <-> admin only, and may never act on an existing super_admin (prevents
 * a compromised admin account from escalating itself or defanging the one role that could
 * stop it). Nobody may change their own role, to avoid accidental self-lockout.
 */
export async function updateUserRole(actor: AuthenticatedUser, targetUserId: string, newRole: Role) {
  if (targetUserId === actor.id) {
    throw Object.assign(new Error('CANNOT_CHANGE_OWN_ROLE'), { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, role: true } });
  if (!target) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const actorIsSuperAdmin = hasRole(actor.role, 'super_admin');
  const touchesSuperAdmin = target.role === 'super_admin' || newRole === 'super_admin';
  if (touchesSuperAdmin && !actorIsSuperAdmin) {
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
  }

  return prisma.user.update({
    where: { id: targetUserId },
    data: { role: newRole },
    select: { id: true, email: true, displayName: true, role: true, createdAt: true, lastSeenAt: true },
  });
}
