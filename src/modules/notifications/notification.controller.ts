import { Request, Response } from 'express';
import * as notificationService from './notification.service';

export async function list(req: Request, res: Response): Promise<void> {
  const notifications = await notificationService.listNotifications(req.user!.id);
  res.json({ notifications });
}
