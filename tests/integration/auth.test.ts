import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/config/database';

const app = createApp();
const testEmail = `test-${Date.now()}@example.com`;

describe('auth flow', () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await prisma.$disconnect();
  });

  it('registers a user and returns a token pair', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: testEmail, password: 'password123', displayName: 'Test User' });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.headers['set-cookie']?.[0]).toMatch(/^refreshToken=.*HttpOnly/);
  });

  it('logs in with valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: testEmail, password: 'password123' });

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
});
