const AppError = require('../utils/AppError');
const { verifyAccessToken } = require('../modules/auth/tokens');

function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(new AppError(401, 'Missing access token'));
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired access token'));
  }
}

// Usage: router.post('/admin/titles', authenticate, requireRole('admin'), handler)
const requireRole = (role) => (req, _res, next) =>
  req.user && req.user.role === role ? next() : next(new AppError(403, 'Forbidden'));

// Attaches req.user when a token is sent, but lets anonymous requests through.
// A present-but-invalid token is still a 401 so the client knows to refresh.
authenticate.optional = (req, _res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return next();
  return authenticate(req, _res, next);
};

module.exports = authenticate;
module.exports.requireRole = requireRole;
