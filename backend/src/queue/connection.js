const IORedis = require('ioredis');
const env = require('../config/env');

// Shared application connection for cache, progress buffering, and rate limiting.
let client;
const getRedis = () => {
  if (!client) client = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
  return client;
};

// BullMQ requires maxRetriesPerRequest: null on its Redis connections.
const createConnection = () => new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

module.exports = { createConnection, getRedis };
