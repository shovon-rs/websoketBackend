import { prisma } from '../config/database';
import { Role, hasRole } from '../utils/roles';
import { ConnectionRecord } from './connection.manager';

/**
 * WS equivalent of requireRole — handlers can't use Express middleware, so this is called
 * at the top of a handler body and throws on failure (mirrors callService.assertParticipant).
 * Re-checks the database rather than the connection's cached role for the same reason
 * requireRole does (see auth.middleware.ts).
 */
export async function assertRole(conn: ConnectionRecord, min: Role): Promise<void> {
  const fresh = await prisma.user.findUnique({ where: { id: conn.userId }, select: { role: true } });
  if (!fresh || !hasRole(fresh.role, min)) throw new Error('FORBIDDEN');
}
