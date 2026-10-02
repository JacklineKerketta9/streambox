import { Link } from 'react-router-dom';
import { useList } from '../lists.jsx';
import { artwork } from '../lib.js';

export default function TitleCard({ title }) {
  const { has, toggle } = useList();
  const saved = has(title.id);
  const background = title.posterUrl ? `url(${title.posterUrl}) center/cover` : artwork(title.name);

  return (
    <div className="card">
      <Link to={`/watch/${title.id}`} className="poster" style={{ background }}>
        <span className="poster-name">{title.name}</span>
        {!title.playable && <span className="soon">Coming soon</span>}
        {title.progress > 0 && (
          <div className="bar"><i style={{ width: `${Math.min(100, title.progress * 100)}%` }} /></div>
        )}
      </Link>
      <div className="meta">
        <span className="muted small">{title.year} · {title.genres.slice(0, 2).join(', ')}</span>
        <button className={`icon${saved ? ' on' : ''}`} onClick={() => toggle(title.id)}
          title={saved ? 'Remove from My List' : 'Add to My List'}>
          {saved ? '✓' : '+'}
        </button>
      </div>
    </div>
  );
}
