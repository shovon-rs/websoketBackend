import { prisma } from '../../config/database';

export async function getDocument(id: string) {
  return prisma.document.findUnique({ where: { id } });
}

export async function saveVersion(documentId: string, authorId: string, content: string) {
  await prisma.document.update({ where: { id: documentId }, data: { content } });
  return prisma.documentVersion.create({ data: { documentId, authorId, content } });
}
