const { getRedis } = require('../../queue/connection');

const TTL_SECONDS = 300;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getCachedHome(userId, loader) {
  try {
    const redis = getRedis();
    const version = (await redis.get('home:version')) || '1';
    const suffix = userId || 'anonymous';
    const key = `home:v${version}:${suffix}`;
    const staleKey = `${key}:stale`;
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);

    const stale = await redis.get(staleKey);
    const lockKey = `${key}:lock`;
    const locked = await redis.set(lockKey, '1', 'PX', 10000, 'NX');
    if (!locked) {
      if (stale) return JSON.parse(stale);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await sleep(50);
        const rebuilt = await redis.get(key);
        if (rebuilt) return JSON.parse(rebuilt);
      }
      return loader();
    }

    try {
      const rows = await loader();
      const ttl = TTL_SECONDS + Math.floor(Math.random() * 31);
      await redis.multi().set(key, JSON.stringify(rows), 'EX', ttl).set(staleKey, JSON.stringify(rows), 'EX', ttl + 60).exec();
      return rows;
    } finally {
      await redis.del(lockKey);
    }
  } catch {
    return loader();
  }
}

async function invalidateHome() {
  try { await getRedis().incr('home:version'); } catch { /* cache is an optimization */ }
}

module.exports = { getCachedHome, invalidateHome };
