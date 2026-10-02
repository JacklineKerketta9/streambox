const AppError = require('../utils/AppError');

module.exports = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return next(new AppError(400, 'Validation failed', result.error.flatten().fieldErrors));
  }
  req.body = result.data;
  next();
};

module.exports.query = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    return next(new AppError(400, 'Invalid query', result.error.flatten().fieldErrors));
  }
  req.query = result.data;
  next();
};
