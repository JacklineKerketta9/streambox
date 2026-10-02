const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');

function signAccessToken(user) {
  return jwt.sign({ role: user.role }, env.JWT_ACCESS_SECRET, {
    subject: String(user._id),
    expiresIn: env.ACCESS_TOKEN_TTL,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

// Opaque random string; only its SHA-256 hash is stored in the DB.
function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { signAccessToken, verifyAccessToken, generateRefreshToken, hashToken };
