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
  return { id: user.id, email: user.email, accessToken };
}

describe('roles, admin-created accounts, and deletion', () => {
  let superAdmin: Awaited<ReturnType<typeof makeUser>>;
  let admin: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    superAdmin = await makeUser('super_admin', 'super-admin');
    admin = await makeUser('admin', 'admin');
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('lets an admin create a manager account, flagged to change its password', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ email: `created-manager-${run}@example.com`, password: 'Str0ng!Passw0rd', displayName: 'Created Manager', role: 'manager' });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('manager');
    expect(res.body.mustChangePassword).toBe(true);
    userIds.push(res.body.id);
  });

  it('forbids an admin from creating a super_admin account', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ email: `should-fail-${run}@example.com`, password: 'Str0ng!Passw0rd', displayName: 'Nope', role: 'super_admin' });

    expect(res.status).toBe(403);
  });

  it('lets a super_admin create a super_admin account', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({ email: `created-super-${run}@example.com`, password: 'Str0ng!Passw0rd', displayName: 'Created Super', role: 'super_admin' });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('super_admin');
    userIds.push(res.body.id);
  });

  it('lets an admin promote a user to manager but not to super_admin', async () => {
    const target = await makeUser('user', 'target-for-admin');

    const toManager = await request(app)
      .patch(`/api/users/${target.id}/role`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ role: 'manager' });
    expect(toManager.status).toBe(200);
    expect(toManager.body.role).toBe('manager');

    const toSuperAdmin = await request(app)
      .patch(`/api/users/${target.id}/role`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ role: 'super_admin' });
    expect(toSuperAdmin.status).toBe(403);
  });

  it('forbids an admin from deleting anyone — only super_admin can', async () => {
    const target = await makeUser('user', 'admin-delete-target');

    const res = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('lets a super_admin delete a manager, disabling login without removing the row', async () => {
    const target = await makeUser('manager', 'super-delete-target');

    const res = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`);
    expect(res.status).toBe(204);

    const login = await request(app).post('/api/auth/login').send({ email: target.email, password: 'Str0ng!Passw0rd' });
    expect(login.status).toBe(401);
    expect(login.body.error.code).toBe('ACCOUNT_DISABLED');

    const stillInDb = await prisma.user.findUnique({ where: { id: target.id } });
    expect(stillInDb?.deletedAt).not.toBeNull();
  });

  it('forbids a super_admin from deleting another super_admin', async () => {
    const otherSuperAdmin = await makeUser('super_admin', 'other-super-admin');

    const res = await request(app)
      .delete(`/api/users/${otherSuperAdmin.id}`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('forbids deleting your own account', async () => {
    const res = await request(app)
      .delete(`/api/users/${superAdmin.id}`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`);
    expect(res.status).toBe(400);
  });
});
