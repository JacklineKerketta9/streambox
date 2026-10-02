const crypto = require('crypto');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const authService = require('./auth.service');
const { passport } = require('./passport');

const REFRESH_COOKIE = 'refresh_token';
const STATE_COOKIE = 'oauth_state';

const refreshCookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'lax',
  path: '/auth',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
};

const stateCookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'lax',
  path: '/auth/google',
  maxAge: 10 * 60 * 1000,
};

function sendSession(res, status, { user, accessToken, refreshToken }) {
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
  res.status(status).json({ user: authService.toPublicUser(user), accessToken });
}

const signup = asyncHandler(async (req, res) => {
  sendSession(res, 201, await authService.signup(req.body));
});

const login = asyncHandler(async (req, res) => {
  sendSession(res, 200, await authService.login(req.body));
});

const refresh = asyncHandler(async (req, res) => {
  sendSession(res, 200, await authService.rotateRefreshToken(req.cookies[REFRESH_COOKIE]));
});

const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.cookies[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
  res.status(204).end();
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.getUserById(req.user.id);
  res.json({ user: authService.toPublicUser(user) });
});

// Step 1: send the user to Google with a random `state` that we also store in a cookie.
function googleStart(req, res, next) {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(STATE_COOKIE, state, stateCookieOptions);
  passport.authenticate('google', { scope: ['profile', 'email'], state, session: false })(req, res, next);
}

// Step 2: Google redirects back. Verify `state` (CSRF check), then issue our own session.
function googleCallback(req, res, next) {
  const expected = req.cookies[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, { ...stateCookieOptions, maxAge: undefined });
  if (!expected || expected !== req.query.state) {
    return next(new AppError(400, 'Invalid OAuth state'));
  }

  passport.authenticate('google', { session: false }, async (err, user) => {
    if (err) return next(err);
    if (!user) return next(new AppError(401, 'Google sign-in failed'));
    try {
      const session = await authService.issueSession(user);
      if (env.FRONTEND_URL) {
        res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions);
        return res.redirect(env.FRONTEND_URL);
      }
      sendSession(res, 200, { user, ...session });
    } catch (e) {
      next(e);
    }
  })(req, res, next);
}

module.exports = { signup, login, refresh, logout, me, googleStart, googleCallback };
