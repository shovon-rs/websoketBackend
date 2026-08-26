import { Request, Response } from 'express';
import * as documentService from './document.service';

export async function createDocument(req: Request, res: Response): Promise<void> {
  const document = await documentService.createDocument(req.user!.id, req.body.title);
  res.status(201).json(document);
}

export async function listDocuments(req: Request, res: Response): Promise<void> {
  const documents = await documentService.listDocuments(req.user!.id);
  res.json({ documents });
}

export async function getDocument(req: Request, res: Response): Promise<void> {
  const document = await documentService.getDocument(req.params.id);
  if (!document) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
    return;
  }
  res.json(document);
}
