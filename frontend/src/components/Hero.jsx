import { Link } from 'react-router-dom';
import { useList } from '../lists.jsx';
import { artwork, formatDuration } from '../lib.js';

export default function Hero({ title }) {
  const { has, toggle } = useList();
  return (
    <section className="hero" style={{ background: artwork(title.name, 120) }}>
      <div className="hero-body">
        <p className="eyebrow">Featured</p>
        <h1>{title.name}</h1>
        <p className="muted">
          {[title.year, formatDuration(title.durationMin), title.genres.join(' · ')].filter(Boolean).join('  ·  ')}
        </p>
        <p className="hero-desc">{title.description}</p>
        <div className="hero-actions">
          <Link to={`/watch/${title.id}`} className="btn">▶ Play</Link>
          <button className="btn ghost" onClick={() => toggle(title.id)}>
            {has(title.id) ? '✓ In My List' : '+ My List'}
          </button>
        </div>
      </div>
    </section>
  );
}
