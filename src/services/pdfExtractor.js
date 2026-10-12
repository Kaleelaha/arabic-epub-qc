import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/** Parse a page range string like "1-5", "2, 4, 7-10" into a sorted array of page numbers */
export function parsePageRange(rangeStr, totalPages) {
  if (!rangeStr || !rangeStr.trim() || rangeStr.toLowerCase() === 'all') {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set();
  const parts = rangeStr.split(/[,;\s]+/);
  for (const part of parts) {
    if (!part) continue;
    if (part.includes('-')) {
      const [s, e] = part.split('-').map((v) => parseInt(v.trim(), 10));
      const start = Math.max(1, Math.min(isNaN(s) ? 1 : s, totalPages));
      const end = Math.max(1, Math.min(isNaN(e) ? totalPages : e, totalPages));
      for (let p = Math.min(start, end); p <= Math.max(start, end); p++) pages.add(p);
    } else {
      const p = parseInt(part.trim(), 10);
      if (!isNaN(p) && p >= 1 && p <= totalPages) pages.add(p);
    }
  }
  const result = Array.from(pages).sort((a, b) => a - b);
  return result.length ? result : Array.from({ length: totalPages }, (_, i) => i + 1);
}

/** Get quick PDF info (e.g. page count) */
export async function getPdfInfo(file) {
  try {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const numPages = pdf.numPages;
    await pdf.destroy();
    return { numPages };
  } catch (err) {
    return { numPages: 0, error: err.message };
  }
}

/** Extract text from a PDF File, supporting page ranges and running Arabic OCR on scanned pages when enabled. */
export async function extractPdf(file, onProgress = () => {}, options = {}) {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const numPages = pdf.numPages;
  const targetPages = options.pageRange
    ? parsePageRange(options.pageRange, numPages)
    : Array.from({ length: numPages }, (_, i) => i + 1);

  const pagesMap = new Map();
  const lowTextPages = [];

  for (let idx = 0; idx < targetPages.length; idx++) {
    const p = targetPages[idx];
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    let line = '', prev = null;
    for (const it of content.items) {
      if (!('str' in it)) continue;
      if (prev && line && !/\s$/.test(line) && !/^\s/.test(it.str)) {
        const h = Math.abs(it.transform[3]) || 10;
        const gap = Math.min(Math.abs(it.transform[4] - (prev.transform[4] + prev.width)),
                             Math.abs(prev.transform[4] - (it.transform[4] + it.width)));
        if (gap > h * 0.15) line += ' ';
      }
      line += it.str;
      if (it.hasEOL) { line += '\n'; prev = null; } else prev = it;
    }
    pagesMap.set(p, line);
    const cleanChars = line.replace(/\s/g, '').length;
    if (cleanChars < 15) {
      lowTextPages.push(p);
    }
    const maxProg = options.enableOcr ? 0.35 : 1.0;
    onProgress(((idx + 1) / targetPages.length) * maxProg, `Reading PDF page ${p} of ${numPages}…`);
  }

  const selectedCount = targetPages.length;
  let lines = targetPages.map((p) => pagesMap.get(p) || '');
  let text = lines.join('\n');
  let chars = text.replace(/\s/g, '').length;
  const isOverallScanned = chars < 20 * selectedCount;

  // Run Arabic OCR if enabled and the selected pages have little to no text
  if (options.enableOcr && (isOverallScanned || lowTextPages.length > 0)) {
    const pagesToOcr = isOverallScanned ? targetPages : lowTextPages;
    if (pagesToOcr.length > 0) {
      onProgress(0.35, 'Initializing Arabic OCR engine…');
      try {
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker(['ara', 'eng']);
        for (let i = 0; i < pagesToOcr.length; i++) {
          const p = pagesToOcr[i];
          const pct = 0.35 + ((i + 1) / pagesToOcr.length) * 0.65;
          onProgress(pct, `Running OCR on page ${p} (${i + 1}/${pagesToOcr.length})…`);

          const page = await pdf.getPage(p);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext('2d');
          await page.render({ canvasContext: ctx, viewport }).promise;

          const { data } = await worker.recognize(canvas);
          const ocrText = (data && data.text) ? data.text.trim() : '';
          if (ocrText) {
            const existing = pagesMap.get(p) || '';
            pagesMap.set(p, existing && existing.trim() ? existing + '\n' + ocrText : ocrText);
          }
        }
        await worker.terminate();
      } catch (ocrErr) {
        console.warn('OCR processing encountered an issue, proceeding with selectable text:', ocrErr);
      }
      lines = targetPages.map((p) => pagesMap.get(p) || '');
      text = lines.join('\n');
      chars = text.replace(/\s/g, '').length;
    }
  }

  await pdf.destroy();
  return {
    text,
    pages: numPages,
    selectedPages: targetPages,
    pageTexts: targetPages.map((p) => ({ page: p, text: pagesMap.get(p) || '' })),
    chars,
    scanned: chars === 0
  };
}

