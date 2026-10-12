import { useEffect, useState } from 'react';
import DifferenceItem from './DifferenceItem.jsx';

const PAGE = 100;
export default function DifferenceList({ items, onCopy }) {
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [items]);
  if (!items.length) return <p className="empty">No differences match the current filter.</p>;
  return (
    <div className="list">
      {items.slice(0, shown).map((d) => <DifferenceItem key={d.id} d={d} onCopy={onCopy} />)}
      {shown < items.length && <button className="ghost more" onClick={() => setShown(shown + PAGE)}>Show more ({items.length - shown} remaining)</button>}
    </div>
  );
}
