const { closeRedis } = require('../src/queue/connection');

afterAll(() => closeRedis());
