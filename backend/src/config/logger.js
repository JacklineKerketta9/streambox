const pino = require('pino');
const env = require('./env');

module.exports = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});
