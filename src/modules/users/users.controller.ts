import { Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { prisma } from '../../config/database';
import * as storageService from '../../services/storage.service';

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export async function listUsers(req: Request, res: Response): Promise<void> {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;

  const users = await prisma.user.findMany({
    where: {
      id: { not: req.user!.id },
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { displayName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: { id: true, displayName: true, email: true },
    take: 20,
    orderBy: { displayName: 'asc' },
  });

  res.json({ users });
}

export async function uploadAvatar(req: Request, res: Response): Promise<void> {
  if (!storageService.isStorageConfigured()) {
    res.status(503).json({ error: { code: 'STORAGE_NOT_CONFIGURED', message: 'File storage is not configured on this server' } });
    return;
  }

  const file = req.file;
  if (!file) {
    res.status(400).json({ error: { code: 'MISSING_FILE', message: 'No image file was provided' } });
    return;
  }

  const userId = req.user!.id;
  const existing = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarKey: true } });

  const extension = EXTENSION_BY_MIME[file.mimetype] ?? 'jpg';
  const key = `avatars/${userId}/${uuid()}.${extension}`;

  await storageService.uploadObject(key, file.buffer, file.mimetype);
  await prisma.user.update({ where: { id: userId }, data: { avatarKey: key } });

  if (existing.avatarKey) await storageService.deleteObject(existing.avatarKey);

  const avatarUrl = await storageService.getDownloadUrl(key);
  res.status(201).json({ avatarUrl });
}

export async function removeAvatar(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const existing = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarKey: true } });

  if (existing.avatarKey) {
    await storageService.deleteObject(existing.avatarKey);
    await prisma.user.update({ where: { id: userId }, data: { avatarKey: null } });
  }

  res.status(204).send();
}
