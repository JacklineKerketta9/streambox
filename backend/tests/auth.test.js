const request = require('supertest');
const prisma = require('../src/db/prisma');
const authService = require('../src/modules/auth/auth.service');
const { createApp } = require('../src/app');
const { resetDb } = require('./helpers');

const app = createApp();

const creds = { email: 'jane@example.com', password: 'password123', name: 'Jane' };
const getRefreshCookie = (res) =>
  res.headers['set-cookie'].find((c) => c.startsWith('refresh_token=')).split(';')[0];

beforeEach(resetDb);

afterAll(async () => {
  await prisma.$disconnect();
});

describe('email/password auth', () => {
  it('signs up and returns an access token + refresh cookie', async () => {
    const res = await request(app).post('/auth/signup').send(creds);
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe(creds.email);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(getRefreshCookie(res)).toBeDefined();
  });

  it('rejects duplicate emails and weak passwords', async () => {
    await request(app).post('/auth/signup').send(creds);
    expect((await request(app).post('/auth/signup').send(creds)).status).toBe(409);
    expect((await request(app).post('/auth/signup').send({ email: 'a@b.com', password: 'short' })).status).toBe(400);
  });

  it('logs in with correct credentials only', async () => {
    await request(app).post('/auth/signup').send(creds);
    expect((await request(app).post('/auth/login').send({ email: creds.email, password: 'wrong-pass' })).status).toBe(401);
    expect((await request(app).post('/auth/login').send(creds)).status).toBe(200);
  });

  it('protects /auth/me with the access token', async () => {
    const signup = await request(app).post('/auth/signup').send(creds);
    expect((await request(app).get('/auth/me')).status).toBe(401);
    const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${signup.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(creds.email);
  });
});

describe('refresh token rotation', () => {
  it('rotates tokens, and reuse of an old token revokes the whole family', async () => {
    const signup = await request(app).post('/auth/signup').send(creds);
    const oldCookie = getRefreshCookie(signup);

    const refreshed = await request(app).post('/auth/refresh').set('Cookie', oldCookie);
    expect(refreshed.status).toBe(200);
    const newCookie = getRefreshCookie(refreshed);
    expect(newCookie).not.toBe(oldCookie);

    // Replaying the old token = theft signal
    expect((await request(app).post('/auth/refresh').set('Cookie', oldCookie)).status).toBe(401);
    // ...so even the legitimate new token is now revoked
    expect((await request(app).post('/auth/refresh').set('Cookie', newCookie)).status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const signup = await request(app).post('/auth/signup').send(creds);
    const cookie = getRefreshCookie(signup);
    expect((await request(app).post('/auth/logout').set('Cookie', cookie)).status).toBe(204);
    expect((await request(app).post('/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });
});

describe('OAuth user linking', () => {
  const google = { provider: 'google', providerUserId: 'g-123', email: 'oauth@example.com', name: 'Oscar' };

  it('creates a new user, and returns the same user on the next login', async () => {
    const first = await authService.findOrCreateOAuthUser({ ...google, emailVerified: true });
    const second = await authService.findOrCreateOAuthUser({ ...google, emailVerified: true });
    expect(second.id).toBe(first.id);
    expect(await prisma.user.count()).toBe(1);
  });

  it('links to an existing password account only when the email is verified', async () => {
    await request(app).post('/auth/signup').send({ email: google.email, password: 'password123' });

    await expect(
      authService.findOrCreateOAuthUser({ ...google, emailVerified: false })
    ).rejects.toMatchObject({ status: 409 });

    const linked = await authService.findOrCreateOAuthUser({ ...google, emailVerified: true });
    expect(linked.email).toBe(google.email);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.authIdentity.count()).toBe(1);
  });

  it('OAuth-only users cannot log in with a password', async () => {
    await authService.findOrCreateOAuthUser({ ...google, emailVerified: true });
    const res = await request(app).post('/auth/login').send({ email: google.email, password: 'anything123' });
    expect(res.status).toBe(401);
  });
});

describe('health', () => {
  it('GET /health and /ready', async () => {
    expect((await request(app).get('/health')).body.status).toBe('ok');
    expect((await request(app).get('/ready')).status).toBe(200);
  });
});
