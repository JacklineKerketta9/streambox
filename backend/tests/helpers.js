const prisma = require('../src/db/prisma');

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
}

module.exports = { resetDb };
