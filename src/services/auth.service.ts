import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { AuthenticatedUser } from '../types/ws';

const SALT_ROUNDS = 12;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAccessToken(user: AuthenticatedUser): string {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AuthenticatedUser {
  const decoded = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
  return { id: decoded.sub as string, email: decoded.email, role: decoded.role };
}

export function refreshTokenTtlMs(): number {
  const match = env.JWT_REFRESH_EXPIRES.match(/^(\d+)([dhm])$/);
  const amount = match ? Number(match[1]) : 7;
  const unit = match ? match[2] : 'd';
  const msPerUnit = unit === 'd' ? 86_400_000 : unit === 'h' ? 3_600_000 : 60_000;
  return amount * msPerUnit;
}

function refreshExpiryDate(): Date {
  return new Date(Date.now() + refreshTokenTtlMs());
}

export async function issueTokenPair(user: AuthenticatedUser): Promise<TokenPair> {
  const accessToken = signAccessToken(user);
  const refreshToken = uuid();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: refreshToken,
      expiresAt: refreshExpiryDate(),
    },
  });

  return { accessToken, refreshToken };
}

export async function rotateRefreshToken(oldToken: string): Promise<TokenPair> {
  const record = await prisma.refreshToken.findUnique({ where: { token: oldToken } });

  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new Error('INVALID_REFRESH_TOKEN');
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: record.userId } });

  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });

  return issueTokenPair({ id: user.id, email: user.email, role: user.role });
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { token, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
