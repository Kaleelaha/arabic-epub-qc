const OPTS = [
  ['enableOcr', 'OCR scanned PDF pages', 'Automatically run Arabic OCR when pages have scanned images or no selectable text'],
  ['ignoreDiacritics', 'Ignore diacritics', 'Treat words with and without tashkeel as equal'],
  ['normalizeWhitespace', 'Normalize whitespace', 'Ignore non-breaking spaces and invisible direction marks'],
  ['byChapter', 'Compare by chapter', 'Match each EPUB chapter to the PDF before comparing'],
];
export default function ComparisonOptions({ options, onChange, disabled }) {
  return (
    <section className="card opts">
      {OPTS.map(([k, label, hint]) => (
        <label key={k}>
          <input type="checkbox" checked={options[k]} disabled={disabled} onChange={(e) => onChange({ ...options, [k]: e.target.checked })} />
          <span><strong>{label}</strong><small>{hint}</small></span>
        </label>
      ))}
    </section>
  );
}
