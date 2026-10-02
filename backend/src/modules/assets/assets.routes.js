const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const assets = require('./assets.service');

const router = express.Router(); // mounted at /admin
const adminOnly = [authenticate, authenticate.requireRole('admin')];

const uploadSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().regex(/^video\//, 'contentType must be a video type'),
});

router.post('/titles/:id/upload', ...adminOnly, validate(uploadSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await assets.createUpload(req.params.id, req.body));
}));

router.get('/assets', ...adminOnly, asyncHandler(async (_req, res) => {
  res.json({ assets: await assets.listAssets() });
}));

router.get('/assets/:id', ...adminOnly, asyncHandler(async (req, res) => {
  res.json({ asset: await assets.getAsset(req.params.id) });
}));

router.post('/assets/:id/complete', ...adminOnly, asyncHandler(async (req, res) => {
  res.status(202).json({ asset: await assets.completeUpload(req.params.id) });
}));

router.post('/assets/:id/retry', ...adminOnly, asyncHandler(async (req, res) => {
  res.status(202).json({ asset: await assets.retry(req.params.id) });
}));

module.exports = router;
