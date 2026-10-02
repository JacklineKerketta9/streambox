import { useList } from '../lists.jsx';
import TitleCard from '../components/TitleCard.jsx';

export default function MyList() {
  const { items, loaded } = useList();

  if (!loaded) return <div className="center muted">Loading…</div>;
  return (
    <div className="pad">
      <h2>My List</h2>
      {!items.length && <p className="muted">Nothing here yet. Use the + button on any title.</p>}
      <div className="grid">
        {items.map((title) => <TitleCard key={title.id} title={title} />)}
      </div>
    </div>
  );
}
