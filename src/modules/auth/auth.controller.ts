import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import {
  hashPassword,
  issueTokenPair,
  revokeRefreshToken,
  rotateRefreshToken,
  verifyPassword,
} from '../../services/auth.service';
import { LoginInput, RegisterInput } from './auth.schemas';
import { logger } from '../../utils/logger';

export async function register(req: Request<unknown, unknown, RegisterInput>, res: Response): Promise<void> {
  const { email, password, displayName } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'Email is already registered' } });
    return;
  }

  const user = await prisma.user.create({
    data: { email, displayName, passwordHash: await hashPassword(password) },
  });

  const tokens = await issueTokenPair({ id: user.id, email: user.email, role: user.role });
  logger.info({ userId: user.id }, 'User registered');
  res.status(201).json({ user: { id: user.id, email: user.email, displayName: user.displayName }, ...tokens });
}

export async function login(req: Request<unknown, unknown, LoginInput>, res: Response): Promise<void> {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    return;
  }

  const tokens = await issueTokenPair({ id: user.id, email: user.email, role: user.role });
  res.json({ user: { id: user.id, email: user.email, displayName: user.displayName }, ...tokens });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const tokens = await rotateRefreshToken(req.body.refreshToken);
    res.json(tokens);
  } catch {
    res.status(401).json({ error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired' } });
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  await revokeRefreshToken(req.body.refreshToken);
  res.status(204).send();
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  res.json({ id: user.id, email: user.email, displayName: user.displayName, role: user.role });
}
