const prisma = require('../src/db/prisma');
const { getRedis } = require('../src/queue/connection');

// Children before parents (FKs), then everything else.
async function resetDb() {
  await prisma.videoAsset.deleteMany();
  await prisma.watchHistory.deleteMany();
  await prisma.myListItem.deleteMany();
  await prisma.titleGenre.deleteMany();
  await prisma.title.deleteMany();
  await prisma.genre.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.authIdentity.deleteMany();
  await prisma.user.deleteMany();
  await getRedis().flushdb();
}

module.exports = { resetDb };
