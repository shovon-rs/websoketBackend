import { Request, Response } from 'express';
import { prisma } from '../../config/database';

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
