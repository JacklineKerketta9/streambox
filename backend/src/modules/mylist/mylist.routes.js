const express = require('express');
const { z } = require('zod');
const prisma = require('../../db/prisma');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const { formatTitle, withGenres } = require('../catalog/catalog.service');

const router = express.Router();

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const rows = await prisma.myListItem.findMany({
    where: { userId: req.user.id },
    orderBy: { addedAt: 'desc' },
    include: { title: { include: withGenres } },
  });
  res.json({ items: rows.map((r) => formatTitle(r.title)) });
}));

router.post('/', authenticate, validate(z.object({ titleId: z.string().min(1) })), asyncHandler(async (req, res) => {
  const { titleId } = req.body;
  if (!(await prisma.title.findUnique({ where: { id: titleId } }))) throw new AppError(404, 'Title not found');
  await prisma.myListItem.upsert({
    where: { userId_titleId: { userId: req.user.id, titleId } },
    create: { userId: req.user.id, titleId },
    update: {},
  });
  res.status(201).json({ ok: true });
}));

router.delete('/:titleId', authenticate, asyncHandler(async (req, res) => {
  await prisma.myListItem.deleteMany({ where: { userId: req.user.id, titleId: req.params.titleId } });
  res.status(204).end();
}));

module.exports = router;
