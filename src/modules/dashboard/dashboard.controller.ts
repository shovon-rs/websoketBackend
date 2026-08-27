import { Request, Response } from 'express';
import { connectionManager } from '../../websocket/connection.manager';
import * as dashboardService from './dashboard.service';
import * as callService from '../calling/call.service';

const SEVEN_DAYS_MS = 7 * 86_400_000;

export async function getSummary(req: Request, res: Response): Promise<void> {
  const [conversationCount, callsThisWeek] = await Promise.all([
    dashboardService.countConversations(req.user!.id),
    callService.countCallsSince(req.user!.id, new Date(Date.now() - SEVEN_DAYS_MS)),
  ]);

  res.json({
    activeConnections: [...connectionManager.all()].length,
    conversationCount,
    callsThisWeek,
    generatedAt: new Date().toISOString(),
  });
}

export async function getMessageActivity(req: Request, res: Response): Promise<void> {
  const days = await dashboardService.getMessageActivity(req.user!.id);
  res.json({ days });
}
