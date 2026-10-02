const prisma = require('../../db/prisma');
const AppError = require('../../utils/AppError');

const withGenres = { genres: { include: { genre: true } } };

// Public shape: never exposes videoUrl (it is only handed out by the playback endpoint).
const formatTitle = (t) => ({
  id: t.id,
  name: t.name,
  description: t.description,
  year: t.year,
  durationMin: t.durationMin,
  popularity: t.popularity,
  posterUrl: t.posterUrl,
  playable: Boolean(t.videoUrl),
  genres: (t.genres || []).map((g) => g.genre.name),
});

const formatAdminTitle = (t) => ({ ...formatTitle(t), videoUrl: t.videoUrl });

const genreWrites = (names = []) =>
  names.map((name) => ({ genre: { connectOrCreate: { where: { name }, create: { name } } } }));

// NOTE: LIKE-based search for now; swap for a FULLTEXT index / Meilisearch later.
async function listTitles({ q, genre, page, limit }) {
  const where = {};
  if (q) where.OR = [{ name: { contains: q } }, { description: { contains: q } }];
  if (genre) where.genres = { some: { genre: { name: genre } } };

  const [items, total] = await Promise.all([
    prisma.title.findMany({
      where,
      include: withGenres,
      orderBy: [{ popularity: 'desc' }, { name: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.title.count({ where }),
  ]);
  return { items: items.map(formatTitle), page, total };
}

async function getTitle(id) {
  const title = await prisma.title.findUnique({ where: { id }, include: withGenres });
  if (!title) throw new AppError(404, 'Title not found');
  return formatTitle(title);
}

// Home feed rows: Continue Watching, My List (per user), Trending, then one row per genre.
async function getHome(userId) {
  const rows = [];

  if (userId) {
    const history = await prisma.watchHistory.findMany({
      where: { userId, positionSec: { gt: 0 } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: { title: { include: withGenres } },
    });
    const inProgress = history.filter((h) => !h.durationSec || h.positionSec < h.durationSec * 0.95);
    if (inProgress.length) {
      rows.push({
        id: 'continue',
        title: 'Continue Watching',
        items: inProgress.map((h) => ({
          ...formatTitle(h.title),
          progress: h.durationSec ? h.positionSec / h.durationSec : 0,
        })),
      });
    }

    const list = await prisma.myListItem.findMany({
      where: { userId },
      orderBy: { addedAt: 'desc' },
      take: 20,
      include: { title: { include: withGenres } },
    });
    if (list.length) rows.push({ id: 'my-list', title: 'My List', items: list.map((i) => formatTitle(i.title)) });
  }

  const trending = await prisma.title.findMany({ orderBy: { popularity: 'desc' }, take: 20, include: withGenres });
  if (trending.length) rows.push({ id: 'trending', title: 'Trending Now', items: trending.map(formatTitle) });

  const genres = await prisma.genre.findMany({
    orderBy: { name: 'asc' },
    include: {
      titles: {
        take: 20,
        orderBy: { title: { popularity: 'desc' } },
        include: { title: { include: withGenres } },
      },
    },
  });
  for (const g of genres) {
    if (g.titles.length) rows.push({ id: `genre-${g.id}`, title: g.name, items: g.titles.map((t) => formatTitle(t.title)) });
  }
  return rows;
}

async function createTitle({ genres, ...data }) {
  const title = await prisma.title.create({
    data: { ...data, genres: { create: genreWrites(genres) } },
    include: withGenres,
  });
  return formatAdminTitle(title);
}

async function updateTitle(id, { genres, ...data }) {
  try {
    const title = await prisma.title.update({
      where: { id },
      data: { ...data, ...(genres ? { genres: { deleteMany: {}, create: genreWrites(genres) } } : {}) },
      include: withGenres,
    });
    return formatAdminTitle(title);
  } catch (err) {
    if (err.code === 'P2025') throw new AppError(404, 'Title not found');
    throw err;
  }
}

async function deleteTitle(id) {
  try {
    await prisma.title.delete({ where: { id } });
  } catch (err) {
    if (err.code === 'P2025') throw new AppError(404, 'Title not found');
    throw err;
  }
}

module.exports = { formatTitle, withGenres, listTitles, getTitle, getHome, createTitle, updateTitle, deleteTitle };
