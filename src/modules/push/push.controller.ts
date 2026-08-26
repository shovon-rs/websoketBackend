import { Request, Response } from 'express';
import * as pushTokenRepo from '../../repositories/push-token.repository';

export async function registerToken(req: Request, res: Response): Promise<void> {
  const { platform, token, subscription } = req.body;
  await pushTokenRepo.upsertToken({ userId: req.user!.id, platform, token, subscription });
  res.status(201).json({ ok: true });
}

export async function unregisterToken(req: Request, res: Response): Promise<void> {
  await pushTokenRepo.deleteToken(req.user!.id, req.body.token);
  res.status(204).send();
}
