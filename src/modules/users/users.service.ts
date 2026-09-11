import { prisma } from '../../config/database';
import { AuthenticatedUser } from '../../types/ws';
import { Role, hasRole } from '../../utils/roles';
import { hashPassword } from '../../services/auth.service';
import { CreateUserInput } from './users.schemas';

const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  createdAt: true,
  lastSeenAt: true,
  mustChangePassword: true,
} as const;

export async function listAllUsers(search?: string) {
  return prisma.user.findMany({
    where: {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { displayName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: ADMIN_USER_SELECT,
    orderBy: { displayName: 'asc' },
  });
}

/**
 * Escalation rule: only a super_admin may grant/revoke super_admin, or act on an existing
 * super_admin at all (prevents a compromised admin/manager account from escalating itself or
 * defanging the one role that could stop it). Below that ceiling, admin can freely move users
 * between user/manager/admin — manager is not a security boundary, just a rank.
 */
function assertRoleAssignmentAllowed(actorRole: string, newRole: Role, currentTargetRole?: string): void {
  const actorIsSuperAdmin = hasRole(actorRole, 'super_admin');
  const touchesSuperAdmin = currentTargetRole === 'super_admin' || newRole === 'super_admin';
  if (touchesSuperAdmin && !actorIsSuperAdmin) {
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
  }
}

export async function updateUserRole(actor: AuthenticatedUser, targetUserId: string, newRole: Role) {
  if (targetUserId === actor.id) {
    throw Object.assign(new Error('CANNOT_CHANGE_OWN_ROLE'), { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, role: true, deletedAt: true } });
  if (!target || target.deletedAt) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  assertRoleAssignmentAllowed(actor.role, newRole, target.role);

  return prisma.user.update({
    where: { id: targetUserId },
    data: { role: newRole },
    select: ADMIN_USER_SELECT,
  });
}

/**
 * Lets an admin/super_admin provision an account directly with a temporary password —
 * `mustChangePassword` is always set so the client forces the recipient to pick their own
 * password on first login rather than keep using one an administrator saw in plaintext.
 */
export async function createUser(actor: AuthenticatedUser, input: CreateUserInput) {
  assertRoleAssignmentAllowed(actor.role, input.role);

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw Object.assign(new Error('EMAIL_TAKEN'), { status: 409 });

  return prisma.user.create({
    data: {
      email: input.email,
      displayName: input.displayName,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      mustChangePassword: true,
    },
    select: ADMIN_USER_SELECT,
  });
}

/**
 * Soft-delete only: a hard delete would hit FK constraints on every table that restricts
 * deletion of its User relation (messages, calls, document versions, announcements, ...) and,
 * worse, would silently wipe those rows' authorship for other users' shared history. Disabling
 * the account (block login, revoke refresh tokens, hide from rosters) gets the same practical
 * outcome — the account can no longer be used — without destroying anyone else's data.
 */
export async function deleteUser(actor: AuthenticatedUser, targetUserId: string): Promise<void> {
  if (targetUserId === actor.id) {
    throw Object.assign(new Error('CANNOT_DELETE_SELF'), { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, role: true, deletedAt: true } });
  if (!target || target.deletedAt) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  if (target.role === 'super_admin') {
    throw Object.assign(new Error('CANNOT_DELETE_SUPER_ADMIN'), { status: 403 });
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: targetUserId }, data: { deletedAt: new Date() } }),
    prisma.refreshToken.updateMany({ where: { userId: targetUserId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}
