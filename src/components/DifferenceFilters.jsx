const TABS = [['all', 'All Differences'], ['missing', 'Missing in EPUB'], ['extra', 'Extra in EPUB'],
  ['changed', 'Changed Text'], ['spelling', 'Possible Spelling Issues']];
export default function DifferenceFilters({ filter, onFilter, stats, query, onQuery }) {
  const n = (k) => (k === 'all' ? stats.total : stats[k]);
  return (
    <div className="filters">
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => onFilter(k)}>{l} ({n(k)})</button>
        ))}
      </div>
      <input type="search" dir="auto" placeholder="Search differences or chapters…" value={query} onChange={(e) => onQuery(e.target.value)} />
    </div>
  );
}
