const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const { titleSchema, updateTitleSchema, listQuerySchema } = require('./catalog.schemas');
const catalog = require('./catalog.service');
const { getCachedHome, invalidateHome } = require('./homeCache');

const router = express.Router();
const adminOnly = [authenticate, authenticate.requireRole('admin')];

router.get('/titles', validate.query(listQuerySchema), asyncHandler(async (req, res) => {
  res.json(await catalog.listTitles(req.query));
}));

router.get('/search', validate.query(listQuerySchema), asyncHandler(async (req, res) => {
  res.json(await catalog.listTitles(req.query));
}));

router.get('/titles/:id', asyncHandler(async (req, res) => {
  res.json({ title: await catalog.getTitle(req.params.id) });
}));

router.get('/home', authenticate.optional, asyncHandler(async (req, res) => {
  const userId = req.user && req.user.id;
  res.json({ rows: await getCachedHome(userId, () => catalog.getHome(userId)) });
}));

// ---- admin ----
router.post('/admin/titles', ...adminOnly, validate(titleSchema), asyncHandler(async (req, res) => {
  const title = await catalog.createTitle(req.body);
  await invalidateHome();
  res.status(201).json({ title });
}));

router.put('/admin/titles/:id', ...adminOnly, validate(updateTitleSchema), asyncHandler(async (req, res) => {
  const title = await catalog.updateTitle(req.params.id, req.body);
  await invalidateHome();
  res.json({ title });
}));

router.delete('/admin/titles/:id', ...adminOnly, asyncHandler(async (req, res) => {
  await catalog.deleteTitle(req.params.id);
  await invalidateHome();
  res.status(204).end();
}));

module.exports = router;
