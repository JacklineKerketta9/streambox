const AppError = require('../utils/AppError');
const logger = require('../config/logger');

function notFound(_req, _res, next) {
  next(new AppError(404, 'Route not found'));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  (req.log || logger).error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { notFound, errorHandler };
