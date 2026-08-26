import { prisma } from '../../config/database';

export async function createDocument(ownerId: string, title: string) {
  return prisma.document.create({ data: { ownerId, title } });
}

export async function listDocuments(ownerId: string) {
  return prisma.document.findMany({ where: { ownerId }, orderBy: { updatedAt: 'desc' } });
}

export async function getDocument(id: string) {
  return prisma.document.findUnique({ where: { id } });
}

export async function saveVersion(documentId: string, authorId: string, content: string) {
  await prisma.document.update({ where: { id: documentId }, data: { content } });
  return prisma.documentVersion.create({ data: { documentId, authorId, content } });
}
