// Express 4 doesn't catch rejected promises, so wrap async handlers.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
