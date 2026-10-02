const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const env = require('../../config/env');
const logger = require('../../config/logger');
const prisma = require('../../db/prisma');
const AppError = require('../../utils/AppError');
const { signAccessToken, generateRefreshToken, hashToken } = require('./tokens');

const DAY_MS = 24 * 60 * 60 * 1000;

const toPublicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role });

// Creates an access token + a new refresh token (stored hashed) in a token family.
async function issueSession(user, familyId = crypto.randomUUID()) {
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      familyId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS),
    },
  });
  return { accessToken: signAccessToken(user), refreshToken };
}

async function signup({ email, password, name }) {
  const normalized = email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) throw new AppError(409, 'Email already registered');

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const user = await prisma.user.create({ data: { email: normalized, name, passwordHash } });
    return { user, ...(await issueSession(user)) };
  } catch (err) {
    if (err.code === 'P2002') throw new AppError(409, 'Email already registered'); // race condition
    throw err;
  }
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // Same error for "no user", "OAuth-only user" and "wrong password" to avoid leaking which emails exist.
  const ok = user && user.passwordHash && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) throw new AppError(401, 'Invalid email or password');
  return { user, ...(await issueSession(user)) };
}

// Refresh-token rotation with reuse detection.
async function rotateRefreshToken(rawToken) {
  if (!rawToken) throw new AppError(401, 'Missing refresh token');
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  // Atomic: the UPDATE only matches a still-valid token, so only one request can consume it.
  const { count } = await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
    data: { revokedAt: now },
  });
  const token = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (count !== 1) {
    if (token && token.revokedAt) {
      // An already-used token came back: assume theft and revoke the whole family.
      await prisma.refreshToken.updateMany({
        where: { familyId: token.familyId, revokedAt: null },
        data: { revokedAt: now },
      });
      logger.warn({ userId: token.userId, familyId: token.familyId }, 'Refresh token reuse detected');
    }
    throw new AppError(401, 'Invalid refresh token');
  }

  const user = await prisma.user.findUnique({ where: { id: token.userId } });
  if (!user) throw new AppError(401, 'Invalid refresh token');
  return { user, ...(await issueSession(user, token.familyId)) };
}

async function logout(rawToken) {
  if (!rawToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function getUserById(id) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(404, 'User not found');
  return user;
}

// OAuth: find by provider identity, else link by verified email, else create.
async function findOrCreateOAuthUser({ provider, providerUserId, email, emailVerified, name }) {
  const identity = await prisma.authIdentity.findUnique({
    where: { provider_providerUserId: { provider, providerUserId } },
    include: { user: true },
  });
  if (identity) return identity.user;

  if (!email) throw new AppError(400, 'OAuth provider did not return an email');
  const normalized = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) {
    // Only link if the provider vouches for the email; otherwise anyone could claim someone else's account.
    if (!emailVerified) {
      throw new AppError(409, 'An account with this email exists. Log in with your password first.');
    }
    await prisma.authIdentity.create({
      data: { userId: existing.id, provider, providerUserId, emailVerified },
    });
    return existing;
  }

  // Nested create runs as one transaction: user + identity together.
  return prisma.user.create({
    data: { email: normalized, name, identities: { create: { provider, providerUserId, emailVerified } } },
  });
}

// MySQL has no TTL indexes, so expired tokens are cleaned up periodically (see server.js).
async function deleteExpiredRefreshTokens() {
  const { count } = await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return count;
}

module.exports = {
  toPublicUser,
  issueSession,
  signup,
  login,
  rotateRefreshToken,
  logout,
  getUserById,
  findOrCreateOAuthUser,
  deleteExpiredRefreshTokens,
};
