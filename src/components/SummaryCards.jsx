export default function SummaryCards({ stats }) {
  const items = [['Total differences', stats.total], ['Missing in EPUB', stats.missing], ['Extra in EPUB', stats.extra],
    ['Changed text', stats.changed], ['Possible spelling issues', stats.spelling], ['Chapters with differences', stats.chapters]];
  return <div className="summary">{items.map(([l, n]) => <div className="card stat" key={l}><b>{n}</b><span>{l}</span></div>)}</div>;
}
