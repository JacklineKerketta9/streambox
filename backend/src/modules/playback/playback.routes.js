const express = require('express');
const { z } = require('zod');
const prisma = require('../../db/prisma');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const crypto = require('crypto');
const env = require('../../config/env');
const { getObject } = require('../../storage/s3');
const { getProgress, saveProgress } = require('./progress');

const router = express.Router();

const progressSchema = z.object({
  titleId: z.string().min(1),
  positionSec: z.number().int().min(0),
  durationSec: z.number().int().min(0),
});

const signMedia = (assetId, key, expires) => crypto
  .createHmac('sha256', env.JWT_ACCESS_SECRET)
  .update(`${assetId}:${key}:${expires}`)
  .digest('hex');
const mediaUrl = (assetId, key, expires = Math.floor(Date.now() / 1000) + 300) =>
  `/media/${assetId}/${key.split('/').map(encodeURIComponent).join('/')}?expires=${expires}&signature=${signMedia(assetId, key, expires)}`;

// Authenticated playback returns a short-lived signed manifest route for generated assets.
router.get('/playback/:titleId', authenticate, asyncHandler(async (req, res) => {
  const title = await prisma.title.findUnique({ where: { id: req.params.titleId } });
  if (!title) throw new AppError(404, 'Title not found');
  if (!title.videoUrl) throw new AppError(404, 'Video not available yet');
  const history = await getProgress(req.user.id, title.id);
  const asset = await prisma.videoAsset.findFirst({ where: { titleId: title.id, status: 'ready', manifestKey: { not: null } }, orderBy: { updatedAt: 'desc' } });
  if (!asset) return res.json({ url: title.videoUrl, positionSec: history ? history.positionSec : 0 });
  const expires = Math.floor(Date.now() / 1000) + 300;
  res.json({ url: mediaUrl(asset.id, asset.manifestKey, expires), positionSec: history ? history.positionSec : 0, expiresAt: expires });
}));

router.post('/progress', authenticate, validate(progressSchema), asyncHandler(async (req, res) => {
  const { titleId, positionSec, durationSec } = req.body;
  if (!(await prisma.title.findUnique({ where: { id: titleId } }))) throw new AppError(404, 'Title not found');
  await saveProgress(req.user.id, titleId, positionSec, durationSec);
  res.status(204).end();
}));

router.get('/progress/:titleId', authenticate, asyncHandler(async (req, res) => {
  const h = await getProgress(req.user.id, req.params.titleId);
  res.json({ positionSec: h ? h.positionSec : 0, durationSec: h ? h.durationSec : 0 });
}));

// Signed HLS delivery. Private object storage stays private; child playlists and segments
// receive their own URLs with the same expiry as the manifest.
router.get('/media/:assetId/*', asyncHandler(async (req, res) => {
  const assetId = req.params.assetId;
  const key = req.params[0];
  const expires = Number(req.query.expires);
  const supplied = String(req.query.signature || '');
  if (!key || !Number.isSafeInteger(expires) || expires < Math.floor(Date.now() / 1000) || expires > Math.floor(Date.now() / 1000) + 600) {
    throw new AppError(403, 'Playback URL expired or invalid');
  }
  const expected = signMedia(assetId, key, expires);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new AppError(403, 'Playback URL expired or invalid');
  const asset = await prisma.videoAsset.findUnique({ where: { id: assetId } });
  if (!asset || asset.status !== 'ready' || !asset.manifestKey || !key.startsWith(`hls/${assetId}/`)) throw new AppError(404, 'Media not found');
  const object = await getObject(key);
  if (key.endsWith('.m3u8')) {
    const chunks = [];
    for await (const chunk of object.Body) chunks.push(chunk);
    const playlist = Buffer.concat(chunks).toString('utf8').split(/\r?\n/).map((line) => {
      if (!line || line.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="${mediaUrl(assetId, `${key.slice(0, key.lastIndexOf('/') + 1)}${uri}`, expires)}"`);
      const childKey = `${key.slice(0, key.lastIndexOf('/') + 1)}${line}`;
      return mediaUrl(assetId, childKey, expires);
    }).join('\n');
    res.type('application/vnd.apple.mpegurl').set('Cache-Control', 'private, no-store').send(playlist);
    return;
  }
  res.type(object.ContentType || 'application/octet-stream');
  res.set('Cache-Control', 'private, no-store');
  object.Body.pipe(res);
}));

module.exports = router;
