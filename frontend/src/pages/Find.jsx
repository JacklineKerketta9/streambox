import { useEffect, useState } from 'react';
import { api } from '../api.js';
import TitleCard from '../components/TitleCard.jsx';

export default function Find() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);

  // Debounce so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      api(`/search?q=${encodeURIComponent(q)}`).then((d) => setItems(d.items)).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="pad">
      <input className="search" autoFocus placeholder="Search titles…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="grid">
        {items.map((t) => <TitleCard key={t.id} title={t} />)}
      </div>
      {!items.length && <p className="muted">No results.</p>}
    </div>
  );
}
