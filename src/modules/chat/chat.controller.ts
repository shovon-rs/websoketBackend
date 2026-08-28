import { Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import * as chatService from './chat.service';
import * as storageService from '../../services/storage.service';
import { env } from '../../config/env';

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
