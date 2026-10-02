const hue = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

// Placeholder artwork until titles have real posters.
export const artwork = (name, angle = 135) => {
  const h = hue(name);
  return `linear-gradient(${angle}deg, hsl(${h} 55% 38%), hsl(${(h + 55) % 360} 55% 12%))`;
};

const POSTER_INDEX = new Map([
  ['Big Buck Bunny', 0], ['Neon Harbor', 1], ['The Last Signal', 2], ['Paper Moons', 3],
  ['Code Red Kitchen', 4], ['Deep Current', 5], ['Orbit Seven', 6], ['Midnight Bakery', 7],
  ['Iron Meridian', 8], ['Quiet Fields', 9], ['Pixel Pirates', 10], ['Zero Gravity Chef', 11],
]);

export function posterStyle(title) {
  if (title.posterUrl) return { backgroundImage: `url("${title.posterUrl}")`, backgroundPosition: 'center', backgroundSize: 'cover' };
  const index = POSTER_INDEX.get(title.name);
  if (index === undefined) return { background: artwork(title.name) };
  const column = index % 4;
  const row = Math.floor(index / 4);
  const yPositions = [5.56, 50, 94.44];
  return {
    backgroundImage: 'url("/images/title-poster-sprite.png")',
    backgroundSize: '400% 400%',
    backgroundPosition: `${(column / 3) * 100}% ${yPositions[row]}%`,
  };
}

export const formatDuration = (min) => (min ? `${Math.floor(min / 60)}h ${min % 60}m`.replace(/^0h /, '') : '');
