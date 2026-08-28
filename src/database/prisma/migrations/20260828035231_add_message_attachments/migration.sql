-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "conversationId" TEXT NOT NULL,
ADD COLUMN     "fileName" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "attachmentId" TEXT;

-- CreateIndex
CREATE INDEX "attachments_conversationId_idx" ON "attachments"("conversationId");

-- CreateIndex
CREATE INDEX "attachments_uploaderId_idx" ON "attachments"("uploaderId");

-- CreateIndex
CREATE UNIQUE INDEX "messages_attachmentId_key" ON "messages"("attachmentId");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

