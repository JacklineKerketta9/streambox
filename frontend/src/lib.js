const hue = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

// Placeholder artwork until titles have real posters.
export const artwork = (name, angle = 135) => {
  const h = hue(name);
  return `linear-gradient(${angle}deg, hsl(${h} 55% 38%), hsl(${(h + 55) % 360} 55% 12%))`;
};

export const formatDuration = (min) => (min ? `${Math.floor(min / 60)}h ${min % 60}m`.replace(/^0h /, '') : '');
