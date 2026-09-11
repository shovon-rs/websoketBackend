import { Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import * as chatService from './chat.service';
import * as storageService from '../../services/storage.service';
import { dispatchNotification } from '../../services/push-dispatcher.service';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { AddMembersInput, UpdateConversationInput, UpdateMemberRoleInput } from './chat.schemas';

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/zip': 'zip',
};

export async function listConversations(req: Request, res: Response): Promise<void> {
  const conversations = await chatService.listConversations(req.user!.id);
  res.json({ conversations });
}

export async function createConversation(req: Request, res: Response): Promise<void> {
  const { memberIds, type, name } = req.body;
  const conversation = await chatService.createConversation({
    creatorId: req.user!.id,
    memberIds,
    type,
    name,
  });
  res.status(201).json(conversation);
}

export async function getConversation(req: Request<{ id: string }>, res: Response): Promise<void> {
  await chatService.assertMember(req.params.id, req.user!.id);
  const conversation = await chatService.getConversation(req.params.id);
  if (!conversation) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    return;
  }
  res.json(conversation);
}

export async function updateConversation(
  req: Request<{ id: string }, unknown, UpdateConversationInput>,
  res: Response,
): Promise<void> {
  await chatService.assertAdmin(req.params.id, req.user!.id);
  const conversation = await chatService.renameConversation(req.params.id, req.body.name);
  res.json(conversation);
}

export async function addMembers(req: Request<{ id: string }, unknown, AddMembersInput>, res: Response): Promise<void> {
  await chatService.assertAdmin(req.params.id, req.user!.id);

  const before = await chatService.getConversation(req.params.id);
  const existingIds = new Set(before?.members.map((m) => m.userId) ?? []);

  const conversation = await chatService.addMembers(req.params.id, req.body.memberIds);
  const newlyAdded = conversation!.members.filter((m) => !existingIds.has(m.userId));

  if (newlyAdded.length > 0) {
    const actor = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { displayName: true } });
    await Promise.all(
      newlyAdded.map((m) =>
        dispatchNotification(m.userId, {
          type: 'info',
          title: 'Added to a group',
          body: `${actor.displayName} added you to "${conversation!.name}"`,
          data: { conversationId: conversation!.id },
        }),
      ),
    );
  }

  res.status(201).json(conversation);
}

export async function removeMember(req: Request<{ id: string; userId: string }>, res: Response): Promise<void> {
  const result = await chatService.removeMember(req.params.id, req.params.userId, req.user!.id);
  res.json(result);
}

export async function updateMemberRole(
  req: Request<{ id: string; userId: string }, unknown, UpdateMemberRoleInput>,
  res: Response,
): Promise<void> {
  await chatService.assertAdmin(req.params.id, req.user!.id);
  await chatService.updateMemberRole(req.params.id, req.params.userId, req.body.role);
  res.status(204).send();
}

export async function getMessages(req: Request, res: Response): Promise<void> {
  await chatService.assertMember(req.params.id, req.user!.id).catch(() => {
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
  });

  const after = typeof req.query.after === 'string' ? req.query.after : undefined;
  const messages = await chatService.getMessagesAfter(req.params.id, after);
  res.json({ messages });
}

export async function uploadAttachment(req: Request, res: Response): Promise<void> {
  const conversationId = req.params.id;

  await chatService.assertMember(conversationId, req.user!.id).catch(() => {
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
  });

  if (!storageService.isStorageConfigured()) {
    res.status(503).json({ error: { code: 'STORAGE_NOT_CONFIGURED', message: 'File storage is not configured on this server' } });
    return;
  }

  const file = req.file;
  if (!file) {
    res.status(400).json({ error: { code: 'MISSING_FILE', message: 'No file was provided' } });
    return;
  }

  const extension = EXTENSION_BY_MIME[file.mimetype] ?? 'bin';
  const key = `attachments/${conversationId}/${uuid()}.${extension}`;

  await storageService.uploadObject(key, file.buffer, file.mimetype);

  const attachment = await chatService.createAttachment({
    conversationId,
    uploaderId: req.user!.id,
    bucket: env.S3_BUCKET,
    key,
    mimeType: file.mimetype,
    size: file.size,
    fileName: file.originalname,
  });

  const url = await storageService.getDownloadUrl(key);
  res.status(201).json({
    attachmentId: attachment.id,
    url,
    mimeType: attachment.mimeType,
    size: attachment.size,
    fileName: attachment.fileName,
  });
}
