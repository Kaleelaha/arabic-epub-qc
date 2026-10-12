import { Copy } from 'lucide-react';
import { LABELS } from '../services/reportExporter.js';

function Line({ label, d, text }) {
  return (
    <p className="line" dir="rtl">
      <b dir="ltr">{label}</b> {d.before}{' '}
      {text ? <mark>{text}</mark> : <em dir="ltr">— nothing —</em>} {d.after}
    </p>
  );
}
export default function DifferenceItem({ d, onCopy }) {
  return (
    <article className={'diff ' + d.category}>
      <header>
        <span className="chip">{LABELS[d.category]}</span>
        <span className="chap" dir="auto">{d.chapter}</span>
        <button className="ghost" onClick={() => onCopy(d)}><Copy size={14} /> Copy Difference</button>
      </header>
      <Line label="Error text (Target)" d={d} text={d.epubText} />
      <Line label="Want to changed text (Original)" d={d} text={d.pdfText} />
    </article>
  );
}
