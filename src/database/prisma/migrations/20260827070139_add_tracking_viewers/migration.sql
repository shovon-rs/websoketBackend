-- CreateTable
CREATE TABLE "tracking_session_viewers" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_session_viewers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tracking_session_viewers_userId_idx" ON "tracking_session_viewers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_session_viewers_sessionId_userId_key" ON "tracking_session_viewers"("sessionId", "userId");

-- AddForeignKey
ALTER TABLE "tracking_session_viewers" ADD CONSTRAINT "tracking_session_viewers_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "tracking_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_session_viewers" ADD CONSTRAINT "tracking_session_viewers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
