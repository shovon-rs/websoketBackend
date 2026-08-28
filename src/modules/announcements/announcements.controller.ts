import { Request, Response } from 'express';
import * as announcementsService from './announcements.service';
import { CreateAnnouncementInput } from './announcements.schemas';

export async function create(req: Request<unknown, unknown, CreateAnnouncementInput>, res: Response): Promise<void> {
  const announcement = await announcementsService.createAnnouncement(req.user!.id, req.body);
  res.status(201).json(announcement);
}

export async function list(req: Request, res: Response): Promise<void> {
  const announcements = await announcementsService.listVisibleAnnouncements(req.user!.id, req.user!.role);
  res.json({ announcements });
}

export async function upcoming(req: Request, res: Response): Promise<void> {
  const announcement = await announcementsService.getUpcomingAnnouncement(req.user!.id, req.user!.role);
  res.json(announcement);
}

export async function get(req: Request, res: Response): Promise<void> {
  const announcement = await announcementsService.getAnnouncement(req.params.id, req.user!.id, req.user!.role);
  res.json(announcement);
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const announcement = await announcementsService.cancelAnnouncement(req.params.id);
  res.json(announcement);
}
