import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/config/database';

const app = createApp();
const testEmail = `test-${Date.now()}@example.com`;
const strongPassword = 'Str0ng!Passw0rd';

describe('auth flow', () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await prisma.$disconnect();
  });

  it('rejects registration with a password that fails the strength policy', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: testEmail, password: 'password123', displayName: 'Test User' });

    expect(res.status).toBe(400);
  });

  it('registers a user and returns a token pair', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: testEmail, password: strongPassword, displayName: 'Test User' });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.mustChangePassword).toBe(false);
    expect(res.headers['set-cookie']?.[0]).toMatch(/^refreshToken=.*HttpOnly/);
  });

  it('logs in with valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: testEmail, password: strongPassword });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('rejects invalid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: testEmail, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated access to /me', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('changes the password given the correct current password, then allows login with the new one', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: testEmail, password: strongPassword });
    const accessToken = login.body.accessToken as string;

    const wrongOldPassword = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ oldPassword: 'NotTheRealPassword1!', newPassword: 'An0ther!StrongOne' });
    expect(wrongOldPassword.status).toBe(401);

    const changed = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ oldPassword: strongPassword, newPassword: 'An0ther!StrongOne' });
    expect(changed.status).toBe(200);

    const loginWithNewPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: 'An0ther!StrongOne' });
    expect(loginWithNewPassword.status).toBe(200);
  });
});
