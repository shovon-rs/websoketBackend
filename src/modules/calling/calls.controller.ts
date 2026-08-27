import { Request, Response } from 'express';
import * as callService from './call.service';
import { getIceServers } from './turn.service';
import * as storageService from '../../services/storage.service';

export async function createCall(req: Request, res: Response): Promise<void> {
  const { calleeId, callType } = req.body;
  const call = await callService.createCall({ type: callType, initiatorId: req.user!.id, calleeId });
  res.status(201).json(call);
}

export async function listCalls(req: Request, res: Response): Promise<void> {
  const calls = await callService.listCallsForUser(req.user!.id);

  const withAvatars = await Promise.all(
    calls.map(async (call) => ({
      ...call,
      participants: await Promise.all(
        call.participants.map(async (p) => ({
          ...p,
          user: { ...p.user, avatarUrl: p.user.avatarKey ? await storageService.getDownloadUrl(p.user.avatarKey) : null },
        })),
      ),
    })),
  );

  res.json({ calls: withAvatars });
}

export async function getCall(req: Request, res: Response): Promise<void> {
  await callService.assertParticipant(req.params.id, req.user!.id);
  const call = await callService.getCall(req.params.id);
  if (!call) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Call not found' } });
    return;
  }
  res.json(call);
}

export async function iceServers(_req: Request, res: Response): Promise<void> {
  res.json({ iceServers: getIceServers() });
}
