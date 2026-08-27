import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import {
  hashPassword,
  issueTokenPair,
  refreshTokenTtlMs,
  revokeRefreshToken,
  rotateRefreshToken,
  verifyPassword,
} from '../../services/auth.service';
import { LoginInput, RegisterInput } from './auth.schemas';
import { logger } from '../../utils/logger';

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/auth';

// In production the frontend (Vercel) and backend (Railway) are on different registrable
// domains — that's a cross-site request, and browsers only attach a cookie to one of those
// if it's `SameSite=None`, which in turn requires `Secure`. Locally, frontend and backend are
// both on `localhost` (same-site regardless of port), where `Lax` + non-Secure works over plain HTTP.
const isCrossSiteDeployment = env.NODE_ENV === 'production';

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isCrossSiteDeployment,
    sameSite: isCrossSiteDeployment ? 'none' : 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: refreshTokenTtlMs(),
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    path: REFRESH_COOKIE_PATH,
    secure: isCrossSiteDeployment,
    sameSite: isCrossSiteDeployment ? 'none' : 'lax',
  });
}

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

  const { accessToken, refreshToken } = await issueTokenPair({ id: user.id, email: user.email, role: user.role });
  setRefreshCookie(res, refreshToken);
  logger.info({ userId: user.id }, 'User registered');
  res.status(201).json({ user: { id: user.id, email: user.email, displayName: user.displayName }, accessToken });
}

export async function login(req: Request<unknown, unknown, LoginInput>, res: Response): Promise<void> {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    return;
  }

  const { accessToken, refreshToken } = await issueTokenPair({ id: user.id, email: user.email, role: user.role });
  setRefreshCookie(res, refreshToken);
  res.json({ user: { id: user.id, email: user.email, displayName: user.displayName }, accessToken });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const existingToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!existingToken) {
    res.status(401).json({ error: { code: 'MISSING_REFRESH_TOKEN', message: 'No refresh token cookie present' } });
    return;
  }

  try {
    const { accessToken, refreshToken } = await rotateRefreshToken(existingToken);
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken });
  } catch {
    clearRefreshCookie(res);
    res.status(401).json({ error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired' } });
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  const existingToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (existingToken) await revokeRefreshToken(existingToken);
  clearRefreshCookie(res);
  res.status(204).send();
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  res.json({ id: user.id, email: user.email, displayName: user.displayName, role: user.role });
}
