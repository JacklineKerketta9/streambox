// Storage and queue are mocked: these tests cover the API's state machine, not MinIO/Redis.
jest.mock('../src/storage/s3', () => ({
  presignPut: jest.fn(async (key) => `http://storage.test/${key}?sig=1`),
  headObject: jest.fn(async () => ({ size: 123 })),
  ensureBucket: jest.fn(),
  publicUrl: jest.fn((k) => `http://public.test/${k}`),
}));
jest.mock('../src/queue/transcodeQueue', () => ({ enqueueTranscode: jest.fn(async () => {}) }));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const prisma = require('../src/db/prisma');
const storage = require('../src/storage/s3');
const { enqueueTranscode } = require('../src/queue/transcodeQueue');
const { createApp } = require('../src/app');
const { resetDb } = require('./helpers');

const app = createApp();
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

async function login(role) {
  const email = `${role}@example.com`;
  await prisma.user.create({ data: { email, passwordHash: await bcrypt.hash('password123', 4), role } });
  return (await request(app).post('/auth/login').send({ email, password: 'password123' })).body.accessToken;
}

async function setup() {
  const admin = await login('admin');
  const { body } = await request(app)
    .post('/admin/titles')
    .set(bearer(admin))
    .send({ name: 'Upload Me', description: 'desc', year: 2024 });
  return { admin, titleId: body.title.id };
}

const upload = (admin, titleId) =>
  request(app).post(`/admin/titles/${titleId}/upload`).set(bearer(admin)).send({ filename: 'my movie.mp4', contentType: 'video/mp4' });

beforeEach(async () => {
  await resetDb();
  jest.clearAllMocks();
});
afterAll(() => prisma.$disconnect());

describe('upload flow', () => {
  it('is admin only and validates the content type', async () => {
    const { admin, titleId } = await setup();
    const user = await login('user');
    expect((await upload(user, titleId)).status).toBe(403);
    const bad = await request(app).post(`/admin/titles/${titleId}/upload`).set(bearer(admin)).send({ filename: 'a.pdf', contentType: 'application/pdf' });
    expect(bad.status).toBe(400);
  });

  it('issues a presigned URL and creates a pending asset with a sanitized key', async () => {
    const { admin, titleId } = await setup();
    const res = await upload(admin, titleId);
    expect(res.status).toBe(201);
    expect(res.body.uploadUrl).toContain('http://storage.test/raw/');
    expect(storage.presignPut.mock.calls[0][0]).toMatch(/^raw\/[0-9a-f-]+\/my_movie\.mp4$/);

    const asset = await request(app).get(`/admin/assets/${res.body.assetId}`).set(bearer(admin));
    expect(asset.body.asset.status).toBe('pending_upload');
  });

  it('queues the transcode on complete, and only once', async () => {
    const { admin, titleId } = await setup();
    const { assetId } = (await upload(admin, titleId)).body;

    const done = await request(app).post(`/admin/assets/${assetId}/complete`).set(bearer(admin));
    expect(done.status).toBe(202);
    expect(done.body.asset.status).toBe('queued');
    expect(enqueueTranscode).toHaveBeenCalledWith(assetId);

    expect((await request(app).post(`/admin/assets/${assetId}/complete`).set(bearer(admin))).status).toBe(409);
    expect(enqueueTranscode).toHaveBeenCalledTimes(1);
  });

  it('rejects complete when the file never reached storage', async () => {
    const { admin, titleId } = await setup();
    const { assetId } = (await upload(admin, titleId)).body;
    storage.headObject.mockResolvedValueOnce(null);
    expect((await request(app).post(`/admin/assets/${assetId}/complete`).set(bearer(admin))).status).toBe(400);
    expect(enqueueTranscode).not.toHaveBeenCalled();
  });

  it('puts the asset back if the queue is down', async () => {
    const { admin, titleId } = await setup();
    const { assetId } = (await upload(admin, titleId)).body;
    enqueueTranscode.mockRejectedValueOnce(new Error('redis down'));
    expect((await request(app).post(`/admin/assets/${assetId}/complete`).set(bearer(admin))).status).toBe(503);
    expect((await prisma.videoAsset.findUnique({ where: { id: assetId } })).status).toBe('pending_upload');
  });
});

describe('retry', () => {
  it('only retries failed assets', async () => {
    const { admin, titleId } = await setup();
    const { assetId } = (await upload(admin, titleId)).body;
    expect((await request(app).post(`/admin/assets/${assetId}/retry`).set(bearer(admin))).status).toBe(409);

    await prisma.videoAsset.update({ where: { id: assetId }, data: { status: 'failed', error: 'boom' } });
    const res = await request(app).post(`/admin/assets/${assetId}/retry`).set(bearer(admin));
    expect(res.status).toBe(202);
    expect(res.body.asset).toMatchObject({ status: 'queued', error: null });
    expect(enqueueTranscode).toHaveBeenCalledWith(assetId);
  });
});
