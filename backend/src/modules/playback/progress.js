const prisma = require('../../db/prisma');
const { getRedis } = require('../../queue/connection');

const dirtyKey = 'progress:dirty';
const keyFor = (userId, titleId) => `progress:${userId}:${titleId}`;

async function saveProgress(userId, titleId, positionSec, durationSec) {
  const value = JSON.stringify({ userId, titleId, positionSec, durationSec });
  try {
    const redis = getRedis();
    await redis.multi().set(keyFor(userId, titleId), value).sadd(dirtyKey, `${userId}:${titleId}`).exec();
  } catch {
    // Keep progress available when Redis is down; this is the documented fallback.
    await prisma.watchHistory.upsert({
      where: { userId_titleId: { userId, titleId } },
      create: { userId, titleId, positionSec, durationSec },
      update: { positionSec, durationSec },
    });
  }
}

async function getProgress(userId, titleId) {
  try {
    const raw = await getRedis().get(keyFor(userId, titleId));
    if (raw) return JSON.parse(raw);
  } catch { /* read from MySQL below */ }
  return prisma.watchHistory.findUnique({ where: { userId_titleId: { userId, titleId } } });
}

async function flushProgress() {
  const redis = getRedis();
  const members = await redis.smembers(dirtyKey);
  if (!members.length) return 0;
  const keys = members.map((member) => `progress:${member}`);
  const rawValues = await redis.mget(...keys);
  const entries = rawValues.filter(Boolean).map((raw) => JSON.parse(raw));
  if (!entries.length) return 0;

  await prisma.$transaction(entries.map((entry) => prisma.watchHistory.upsert({
    where: { userId_titleId: { userId: entry.userId, titleId: entry.titleId } },
    create: { userId: entry.userId, titleId: entry.titleId, positionSec: entry.positionSec, durationSec: entry.durationSec },
    update: { positionSec: entry.positionSec, durationSec: entry.durationSec },
  })));

  // Remove only values that were actually flushed; a newer heartbeat stays dirty.
  const clearIfUnchanged = `
    if redis.call('GET', KEYS[1]) == ARGV[1] then
      redis.call('DEL', KEYS[1]); redis.call('SREM', KEYS[2], ARGV[2]); return 1
    end
    return 0`;
  const pipeline = redis.pipeline();
  entries.forEach((entry) => {
    const member = `${entry.userId}:${entry.titleId}`;
    pipeline.eval(clearIfUnchanged, 2, keyFor(entry.userId, entry.titleId), dirtyKey, JSON.stringify(entry), member);
  });
  await pipeline.exec();
  return entries.length;
}

module.exports = { saveProgress, getProgress, flushProgress };
