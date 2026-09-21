import * as Y from 'yjs';
import { prisma } from '../../config/database';
import { AuthenticatedUser } from '../../types/ws';
import { hasRole } from '../../utils/roles';
import {
  AddCollaboratorInput,
  CreateVersionInput,
  UpdateCollaboratorRoleInput,
  UpdateDocumentTitleInput,
} from './documents.schemas';

const USER_SELECT = { id: true, displayName: true, email: true } as const;

async function getDocumentOrThrow(documentId: string) {
  const document = await prisma.document.findUnique({ where: { id: documentId }, include: { collaborators: true } });
  if (!document) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
  return document;
}

function findCollaborator<T extends { userId: string }>(collaborators: T[], userId: string): T | undefined {
  return collaborators.find((c) => c.userId === userId);
}

/** manager+ OR owner OR any collaborator row (editor or viewer) OR — if the document is public —
 * any authenticated user (view-only; assertCanEdit below still requires an actual editor grant). */
export async function assertCanView(documentId: string, actor: AuthenticatedUser) {
  const document = await getDocumentOrThrow(documentId);
  if (hasRole(actor.role, 'manager')) return document;
  if (document.ownerId === actor.id) return document;
  if (findCollaborator(document.collaborators, actor.id)) return document;
  if (document.visibility === 'public') return document;
  throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
}

/** manager+ OR owner OR a collaborator row with role === 'editor'. A viewer fails this. */
export async function assertCanEdit(documentId: string, actor: AuthenticatedUser) {
  const document = await getDocumentOrThrow(documentId);
  if (hasRole(actor.role, 'manager')) return document;
  if (document.ownerId === actor.id) return document;
  const collaborator = findCollaborator(document.collaborators, actor.id);
  if (collaborator && collaborator.role === 'editor') return document;
  throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
}

/** manager+ OR owner. Used for rename, delete, and collaborator management. */
export async function assertOwnerOrManager(documentId: string, actor: AuthenticatedUser) {
  const document = await getDocumentOrThrow(documentId);
  if (hasRole(actor.role, 'manager')) return document;
  if (document.ownerId === actor.id) return document;
  throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
}

/** Computes the actor's effective role label for a document summary/detail response. */
function effectiveRole(
  document: { ownerId: string; visibility: string; collaborators: { userId: string; role: string }[] },
  actor: AuthenticatedUser,
): string {
  if (document.ownerId === actor.id) return 'owner';
  const collaborator = findCollaborator(document.collaborators, actor.id);
  if (collaborator) return collaborator.role;
  // manager+ viewing a document they have no explicit relation to: always can edit.
  if (hasRole(actor.role, 'manager')) return 'editor';
  // A public document's incidental viewer (not owner/collaborator/manager+): read-only.
  return 'viewer';
}

export async function createDocument(ownerId: string, title: string) {
  const state = Buffer.from(Y.encodeStateAsUpdate(new Y.Doc()));
  return prisma.document.create({ data: { ownerId, title, state } });
}

export async function listDocuments(actor: AuthenticatedUser) {
  const documents = await prisma.document.findMany({
    where: hasRole(actor.role, 'manager')
      ? {}
      : {
          OR: [
            { ownerId: actor.id },
            { collaborators: { some: { userId: actor.id } } },
            { visibility: 'public' },
          ],
        },
    include: { collaborators: { where: { userId: actor.id } } },
    orderBy: { updatedAt: 'desc' },
  });

  return documents.map((d) => ({
    id: d.id,
    title: d.title,
    ownerId: d.ownerId,
    updatedAt: d.updatedAt,
    visibility: d.visibility,
    role: effectiveRole(d, actor),
  }));
}

export async function getDocument(documentId: string, actor: AuthenticatedUser) {
  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    include: { collaborators: { include: { user: { select: USER_SELECT } } } },
  });

  return {
    id: document.id,
    title: document.title,
    ownerId: document.ownerId,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    visibility: document.visibility,
    role: effectiveRole(document, actor),
    collaborators: document.collaborators.map((c) => ({
      id: c.id,
      userId: c.userId,
      displayName: c.user.displayName,
      email: c.user.email,
      role: c.role,
    })),
  };
}

export async function updateTitle(documentId: string, input: UpdateDocumentTitleInput) {
  return prisma.document.update({ where: { id: documentId }, data: { title: input.title } });
}

export async function updateVisibility(documentId: string, visibility: 'private' | 'public') {
  return prisma.document.update({ where: { id: documentId }, data: { visibility } });
}

export async function deleteDocument(documentId: string): Promise<void> {
  await prisma.document.delete({ where: { id: documentId } });
}

export async function addCollaborator(documentId: string, input: AddCollaboratorInput, actor: AuthenticatedUser) {
  const document = await getDocumentOrThrow(documentId);
  const existing = findCollaborator(document.collaborators, input.userId);
  if (existing) throw Object.assign(new Error('ALREADY_COLLABORATOR'), { status: 409 });

  await prisma.documentCollaborator.create({ data: { documentId, userId: input.userId, role: input.role } });
  return getDocument(documentId, actor);
}

export async function updateCollaboratorRole(
  documentId: string,
  targetUserId: string,
  input: UpdateCollaboratorRoleInput,
  actor: AuthenticatedUser,
) {
  const document = await getDocumentOrThrow(documentId);
  const target = findCollaborator(document.collaborators, targetUserId);
  if (!target) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  await prisma.documentCollaborator.update({
    where: { documentId_userId: { documentId, userId: targetUserId } },
    data: { role: input.role },
  });
  return getDocument(documentId, actor);
}

/** Owner/manager may remove anyone; a collaborator may remove themself. */
export async function removeCollaborator(documentId: string, targetUserId: string, actor: AuthenticatedUser): Promise<void> {
  const document = await getDocumentOrThrow(documentId);

  const isSelfRemoving = targetUserId === actor.id;
  if (!isSelfRemoving) {
    await assertOwnerOrManager(documentId, actor);
  }

  const target = findCollaborator(document.collaborators, targetUserId);
  if (!target) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  await prisma.documentCollaborator.delete({ where: { documentId_userId: { documentId, userId: targetUserId } } });
}

export async function listVersions(documentId: string) {
  return prisma.documentVersion.findMany({
    where: { documentId },
    select: {
      id: true,
      title: true,
      authorId: true,
      author: { select: { displayName: true } },
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getVersion(documentId: string, versionId: string) {
  const version = await prisma.documentVersion.findUnique({
    where: { id: versionId },
    include: { author: { select: USER_SELECT } },
  });
  if (!version || version.documentId !== documentId) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  return {
    id: version.id,
    title: version.title,
    html: version.html,
    createdAt: version.createdAt,
    author: version.author,
  };
}

/** Client-driven checkpoint save: decodes the base64 Yjs state and stores it alongside the rendered HTML snapshot. */
export async function createVersion(documentId: string, authorId: string, input: CreateVersionInput) {
  const state = Buffer.from(input.state, 'base64');
  return prisma.documentVersion.create({
    data: { documentId, authorId, title: input.title, html: input.html, state },
    include: { author: { select: USER_SELECT } },
  });
}

/** Loads a version's stored Yjs state Buffer for restore — kept separate from getVersion so the JSON response never carries binary state. */
export async function getVersionState(documentId: string, versionId: string): Promise<{ state: Buffer; html: string }> {
  const version = await prisma.documentVersion.findUnique({ where: { id: versionId } });
  if (!version || version.documentId !== documentId) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
  return { state: Buffer.from(version.state), html: version.html };
}
