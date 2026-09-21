import { Request, Response } from 'express';
import * as documentService from './document.service';
import * as documentSyncService from './document-sync.service';
import { roomManager } from '../../websocket/room.manager';
import { buildEvent } from '../../types/ws';
import {
  AddCollaboratorInput,
  CreateDocumentInput,
  CreateVersionInput,
  UpdateCollaboratorRoleInput,
  UpdateDocumentTitleInput,
  UpdateDocumentVisibilityInput,
} from './documents.schemas';

const documentRoom = (documentId: string) => `document:${documentId}`;

export async function createDocument(req: Request<unknown, unknown, CreateDocumentInput>, res: Response): Promise<void> {
  const document = await documentService.createDocument(req.user!.id, req.body.title);
  res.status(201).json(document);
}

export async function listDocuments(req: Request, res: Response): Promise<void> {
  const documents = await documentService.listDocuments(req.user!);
  res.json({ documents });
}

export async function getDocument(req: Request<{ id: string }>, res: Response): Promise<void> {
  await documentService.assertCanView(req.params.id, req.user!);
  const document = await documentService.getDocument(req.params.id, req.user!);
  res.json(document);
}

export async function updateDocumentTitle(
  req: Request<{ id: string }, unknown, UpdateDocumentTitleInput>,
  res: Response,
): Promise<void> {
  await documentService.assertOwnerOrManager(req.params.id, req.user!);
  const document = await documentService.updateTitle(req.params.id, req.body);
  res.json(document);
}

export async function updateDocumentVisibility(
  req: Request<{ id: string }, unknown, UpdateDocumentVisibilityInput>,
  res: Response,
): Promise<void> {
  await documentService.assertOwnerOrManager(req.params.id, req.user!);
  const document = await documentService.updateVisibility(req.params.id, req.body.visibility);
  res.json(document);
}

export async function deleteDocument(req: Request<{ id: string }>, res: Response): Promise<void> {
  await documentService.assertOwnerOrManager(req.params.id, req.user!);
  await documentService.deleteDocument(req.params.id);
  res.status(204).send();
}

export async function addCollaborator(
  req: Request<{ id: string }, unknown, AddCollaboratorInput>,
  res: Response,
): Promise<void> {
  await documentService.assertOwnerOrManager(req.params.id, req.user!);
  const document = await documentService.addCollaborator(req.params.id, req.body, req.user!);
  res.status(201).json(document);
}

export async function updateCollaboratorRole(
  req: Request<{ id: string; userId: string }, unknown, UpdateCollaboratorRoleInput>,
  res: Response,
): Promise<void> {
  await documentService.assertOwnerOrManager(req.params.id, req.user!);
  const document = await documentService.updateCollaboratorRole(req.params.id, req.params.userId, req.body, req.user!);
  res.json(document);
}

export async function removeCollaborator(req: Request<{ id: string; userId: string }>, res: Response): Promise<void> {
  await documentService.removeCollaborator(req.params.id, req.params.userId, req.user!);
  res.status(204).send();
}

export async function listVersions(req: Request<{ id: string }>, res: Response): Promise<void> {
  await documentService.assertCanView(req.params.id, req.user!);
  const versions = await documentService.listVersions(req.params.id);
  res.json({ versions });
}

export async function getVersion(req: Request<{ id: string; versionId: string }>, res: Response): Promise<void> {
  await documentService.assertCanView(req.params.id, req.user!);
  const version = await documentService.getVersion(req.params.id, req.params.versionId);
  res.json(version);
}

export async function createVersion(
  req: Request<{ id: string }, unknown, CreateVersionInput>,
  res: Response,
): Promise<void> {
  await documentService.assertCanEdit(req.params.id, req.user!);
  const version = await documentService.createVersion(req.params.id, req.user!.id, req.body);
  res.status(201).json(version);
}

export async function restoreVersion(req: Request<{ id: string; versionId: string }>, res: Response): Promise<void> {
  await documentService.assertCanEdit(req.params.id, req.user!);
  const { state, html } = await documentService.getVersionState(req.params.id, req.params.versionId);

  await documentSyncService.replaceState(req.params.id, state);

  roomManager.broadcastToRoom(
    documentRoom(req.params.id),
    buildEvent('document:restored', {
      documentId: req.params.id,
      state: state.toString('base64'),
      html,
    }),
  );

  const document = await documentService.getDocument(req.params.id, req.user!);
  res.json(document);
}
