-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "broadcasterId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'general',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'published',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_invites" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "livestream_requests" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "proposedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "announcementId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "livestream_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "livestream_sessions" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "broadcasterId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "livestream_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "livestream_viewers" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "livestream_viewers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcements_status_scheduledAt_idx" ON "announcements"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "announcement_invites_userId_idx" ON "announcement_invites"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_invites_announcementId_userId_key" ON "announcement_invites"("announcementId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "livestream_requests_announcementId_key" ON "livestream_requests"("announcementId");

-- CreateIndex
CREATE INDEX "livestream_requests_status_idx" ON "livestream_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "livestream_sessions_announcementId_key" ON "livestream_sessions"("announcementId");

-- CreateIndex
CREATE INDEX "livestream_viewers_sessionId_idx" ON "livestream_viewers"("sessionId");

-- CreateIndex
CREATE INDEX "livestream_viewers_userId_idx" ON "livestream_viewers"("userId");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_broadcasterId_fkey" FOREIGN KEY ("broadcasterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_invites" ADD CONSTRAINT "announcement_invites_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_invites" ADD CONSTRAINT "announcement_invites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livestream_requests" ADD CONSTRAINT "livestream_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livestream_requests" ADD CONSTRAINT "livestream_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livestream_requests" ADD CONSTRAINT "livestream_requests_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livestream_sessions" ADD CONSTRAINT "livestream_sessions_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livestream_sessions" ADD CONSTRAINT "livestream_sessions_broadcasterId_fkey" FOREIGN KEY ("broadcasterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livestream_viewers" ADD CONSTRAINT "livestream_viewers_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "livestream_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livestream_viewers" ADD CONSTRAINT "livestream_viewers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
