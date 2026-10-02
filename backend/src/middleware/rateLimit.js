const { getRedis } = require('../queue/connection');
const AppError = require('../utils/AppError');

const tokenBucket = `
local values = redis.call('HMGET', KEYS[1], 'tokens', 'updated')
local tokens = tonumber(values[1]) or tonumber(ARGV[1])
local updated = tonumber(values[2]) or tonumber(ARGV[3])
local now = tonumber(ARGV[3])
tokens = math.min(tonumber(ARGV[1]), tokens + math.max(0, now - updated) * tonumber(ARGV[2]))
local allowed = 0
if tokens >= 1 then tokens = tokens - 1; allowed = 1 end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'updated', now)
redis.call('EXPIRE', KEYS[1], 120)
return {allowed, math.ceil((1 - tokens) / tonumber(ARGV[2]))}
`;

module.exports = async function rateLimit(req, _res, next) {
  const authRoute = req.path === '/auth' || req.path.startsWith('/auth/');
  const capacity = authRoute ? 10 : 60;
  const refillPerSecond = authRoute ? 1 / 6 : 1;
  const key = `rate:${authRoute ? 'auth' : 'browse'}:${req.ip}`;
  try {
    const result = await getRedis().eval(tokenBucket, 1, key, capacity, refillPerSecond, Date.now() / 1000);
    if (Number(result[0]) === 0) {
      resHeader(req, Math.max(1, Number(result[1])));
      return next(new AppError(429, 'Too many requests; try again shortly'));
    }
    next();
  } catch (err) {
    // Auth fails closed if the limiter is unavailable; browsing stays available.
    if (authRoute) return next(new AppError(503, 'Authentication is temporarily unavailable'));
    next();
  }
};

function resHeader(req, seconds) {
  if (req.res) req.res.set('Retry-After', String(seconds));
}
