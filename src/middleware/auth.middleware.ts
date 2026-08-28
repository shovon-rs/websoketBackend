import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../services/auth.service';
import { prisma } from '../config/database';
import { Role, hasRole } from '../utils/roles';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing bearer token' } });
    return;
  }

  try {
    req.user = verifyAccessToken(header.slice('Bearer '.length));
    next();
  } catch {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } });
  }
}

/**
 * Re-checks the caller's role against the database rather than trusting the JWT claim.
 * The access token's role claim isn't re-verified for ordinary requests (JWT_ACCESS_EXPIRES
 * defaults to 15m), so a just-demoted admin would otherwise keep acting with elevated
 * privilege for the rest of that window. These are low-frequency, human-triggered actions,
 * so the extra single-row read is a fair price for closing that gap — don't "simplify" this
 * back to trusting req.user.role alone.
 */
export function requireRole(min: Role) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing bearer token' } });
      return;
    }

    const fresh = await prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true } });
    if (!fresh || !hasRole(fresh.role, min)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient role' } });
      return;
    }

    req.user.role = fresh.role;
    next();
  };
}
