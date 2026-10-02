import TitleCard from './TitleCard.jsx';

export default function Row({ title, items }) {
  return (
    <section className="row">
      <h2>{title}</h2>
      <div className="row-items">
        {items.map((t) => (
          <TitleCard key={t.id} title={t} />
        ))}
      </div>
    </section>
  );
}
