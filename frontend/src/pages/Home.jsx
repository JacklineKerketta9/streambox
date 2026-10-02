import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api.js';
import Hero from '../components/Hero.jsx';
import Row from '../components/Row.jsx';

export default function Home() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/home').then((d) => setRows(d.rows)).catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <p className="error pad">{error}</p>;
  if (!rows) return <div className="center muted">Loading…</div>;
  if (!rows.length) {
    return <p className="muted pad">Nothing here yet. Run <code>docker compose exec api npm run db:seed</code> to add demo titles.</p>;
  }

  const featured = rows.find((r) => r.id === 'trending')?.items[0];
  return (
    <>
      {featured && <Hero title={featured} />}
      {rows.map((r) => <Row key={r.id} title={r.title} items={r.items} />)}
    </>
  );
}
