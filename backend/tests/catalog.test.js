const request = require('supertest');
const bcrypt = require('bcryptjs');
const prisma = require('../src/db/prisma');
const { createApp } = require('../src/app');
const { resetDb } = require('./helpers');
const { flushProgress } = require('../src/modules/playback/progress');

const app = createApp();
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

async function userToken(email = 'user@example.com') {
  const res = await request(app).post('/auth/signup').send({ email, password: 'password123' });
  return res.body.accessToken;
}

async function adminToken() {
  await prisma.user.create({
    data: { email: 'admin@example.com', passwordHash: await bcrypt.hash('password123', 4), role: 'admin' },
  });
  const res = await request(app).post('/auth/login').send({ email: 'admin@example.com', password: 'password123' });
  return res.body.accessToken;
}

const movie = {
  name: 'Test Movie',
  description: 'A test movie',
  year: 2020,
  genres: ['Action', 'Drama'],
  videoUrl: 'https://example.com/a.m3u8',
  popularity: 5,
};

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('admin catalog', () => {
  it('requires login and the admin role', async () => {
    expect((await request(app).post('/admin/titles').send(movie)).status).toBe(401);
    const user = await userToken();
    expect((await request(app).post('/admin/titles').set(bearer(user)).send(movie)).status).toBe(403);
  });

  it('lets admins create, update and delete titles', async () => {
    const admin = await adminToken();
    const created = await request(app).post('/admin/titles').set(bearer(admin)).send(movie);
    expect(created.status).toBe(201);
    expect([...created.body.title.genres].sort()).toEqual(['Action', 'Drama']);

    const id = created.body.title.id;
    const updated = await request(app).put(`/admin/titles/${id}`).set(bearer(admin)).send({ name: 'Renamed', genres: ['Comedy'] });
    expect(updated.body.title).toMatchObject({ name: 'Renamed', genres: ['Comedy'] });

    expect((await request(app).delete(`/admin/titles/${id}`).set(bearer(admin))).status).toBe(204);
    expect((await request(app).get(`/titles/${id}`)).status).toBe(404);
  });
});

describe('browse', () => {
  it('lists, filters by genre, searches, and never leaks videoUrl', async () => {
    const admin = await adminToken();
    await request(app).post('/admin/titles').set(bearer(admin)).send(movie);
    await request(app)
      .post('/admin/titles')
      .set(bearer(admin))
      .send({ ...movie, name: 'Other Show', description: 'Something else', genres: ['Comedy'] });

    const all = await request(app).get('/titles');
    expect(all.body.total).toBe(2);
    expect(all.body.items[0].videoUrl).toBeUndefined();
    expect(all.body.items[0].playable).toBe(true);

    expect((await request(app).get('/titles?genre=Comedy')).body.items.map((t) => t.name)).toEqual(['Other Show']);
    expect((await request(app).get('/search?q=test')).body.items).toHaveLength(1);
  });
});

describe('viewing: my list, progress, playback, home', () => {
  it('ties everything together for a user', async () => {
    const admin = await adminToken();
    const id = (await request(app).post('/admin/titles').set(bearer(admin)).send(movie)).body.title.id;
    const user = await userToken();

    expect((await request(app).post('/my-list').set(bearer(user)).send({ titleId: id })).status).toBe(201);
    expect((await request(app).get('/my-list').set(bearer(user))).body.items).toHaveLength(1);

    const progress = await request(app).post('/progress').set(bearer(user)).send({ titleId: id, positionSec: 120, durationSec: 600 });
    expect(progress.status).toBe(204);
    await flushProgress();

    const playback = await request(app).get(`/playback/${id}`).set(bearer(user));
    expect(playback.body).toMatchObject({ url: movie.videoUrl, positionSec: 120 });

    const home = await request(app).get('/home').set(bearer(user));
    expect(home.body.rows.map((r) => r.id)).toEqual(expect.arrayContaining(['continue', 'my-list', 'trending']));

    expect((await request(app).delete(`/my-list/${id}`).set(bearer(user))).status).toBe(204);
    expect((await request(app).get('/my-list').set(bearer(user))).body.items).toHaveLength(0);
  });

  it('requires auth for playback and rejects unknown titles', async () => {
    expect((await request(app).get('/playback/nope')).status).toBe(401);
    const user = await userToken();
    const res = await request(app).post('/progress').set(bearer(user)).send({ titleId: 'nope', positionSec: 1, durationSec: 10 });
    expect(res.status).toBe(404);
  });
});
