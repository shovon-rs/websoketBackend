import { Request, Response } from 'express';
import * as chatService from './chat.service';

export async function listConversations(req: Request, res: Response): Promise<void> {
  const conversations = await chatService.listConversations(req.user!.id);
  res.json({ conversations });
}

export async function getMessages(req: Request, res: Response): Promise<void> {
  await chatService.assertMember(req.params.id, req.user!.id).catch(() => {
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
  });

  const after = typeof req.query.after === 'string' ? req.query.after : undefined;
  const messages = await chatService.getMessagesAfter(req.params.id, after);
  res.json({ messages });
}
