import { Request, Response } from 'express';
import * as trackingService from './tracking.service';
import { dispatchNotification } from '../../services/push-dispatcher.service';
import { prisma } from '../../config/database';

export async function createSession(req: Request, res: Response): Promise<void> {
  const session = await trackingService.startSession(req.user!.id);
  res.status(201).json(session);
}

export async function listSessions(req: Request, res: Response): Promise<void> {
  const [owned, shared] = await Promise.all([
    trackingService.listOwnedActiveSessions(req.user!.id),
    trackingService.listSharedActiveSessions(req.user!.id),
  ]);
  res.json({ owned, shared });
}

export async function getSession(req: Request, res: Response): Promise<void> {
  await trackingService.assertCanView(req.params.id, req.user!.id);
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

export async function addViewer(req: Request, res: Response): Promise<void> {
  const viewer = await trackingService.addViewer(req.params.id, req.user!.id, req.body.userId);
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { displayName: true } });

  await dispatchNotification(viewer.id, {
    type: 'info',
    title: 'Live location shared',
    body: `${owner.displayName} is sharing their live location with you`,
    data: { kind: 'tracking:shared', sessionId: req.params.id },
  });

  res.status(201).json(viewer);
}

export async function removeViewer(req: Request, res: Response): Promise<void> {
  await trackingService.removeViewer(req.params.id, req.user!.id, req.params.userId);
  res.status(204).send();
}
