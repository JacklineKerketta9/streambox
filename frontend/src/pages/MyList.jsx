import { useEffect, useState } from 'react';
import { api } from '../api.js';
import TitleCard from '../components/TitleCard.jsx';

export default function MyList() {
  const [items, setItems] = useState(null);

  useEffect(() => {
    api('/my-list').then((d) => setItems(d.items)).catch(() => setItems([]));
  }, []);

  if (!items) return <div className="center muted">Loading…</div>;
  return (
    <div className="pad">
      <h2>My List</h2>
      {!items.length && <p className="muted">Nothing here yet. Use the + button on any title.</p>}
      <div className="grid">
        {items.map((t) => <TitleCard key={t.id} title={t} />)}
      </div>
    </div>
  );
}
