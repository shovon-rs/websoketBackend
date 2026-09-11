import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/config/database';
import { hashPassword, issueTokenPair } from '../../src/services/auth.service';

const app = createApp();
const run = Date.now();
const userIds: string[] = [];
const conversationIds: string[] = [];

async function makeUser(label: string) {
  const user = await prisma.user.create({
    data: {
      email: `${label}-${run}@example.com`,
      displayName: label,
      passwordHash: await hashPassword('Str0ng!Passw0rd'),
    },
  });
  userIds.push(user.id);
  const { accessToken } = await issueTokenPair({ id: user.id, email: user.email, role: user.role });
  return { id: user.id, accessToken };
}

function memberRole(conversation: { members: { userId: string; role: string }[] }, userId: string) {
  return conversation.members.find((m: { userId: string }) => m.userId === userId)?.role;
}

describe('group chat admin', () => {
  let creator: Awaited<ReturnType<typeof makeUser>>;
  let memberA: Awaited<ReturnType<typeof makeUser>>;
  let memberB: Awaited<ReturnType<typeof makeUser>>;
  let outsider: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    creator = await makeUser('group-creator');
    memberA = await makeUser('group-member-a');
    memberB = await makeUser('group-member-b');
    outsider = await makeUser('group-outsider');
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { conversationId: { in: conversationIds } } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: { in: conversationIds } } });
    await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('makes the creator admin and everyone else a plain member', async () => {
    const res = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${creator.accessToken}`)
      .send({ type: 'group', name: 'Launch Squad', memberIds: [memberA.id, memberB.id] });

    expect(res.status).toBe(201);
    conversationIds.push(res.body.id);
    expect(res.body.name).toBe('Launch Squad');
    expect(memberRole(res.body, creator.id)).toBe('admin');
    expect(memberRole(res.body, memberA.id)).toBe('member');
    expect(memberRole(res.body, memberB.id)).toBe('member');
  });

  it('lets the admin rename the group but blocks a plain member and an outsider', async () => {
    const created = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${creator.accessToken}`)
      .send({ type: 'group', name: 'Rename Test', memberIds: [memberA.id] });
    const conversationId = created.body.id as string;
    conversationIds.push(conversationId);

    const byMember = await request(app)
      .patch(`/api/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${memberA.accessToken}`)
      .send({ name: 'Nope' });
    expect(byMember.status).toBe(403);

    const byOutsider = await request(app)
      .patch(`/api/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .send({ name: 'Nope' });
    expect(byOutsider.status).toBe(403);

    const byAdmin = await request(app)
      .patch(`/api/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${creator.accessToken}`)
      .send({ name: 'Renamed Group' });
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body.name).toBe('Renamed Group');
  });

  it('lets the admin add members but blocks a plain member', async () => {
    const created = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${creator.accessToken}`)
      .send({ type: 'group', name: 'Add Members Test', memberIds: [memberA.id] });
    const conversationId = created.body.id as string;
    conversationIds.push(conversationId);

    const byMember = await request(app)
      .post(`/api/conversations/${conversationId}/members`)
      .set('Authorization', `Bearer ${memberA.accessToken}`)
      .send({ memberIds: [memberB.id] });
    expect(byMember.status).toBe(403);

    const byAdmin = await request(app)
      .post(`/api/conversations/${conversationId}/members`)
      .set('Authorization', `Bearer ${creator.accessToken}`)
      .send({ memberIds: [memberB.id] });
    expect(byAdmin.status).toBe(201);
    expect(memberRole(byAdmin.body, memberB.id)).toBe('member');

    const nowVisibleToB = await request(app)
      .get(`/api/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${memberB.accessToken}`);
    expect(nowVisibleToB.status).toBe(200);
  });

  it('lets a member remove themself (leave) but blocks removing someone else without being admin', async () => {
    const created = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${creator.accessToken}`)
      .send({ type: 'group', name: 'Leave Test', memberIds: [memberA.id, memberB.id] });
    const conversationId = created.body.id as string;
    conversationIds.push(conversationId);

    const memberRemovesOther = await request(app)
      .delete(`/api/conversations/${conversationId}/members/${memberB.id}`)
      .set('Authorization', `Bearer ${memberA.accessToken}`);
    expect(memberRemovesOther.status).toBe(403);

    const selfLeave = await request(app)
      .delete(`/api/conversations/${conversationId}/members/${memberA.id}`)
      .set('Authorization', `Bearer ${memberA.accessToken}`);
    expect(selfLeave.status).toBe(200);
    expect(selfLeave.body.promotedAdminId).toBeNull();
  });

  it('auto-promotes the earliest-joined remaining member when the sole admin leaves', async () => {
    const created = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${creator.accessToken}`)
      .send({ type: 'group', name: 'Succession Test', memberIds: [memberA.id, memberB.id] });
    const conversationId = created.body.id as string;
    conversationIds.push(conversationId);

    const adminLeaves = await request(app)
      .delete(`/api/conversations/${conversationId}/members/${creator.id}`)
      .set('Authorization', `Bearer ${creator.accessToken}`);
    expect(adminLeaves.status).toBe(200);
    expect(adminLeaves.body.promotedAdminId).toBe(memberA.id);

    const updated = await request(app)
      .get(`/api/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${memberA.accessToken}`);
    expect(memberRole(updated.body, memberA.id)).toBe('admin');
  });

  it('lets the admin promote/demote, but refuses to demote the last remaining admin', async () => {
    const created = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${creator.accessToken}`)
      .send({ type: 'group', name: 'Role Change Test', memberIds: [memberA.id] });
    const conversationId = created.body.id as string;
    conversationIds.push(conversationId);

    const promote = await request(app)
      .patch(`/api/conversations/${conversationId}/members/${memberA.id}/role`)
      .set('Authorization', `Bearer ${creator.accessToken}`)
      .send({ role: 'admin' });
    expect(promote.status).toBe(204);

    const demoteCreator = await request(app)
      .patch(`/api/conversations/${conversationId}/members/${creator.id}/role`)
      .set('Authorization', `Bearer ${memberA.accessToken}`)
      .send({ role: 'member' });
    expect(demoteCreator.status).toBe(204);

    const demoteLastAdmin = await request(app)
      .patch(`/api/conversations/${conversationId}/members/${memberA.id}/role`)
      .set('Authorization', `Bearer ${memberA.accessToken}`)
      .send({ role: 'member' });
    expect(demoteLastAdmin.status).toBe(400);
  });
});
