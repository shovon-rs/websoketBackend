import { Request, Response } from 'express';
import * as trackingService from './tracking.service';

export async function createSession(req: Request, res: Response): Promise<void> {
  const session = await trackingService.startSession(req.user!.id);
  res.status(201).json(session);
}

export async function getSession(req: Request, res: Response): Promise<void> {
  await trackingService.assertOwner(req.params.id, req.user!.id);
  const session = await trackingService.getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tracking session not found' } });
    return;
  }
  res.json(session);
}

export async function deleteLocations(req: Request, res: Response): Promise<void> {
  await trackingService.assertOwner(req.params.id, req.user!.id);
  await trackingService.purgeSessionLocations(req.params.id, req.user!.id);
  res.status(204).send();
}
