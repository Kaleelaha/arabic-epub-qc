import { useMemo, useRef, useState } from 'react';
import { Download, Trash2, GitCompare, ClipboardCopy, FileCheck2, AlertTriangle, CheckCircle2, FileText, AlignLeft, FileSpreadsheet } from 'lucide-react';
import Header from './components/Header.jsx';
import FileUpload from './components/FileUpload.jsx';
import ComparisonOptions from './components/ComparisonOptions.jsx';
import ProgressIndicator from './components/ProgressIndicator.jsx';
import SummaryCards from './components/SummaryCards.jsx';
import DifferenceFilters from './components/DifferenceFilters.jsx';
import DifferenceList from './components/DifferenceList.jsx';
import { extractPdf, getPdfInfo } from './services/pdfExtractor.js';
import { extractEpub } from './services/epubExtractor.js';
import { copyText, formatDifference, formatAll, correctionReport, downloadCSV, downloadExcel, downloadFullCSV } from './services/reportExporter.js';

const DEFAULTS = { ignoreDiacritics: true, normalizeWhitespace: true, byChapter: true, enableOcr: true };

export default function App() {
  const [mode, setMode] = useState('files'); // 'files' | 'snippets'
  const [pdf, setPdf] = useState(null);
  const [epub, setEpub] = useState(null);
  const [leftRange, setLeftRange] = useState('');
  const [rightRange, setRightRange] = useState('');
  const [leftPages, setLeftPages] = useState(0);
  const [rightPages, setRightPages] = useState(0);
  const [leftText, setLeftText] = useState('');
  const [rightText, setRightText] = useState('');
  const [options, setOptions] = useState(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState({ value: 0, label: '' });
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState('');
  const worker = useRef(null);

  const stopWorker = () => { worker.current?.terminate(); worker.current = null; };
  const notify = (m) => { setToast(m); setTimeout(() => setToast(''), 1800); };
  const dropResults = () => { stopWorker(); setResult(null); setError(''); setBusy(false); setQuery(''); setFilter('all'); };
  const clearAll = () => {
    dropResults();
    setPdf(null);
    setEpub(null);
    setLeftRange('');
    setRightRange('');
    setLeftPages(0);
    setRightPages(0);
    setLeftText('');
    setRightText('');
    setOptions(DEFAULTS);
  };

  const handleLeftFile = async (f) => {
    dropResults();
    setPdf(f);
    if (f && f.name.toLowerCase().endsWith('.pdf')) {
      const info = await getPdfInfo(f);
      setLeftPages(info.numPages);
    } else {
      setLeftPages(0);
    }
  };

  const handleRightFile = async (f) => {
    dropResults();
    setEpub(f);
    if (f && f.name.toLowerCase().endsWith('.pdf')) {
      const info = await getPdfInfo(f);
      setRightPages(info.numPages);
    } else {
      setRightPages(0);
    }
  };

  const compare = async () => {
    dropResults();
    setBusy(true);
    try {
      let sourceText = '';
      let targetChapters = [];

      if (mode === 'snippets') {
        if (!leftText.trim() || !rightText.trim()) {
          throw new Error('Please enter text in both the Left and Right text boxes to compare.');
        }
        sourceText = leftText.trim();
        targetChapters = [{ title: 'Target Snippet', text: rightText.trim() }];
      } else {
        if (!pdf || !epub) {
          throw new Error('Please select both Left (Original) and Right (Target) files to compare.');
        }

        // Process Left File (Original)
        const isLeftPdf = pdf.name.toLowerCase().endsWith('.pdf');
        if (isLeftPdf) {
          setProg({ value: 2, label: 'Reading Left PDF (Required Part)…' });
          const p = await extractPdf(
            pdf,
            (f, l) => setProg({ value: 2 + f * 22, label: l || 'Reading Left PDF…' }),
            { ...options, pageRange: leftRange }
          );
          if (!p.text || !p.text.trim()) {
            throw new Error('No extractable text found in Left PDF. Check the selected page range or enable OCR.');
          }
          sourceText = p.text;
        } else {
          setProg({ value: 2, label: 'Reading Left EPUB…' });
          const e = await extractEpub(pdf);
          sourceText = e.chapters.map((c) => c.text).join('\n\n');
        }

        // Process Right File (PDF or EPUB)
        const isRightPdf = epub.name.toLowerCase().endsWith('.pdf');
        if (isRightPdf) {
          setProg({ value: 25, label: 'Reading Right PDF (Required Part)…' });
          const p = await extractPdf(
            epub,
            (f, l) => setProg({ value: 25 + f * 22, label: l || 'Reading Right PDF…' }),
            { ...options, pageRange: rightRange }
          );
          if (!p.text || !p.text.trim()) {
            throw new Error('No extractable text found in Right PDF. Check the selected page range or enable OCR.');
          }
          targetChapters = p.pageTexts && p.pageTexts.length
            ? p.pageTexts.map((pt) => ({ title: `Page ${pt.page}`, text: pt.text }))
            : [{ title: epub.name, text: p.text }];
        } else {
          setProg({ value: 25, label: 'Reading Right EPUB…' });
          const e = await extractEpub(epub);
          targetChapters = e.chapters;
        }
      }

      setProg({ value: 48, label: 'Starting comparison…' });
      const w = new Worker(new URL('./workers/comparisonWorker.js', import.meta.url), { type: 'module' });
      worker.current = w;
      w.onmessage = ({ data }) => {
        if (data.type === 'progress') {
          setProg({ value: 48 + data.value * 0.52, label: data.label });
        } else {
          stopWorker();
          setBusy(false);
          if (data.type === 'done') setResult(data.result);
          else setError(data.message);
        }
      };
      w.onerror = () => {
        stopWorker();
        setBusy(false);
        setError('The comparison failed unexpectedly. The files may be too large.');
      };
      w.postMessage({ pdfText: sourceText, chapters: targetChapters, options });
    } catch (err) {
      setBusy(false);
      setError(err.message || 'Processing failed.');
    }
  };

  const visible = useMemo(() => {
    if (!result) return [];
    const q = query.trim().toLowerCase();
    return result.diffs.filter((d) => (filter === 'all' || d.category === filter) &&
      (!q || [d.chapter, d.pdfText, d.epubText, d.before, d.after].some((s) => s.toLowerCase().includes(q))));
  }, [result, filter, query]);

  const copy = async (text, msg) => { await copyText(text); notify(msg); };
  const ready = mode === 'snippets' ? (leftText.trim() && rightText.trim() && !busy) : (pdf && epub && !busy);

  return (
    <>
      <Header />
      <main>
        <div className="mode-bar">
          <button
            type="button"
            className={'mode-btn' + (mode === 'files' ? ' active' : '')}
            onClick={() => { dropResults(); setMode('files'); }}
          >
            <FileText size={16} /> File Comparison (PDF / EPUB)
          </button>
          <button
            type="button"
            className={'mode-btn' + (mode === 'snippets' ? ' active' : '')}
            onClick={() => { dropResults(); setMode('snippets'); }}
          >
            <AlignLeft size={16} /> Direct Text Snippet
          </button>
        </div>

        {mode === 'files' ? (
          <div className="uploads">
            <FileUpload
              title="Left (Original PDF)"
              ext=".pdf,.epub"
              file={pdf}
              disabled={busy}
              onFile={handleLeftFile}
              onRemove={() => { dropResults(); setPdf(null); setLeftPages(0); setLeftRange(''); }}
              onError={setError}
              pageRange={leftRange}
              onPageRangeChange={setLeftRange}
              totalPages={leftPages}
            />
            <FileUpload
              title="Right (Compared PDF or EPUB)"
              ext=".pdf,.epub"
              file={epub}
              disabled={busy}
              onFile={handleRightFile}
              onRemove={() => { dropResults(); setEpub(null); setRightPages(0); setRightRange(''); }}
              onError={setError}
              pageRange={rightRange}
              onPageRangeChange={setRightRange}
              totalPages={rightPages}
            />
          </div>
        ) : (
          <div className="snippet-grid">
            <section className="card">
              <h2>Left: Original PDF Text (Required Part)</h2>
              <textarea
                className="snippet-area"
                dir="rtl"
                placeholder="Paste the required Arabic text from the original PDF here…"
                value={leftText}
                onChange={(e) => { dropResults(); setLeftText(e.target.value); }}
                disabled={busy}
              />
            </section>
            <section className="card">
              <h2>Right: Target Text (Required Part)</h2>
              <textarea
                className="snippet-area"
                dir="rtl"
                placeholder="Paste the required Arabic text from the target PDF or EPUB here…"
                value={rightText}
                onChange={(e) => { dropResults(); setRightText(e.target.value); }}
                disabled={busy}
              />
            </section>
          </div>
        )}

        <ComparisonOptions options={options} onChange={setOptions} disabled={busy} />

        <div className="actions">
          <button className="primary" disabled={!ready} onClick={compare}>
            <GitCompare size={16} /> Compare Required Parts
          </button>
          <button className="ghost" onClick={clearAll}>
            <Trash2 size={14} /> Clear All
          </button>
        </div>

        {!pdf && !epub && !leftText && !rightText && !result && !error && (
          <p className="empty">
            Select files or paste required text parts to compare. You can specify page ranges (e.g. 1-5) on both sides.
          </p>
        )}

        {busy && <ProgressIndicator {...prog} />}
        {error && <div className="msg err" role="alert"><AlertTriangle size={18} /> {error}</div>}

        {result && (
          <>
            <div className="msg ok">
              <CheckCircle2 size={18} /> {result.stats.total ? 'Comparison finished.' : 'Comparison finished: no differences were found.'}
            </div>
            {result.warnings.map((w) => <div className="msg warn" key={w}><AlertTriangle size={18} /> {w}</div>)}
            <SummaryCards stats={result.stats} />
            <div className="actions">
              <button className="primary" onClick={() => downloadExcel(visible)}>
                <FileSpreadsheet size={15} /> Export Excel (.xlsx)
              </button>
              <button className="ghost" onClick={() => downloadCSV(visible)}>
                <Download size={14} /> Export CSV (.csv)
              </button>
              <button className="ghost" onClick={() => downloadFullCSV(visible)}>
                <FileText size={14} /> Full Details (CSV)
              </button>
              <button className="ghost" onClick={() => copy(formatAll(visible), 'Copied all listed differences')}>
                <ClipboardCopy size={14} /> Copy All Differences
              </button>
              <button className="ghost" onClick={() => copy(correctionReport(visible), 'Copied correction report')}>
                <FileCheck2 size={14} /> Copy Correction Report
              </button>
            </div>
            <DifferenceFilters filter={filter} onFilter={setFilter} stats={result.stats} query={query} onQuery={setQuery} />
            <DifferenceList items={visible} onCopy={(d) => copy(formatDifference(d), 'Copied')} />
          </>
        )}
      </main>
      {toast && <div className="toast">{toast}</div>}
      <footer>All processing happens locally in your browser. Files are not uploaded or stored.</footer>
    </>
  );
}
