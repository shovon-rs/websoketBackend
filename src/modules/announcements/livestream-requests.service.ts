import { LiveStreamRequest } from '@prisma/client';
import { prisma } from '../../config/database';
import { connectionManager } from '../../websocket/connection.manager';
import { buildEvent } from '../../types/ws';
import { dispatchNotification } from '../../services/push-dispatcher.service';
import { deliverAnnouncement } from './announcements.service';
import {
  ApproveLiveStreamRequestInput,
  RejectLiveStreamRequestInput,
  SubmitLiveStreamRequestInput,
} from './announcements.schemas';

type RequestWithRequester = LiveStreamRequest & { requester: { id: string; displayName: string; email: string } };

const requesterInclude = { requester: { select: { id: true, displayName: true, email: true } } } as const;

function serialize(request: RequestWithRequester) {
  return {
    id: request.id,
    requesterId: request.requesterId,
    requester: request.requester,
    title: request.title,
    description: request.description,
    proposedAt: request.proposedAt,
    status: request.status,
    announcementId: request.announcementId,
    createdAt: request.createdAt,
    decidedAt: request.reviewedAt,
  };
}

function relayToUser(userId: string, type: string, payload: unknown): void {
  const sockets = connectionManager.getByUser(userId);
  if (sockets.length === 0) return;
  const message = JSON.stringify(buildEvent(type, payload));
  for (const conn of sockets) conn.socket.send(message);
}

export async function submitRequest(requesterId: string, input: SubmitLiveStreamRequestInput) {
  const request = await prisma.liveStreamRequest.create({
    data: {
      requesterId,
      title: input.title,
      description: input.description,
      proposedAt: input.proposedAt ? new Date(input.proposedAt) : null,
    },
    include: requesterInclude,
  });

  const superAdmins = await prisma.user.findMany({ where: { role: 'super_admin' }, select: { id: true } });
  const payload = serialize(request);
  await Promise.all(
    superAdmins.map(async ({ id: superAdminId }) => {
      relayToUser(superAdminId, 'livestream-request:new', payload);
      await dispatchNotification(superAdminId, {
        type: 'info',
        title: 'New live-stream request',
        body: `${request.requester.displayName} wants to go live: "${request.title}"`,
        data: { kind: 'livestream-request', requestId: request.id },
      });
    }),
  );

  return payload;
}

export async function listPending(status: string = 'pending') {
  const requests = await prisma.liveStreamRequest.findMany({
    where: { status },
    include: requesterInclude,
    orderBy: { createdAt: 'desc' },
  });
  return requests.map(serialize);
}

export async function listMine(requesterId: string) {
  const requests = await prisma.liveStreamRequest.findMany({
    where: { requesterId },
    include: requesterInclude,
    orderBy: { createdAt: 'desc' },
  });
  return requests.map(serialize);
}

async function assertPending(requestId: string): Promise<RequestWithRequester> {
  const request = await prisma.liveStreamRequest.findUnique({ where: { id: requestId }, include: requesterInclude });
  if (!request) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
  if (request.status !== 'pending') throw Object.assign(new Error('REQUEST_ALREADY_DECIDED'), { status: 409 });
  return request;
}

export async function approveRequest(reviewerId: string, requestId: string, input: ApproveLiveStreamRequestInput) {
  const request = await assertPending(requestId);

  const announcement = await prisma.announcement.create({
    data: {
      authorId: reviewerId,
      broadcasterId: request.requesterId,
      kind: 'livestream',
      title: request.title,
      body: request.description,
      audience: 'everyone',
      status: 'scheduled',
      scheduledAt: new Date(input.scheduledAt),
    },
    include: { invites: { include: { user: { select: { id: true, displayName: true, email: true } } } } },
  });

  const updated = await prisma.liveStreamRequest.update({
    where: { id: requestId },
    data: { status: 'approved', announcementId: announcement.id, reviewedById: reviewerId, reviewedAt: new Date() },
    include: requesterInclude,
  });

  await deliverAnnouncement(announcement, 'created');

  const payload = serialize(updated);
  relayToUser(request.requesterId, 'livestream-request:decided', payload);
  await dispatchNotification(request.requesterId, {
    type: 'success',
    title: 'Your live-stream request was approved',
    body: `"${request.title}" is scheduled — check the countdown on the Live page.`,
    data: { kind: 'livestream-request', requestId: request.id, announcementId: announcement.id },
  });

  return payload;
}

export async function rejectRequest(reviewerId: string, requestId: string, input: RejectLiveStreamRequestInput) {
  const request = await assertPending(requestId);

  const updated = await prisma.liveStreamRequest.update({
    where: { id: requestId },
    data: { status: 'rejected', reviewedById: reviewerId, reviewedAt: new Date() },
    include: requesterInclude,
  });

  const payload = serialize(updated);
  relayToUser(request.requesterId, 'livestream-request:decided', payload);
  await dispatchNotification(request.requesterId, {
    type: 'info',
    title: 'Your live-stream request was declined',
    body: input.reason ? `"${request.title}": ${input.reason}` : `"${request.title}" was not approved.`,
    data: { kind: 'livestream-request', requestId: request.id },
  });

  return payload;
}
