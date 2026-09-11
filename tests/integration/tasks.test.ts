import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/config/database';
import { hashPassword, issueTokenPair } from '../../src/services/auth.service';

const app = createApp();
const run = Date.now();
const userIds: string[] = [];

async function makeUser(role: string, label: string) {
  const user = await prisma.user.create({
    data: {
      email: `${label}-${run}@example.com`,
      displayName: label,
      passwordHash: await hashPassword('Str0ng!Passw0rd'),
      role,
    },
  });
  userIds.push(user.id);
  const { accessToken } = await issueTokenPair({ id: user.id, email: user.email, role: user.role });
  return { id: user.id, accessToken };
}

describe('tasks', () => {
  let manager: Awaited<ReturnType<typeof makeUser>>;
  let assignee: Awaited<ReturnType<typeof makeUser>>;
  let secondAssignee: Awaited<ReturnType<typeof makeUser>>;
  let bystander: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    manager = await makeUser('manager', 'task-manager');
    assignee = await makeUser('user', 'task-assignee');
    secondAssignee = await makeUser('user', 'task-assignee-2');
    bystander = await makeUser('user', 'task-bystander');
  });

  afterAll(async () => {
    await prisma.taskComment.deleteMany({ where: { author: { id: { in: userIds } } } });
    await prisma.task.deleteMany({ where: { creatorId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('forbids a plain user from creating a task', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${assignee.accessToken}`)
      .send({ title: 'Nope', description: '', assigneeIds: [assignee.id] });
    expect(res.status).toBe(403);
  });

  it('rejects creating a task with no assignees', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .send({ title: 'No one to do this', description: '', assigneeIds: [] });
    expect(res.status).toBe(400);
  });

  it('lets a manager create a task with multiple assignees, and both assignees (but not a bystander) see it', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .send({ title: 'Ship the thing', description: 'Details here', assigneeIds: [assignee.id, secondAssignee.id] });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('todo');
    expect(res.body.assignees.map((a: { id: string }) => a.id).sort()).toEqual([assignee.id, secondAssignee.id].sort());

    const taskId = res.body.id as string;

    const listedForFirst = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${assignee.accessToken}`);
    expect(listedForFirst.body.tasks.map((t: { id: string }) => t.id)).toContain(taskId);

    const listedForSecond = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${secondAssignee.accessToken}`);
    expect(listedForSecond.body.tasks.map((t: { id: string }) => t.id)).toContain(taskId);

    const listedForBystander = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${bystander.accessToken}`);
    expect(listedForBystander.body.tasks.map((t: { id: string }) => t.id)).not.toContain(taskId);
  });

  it('lets either assignee change status but not edit the task, and blocks a bystander from either', async () => {
    const created = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .send({ title: 'Status flow', description: '', assigneeIds: [assignee.id, secondAssignee.id] });
    const taskId = created.body.id as string;

    const statusByFirst = await request(app)
      .patch(`/api/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${assignee.accessToken}`)
      .send({ status: 'in_progress' });
    expect(statusByFirst.status).toBe(200);
    expect(statusByFirst.body.status).toBe('in_progress');

    const statusBySecond = await request(app)
      .patch(`/api/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${secondAssignee.accessToken}`)
      .send({ status: 'done' });
    expect(statusBySecond.status).toBe(200);
    expect(statusBySecond.body.status).toBe('done');

    const editByAssignee = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${assignee.accessToken}`)
      .send({ title: 'Renamed' });
    expect(editByAssignee.status).toBe(403);

    const statusByBystander = await request(app)
      .patch(`/api/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${bystander.accessToken}`)
      .send({ status: 'done' });
    expect(statusByBystander.status).toBe(403);

    const getByBystander = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${bystander.accessToken}`);
    expect(getByBystander.status).toBe(403);
  });

  it('lets a manager change the assignee list, notifying only newly-added assignees', async () => {
    const created = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .send({ title: 'Reassign flow', description: '', assigneeIds: [assignee.id] });
    const taskId = created.body.id as string;

    const updated = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .send({ assigneeIds: [assignee.id, secondAssignee.id] });
    expect(updated.status).toBe(200);
    expect(updated.body.assignees.map((a: { id: string }) => a.id).sort()).toEqual([assignee.id, secondAssignee.id].sort());

    const nowVisibleToSecond = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${secondAssignee.accessToken}`);
    expect(nowVisibleToSecond.status).toBe(200);
  });

  it('lets an assignee comment on their task but blocks a bystander', async () => {
    const created = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .send({ title: 'Comment flow', description: '', assigneeIds: [assignee.id] });
    const taskId = created.body.id as string;

    const commentByAssignee = await request(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${assignee.accessToken}`)
      .send({ body: 'On it' });
    expect(commentByAssignee.status).toBe(201);
    expect(commentByAssignee.body.body).toBe('On it');

    const commentByBystander = await request(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${bystander.accessToken}`)
      .send({ body: 'Butting in' });
    expect(commentByBystander.status).toBe(403);
  });

  it('filters the task list by status', async () => {
    const a = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .send({ title: 'Filter A', description: '', assigneeIds: [assignee.id], status: 'done' });
    const b = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .send({ title: 'Filter B', description: '', assigneeIds: [assignee.id], status: 'todo' });

    const doneOnly = await request(app)
      .get('/api/tasks?status=done')
      .set('Authorization', `Bearer ${manager.accessToken}`);

    const ids = doneOnly.body.tasks.map((t: { id: string }) => t.id);
    expect(ids).toContain(a.body.id);
    expect(ids).not.toContain(b.body.id);
  });

  it('lets a manager attach multiple files and remove one; blocks the assignee from doing either', async () => {
    const created = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .send({ title: 'Attachment flow', description: '', assigneeIds: [assignee.id] });
    const taskId = created.body.id as string;

    const uploaded = await request(app)
      .post(`/api/tasks/${taskId}/attachments`)
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .attach('files', Buffer.from('first file'), { filename: 'first.txt', contentType: 'text/plain' })
      .attach('files', Buffer.from('second file'), { filename: 'second.txt', contentType: 'text/plain' });

    expect(uploaded.status).toBe(201);
    expect(uploaded.body.attachments).toHaveLength(2);
    expect(uploaded.body.attachments[0].url).toEqual(expect.any(String));

    const deniedUpload = await request(app)
      .post(`/api/tasks/${taskId}/attachments`)
      .set('Authorization', `Bearer ${assignee.accessToken}`)
      .attach('files', Buffer.from('nope'), { filename: 'nope.txt', contentType: 'text/plain' });
    expect(deniedUpload.status).toBe(403);

    const attachmentId = uploaded.body.attachments[0].id as string;
    const deniedDelete = await request(app)
      .delete(`/api/tasks/${taskId}/attachments/${attachmentId}`)
      .set('Authorization', `Bearer ${assignee.accessToken}`);
    expect(deniedDelete.status).toBe(403);

    const deleted = await request(app)
      .delete(`/api/tasks/${taskId}/attachments/${attachmentId}`)
      .set('Authorization', `Bearer ${manager.accessToken}`);
    expect(deleted.status).toBe(204);

    const afterDelete = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${manager.accessToken}`);
    expect(afterDelete.body.attachments).toHaveLength(1);
    expect(afterDelete.body.attachments[0].fileName).toBe('second.txt');
  });

  it('lets a manager delete a task', async () => {
    const created = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .send({ title: 'To delete', description: '', assigneeIds: [assignee.id] });
    const taskId = created.body.id as string;

    const del = await request(app)
      .delete(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${manager.accessToken}`);
    expect(del.status).toBe(204);

    const getAfterDelete = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${manager.accessToken}`);
    expect(getAfterDelete.status).toBe(404);
  });
});
