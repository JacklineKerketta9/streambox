// Dev seed: demo catalog + an admin user. Safe to run repeatedly.
// Videos are public HLS test streams, used only for demo playback.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const BBB = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'; // Big Buck Bunny (Blender, CC-BY)
const BIPBOP = 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8';

// [name, year, minutes, popularity, genres, video, description]
const TITLES = [
  ['Big Buck Bunny', 2008, 10, 100, ['Animation', 'Comedy'], BBB, 'A giant rabbit takes revenge on three bullying rodents. Open movie by the Blender Foundation.'],
  ['Neon Harbor', 2021, 112, 92, ['Action', 'Thriller'], BIPBOP, 'A courier races through a rain-soaked port city with a package everyone wants.'],
  ['The Last Signal', 2020, 128, 88, ['Sci-Fi', 'Drama'], BBB, 'A lone engineer picks up a transmission that should not exist.'],
  ['Paper Moons', 2019, 98, 75, ['Drama', 'Romance'], BIPBOP, 'Two strangers keep missing each other across one long winter.'],
  ['Code Red Kitchen', 2022, 94, 81, ['Comedy'], BBB, 'A failing restaurant stumbles into a viral cooking competition.'],
  ['Deep Current', 2018, 105, 70, ['Documentary'], BIPBOP, 'Divers follow a hidden river that flows along the ocean floor.'],
  ['Orbit Seven', 2023, 119, 95, ['Sci-Fi', 'Action'], BBB, 'The crew of a failing station has seven hours to reach the next orbit.'],
  ['Midnight Bakery', 2017, 90, 60, ['Comedy', 'Romance'], BIPBOP, 'Two rival bakers share one oven and one very long night.'],
  ['Iron Meridian', 2022, 134, 90, ['Action', 'Drama'], BBB, 'A retired surveyor is pulled back to map a border nobody agrees on.'],
  ['Quiet Fields', 2016, 101, 55, ['Drama'], BIPBOP, 'A family farm, three generations, and one decision about the land.'],
  ['Pixel Pirates', 2021, 88, 78, ['Animation', 'Comedy'], BBB, 'Game characters escape their console and sail into the real world.'],
  ['Zero Gravity Chef', 2024, 97, 83, ['Documentary', 'Comedy'], BIPBOP, 'What does it take to cook a real meal in space?'],
];

async function main() {
  if ((await prisma.title.count()) === 0) {
    for (const [name, year, durationMin, popularity, genres, videoUrl, description] of TITLES) {
      await prisma.title.create({
        data: {
          name, year, durationMin, popularity, videoUrl, description,
          genres: { create: genres.map((g) => ({ genre: { connectOrCreate: { where: { name: g }, create: { name: g } } } })) },
        },
      });
    }
    console.log(`Seeded ${TITLES.length} titles`);
  } else {
    console.log('Titles already exist, skipping');
  }

  if (process.env.NODE_ENV !== 'production') {
    const email = 'admin@streambox.dev';
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: 'Admin', role: 'admin', passwordHash: await bcrypt.hash('admin1234', 10) },
    });
    console.log(`Admin user ready: ${email} / admin1234 (dev only)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
