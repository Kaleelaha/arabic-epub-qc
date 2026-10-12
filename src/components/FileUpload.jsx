import { useRef, useState } from 'react';
import { Upload, FileText, X } from 'lucide-react';

const size = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.ceil(b / 1024) + ' KB');

export default function FileUpload({
  title,
  ext = '.pdf',
  file,
  onFile,
  onRemove,
  onError,
  disabled,
  pageRange,
  onPageRangeChange,
  totalPages,
}) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const allowed = ext.split(',').map((x) => x.trim().toLowerCase());

  const take = (f) => {
    if (!f) return;
    const fExt = '.' + f.name.split('.').pop().toLowerCase();
    if (!allowed.some((a) => fExt.endsWith(a))) {
      return onError(`"${f.name}" is not a supported file type (${ext}).`);
    }
    if (!f.size) return onError(`"${f.name}" is empty.`);
    onFile(f);
  };

  const isPdf = file && file.name.toLowerCase().endsWith('.pdf');

  return (
    <section className="card">
      <div className="card-header">
        <h2>{title}</h2>
        {file && <span className="ext-badge">{file.name.split('.').pop().toUpperCase()}</span>}
      </div>
      {file ? (
        <>
          <div className="file">
            <FileText size={20} />
            <div>
              <strong dir="auto">{file.name}</strong>
              <small>
                {size(file.size)}
                {isPdf && totalPages > 0 ? ` • ${totalPages} pages` : ''}
              </small>
            </div>
            <button className="ghost" onClick={onRemove} disabled={disabled}>
              <X size={14} /> Remove
            </button>
          </div>

          {isPdf && onPageRangeChange && (
            <div className="part-selector">
              <div className="part-header">
                <strong>Required Part (Pages):</strong>
                <span className="part-hint">
                  {pageRange ? `Selected: ${pageRange}` : 'Currently comparing all pages'}
                </span>
              </div>
              <div className="range-row">
                <input
                  type="text"
                  className="range-input"
                  placeholder={totalPages ? `e.g. 1-${Math.min(5, totalPages)} or 2,4` : 'e.g. 1-5'}
                  value={pageRange || ''}
                  onChange={(e) => onPageRangeChange(e.target.value)}
                  disabled={disabled}
                />
                {pageRange ? (
                  <button
                    type="button"
                    className="ghost btn-sm"
                    onClick={() => onPageRangeChange('')}
                    disabled={disabled}
                  >
                    Reset to All
                  </button>
                ) : (
                  <span className="all-badge">All Pages</span>
                )}
              </div>
              <small className="range-tip">
                Enter page numbers or ranges (e.g. <code>1-5</code> or <code>1, 3, 7</code>) to check only that part.
              </small>
            </div>
          )}
        </>
      ) : (
        <div
          className={'drop' + (over ? ' over' : '')}
          role="button"
          tabIndex={0}
          onClick={() => input.current.click()}
          onKeyDown={(e) => e.key === 'Enter' && input.current.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            take(e.dataTransfer.files[0]);
          }}
        >
          <Upload size={24} />
          <span>Drop a {ext.replace(',', ' or ')} file here or click to browse</span>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept={ext}
        hidden
        onChange={(e) => {
          take(e.target.files[0]);
          e.target.value = '';
        }}
      />
    </section>
  );
}

