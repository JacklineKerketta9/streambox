const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
const logger = require('./config/logger');
const prisma = require('./db/prisma');
const { passport } = require('./modules/auth/passport');
const authRoutes = require('./modules/auth/auth.routes');
const assetsRoutes = require('./modules/assets/assets.routes');
const catalogRoutes = require('./modules/catalog/catalog.routes');
const myListRoutes = require('./modules/mylist/mylist.routes');
const playbackRoutes = require('./modules/playback/playback.routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const rateLimit = require('./middleware/rateLimit');

function createApp() {
  const app = express();
  app.use(helmet());
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = req.headers['x-request-id'] || crypto.randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
    })
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(passport.initialize());
  if (process.env.NODE_ENV !== 'test') app.use(rateLimit);

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'not ready' });
    }
  });

  app.use('/auth', authRoutes);
  app.use('/my-list', myListRoutes);
  app.use('/admin', assetsRoutes); // upload + transcoding status
  app.use('/', catalogRoutes); // /titles, /search, /home, /admin/titles
  app.use('/', playbackRoutes); // /playback/:id, /progress

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
