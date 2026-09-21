/*
  Warnings:

  - You are about to drop the column `content` on the `document_versions` table. All the data in the column will be lost.
  - You are about to drop the column `content` on the `documents` table. All the data in the column will be lost.
  - Added the required column `html` to the `document_versions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `state` to the `document_versions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `document_versions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `state` to the `documents` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "document_versions" DROP COLUMN "content",
ADD COLUMN     "html" TEXT NOT NULL,
ADD COLUMN     "state" BYTEA NOT NULL,
ADD COLUMN     "title" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "documents" DROP COLUMN "content",
ADD COLUMN     "state" BYTEA NOT NULL;

-- CreateTable
CREATE TABLE "document_collaborators" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_collaborators_userId_idx" ON "document_collaborators"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "document_collaborators_documentId_userId_key" ON "document_collaborators"("documentId", "userId");

-- CreateIndex
CREATE INDEX "documents_ownerId_idx" ON "documents"("ownerId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_collaborators" ADD CONSTRAINT "document_collaborators_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_collaborators" ADD CONSTRAINT "document_collaborators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
