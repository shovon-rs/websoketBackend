import { Request, Response } from 'express';
import * as livestreamRequestsService from './livestream-requests.service';
import {
  ApproveLiveStreamRequestInput,
  RejectLiveStreamRequestInput,
  SubmitLiveStreamRequestInput,
} from './announcements.schemas';

export async function submit(req: Request<unknown, unknown, SubmitLiveStreamRequestInput>, res: Response): Promise<void> {
  const request = await livestreamRequestsService.submitRequest(req.user!.id, req.body);
  res.status(201).json(request);
}

export async function listPending(req: Request, res: Response): Promise<void> {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const requests = await livestreamRequestsService.listPending(status);
  res.json({ requests });
}

export async function listMine(req: Request, res: Response): Promise<void> {
  const requests = await livestreamRequestsService.listMine(req.user!.id);
  res.json({ requests });
}

export async function approve(req: Request<{ id: string }, unknown, ApproveLiveStreamRequestInput>, res: Response): Promise<void> {
  const request = await livestreamRequestsService.approveRequest(req.user!.id, req.params.id, req.body);
  res.json(request);
}

export async function reject(req: Request<{ id: string }, unknown, RejectLiveStreamRequestInput>, res: Response): Promise<void> {
  const request = await livestreamRequestsService.rejectRequest(req.user!.id, req.params.id, req.body);
  res.json(request);
}
