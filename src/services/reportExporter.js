import JSZip from 'jszip';

export const LABELS = {
  missing: 'Missing in EPUB',
  extra: 'Extra in EPUB',
  changed: 'Changed text',
  spelling: 'Possible spelling issue'
};

export const getErrorText = (d) => d.epubText || (d.category === 'missing' ? '[Missing]' : '');
export const getWantedText = (d) => d.pdfText || (d.category === 'extra' ? '[Delete]' : '');

export const formatDifference = (d) =>
  `[${d.chapter}] ${LABELS[d.category]}\nError text: ${getErrorText(d)}\nWant to changed text: ${getWantedText(d)}\nContext: ... ${d.before} [ ${getErrorText(d)} ] ${d.after} ...`;

export const formatAll = (list) => list.map(formatDifference).join('\n\n');

/** Plain-language correction instructions grouped by chapter. */
export function correctionReport(list) {
  const by = {};
  list.forEach((d) => (by[d.chapter] ||= []).push(d));
  return Object.entries(by).map(([ch, items]) => `== ${ch} ==\n` + items.map((d) => {
    const at = d.before ? ` (after: «${d.before.split(' ').slice(-4).join(' ')}»)` : '';
    if (d.category === 'missing') return `• Insert «${d.pdfText}»${at}`;
    if (d.category === 'extra') return `• Remove «${d.epubText}»${at}`;
    return `• Replace «${d.epubText}» with «${d.pdfText}»${at}${d.category === 'spelling' ? ' [spelling issue]' : ''}`;
  }).join('\n')).join('\n\n');
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement('textarea');
    t.value = text;
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  }
}

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Generate and download native Excel (.xlsx) file with ONLY the two requested columns */
export async function downloadExcel(list, filename = 'arabic-differences.xlsx') {
  const zip = new JSZip();

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);

  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);

  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Differences" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`);

  zip.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Segoe UI"/></font>
    <font><b/><sz val="11"/><name val="Segoe UI"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
</styleSheet>`);

  const rows = [
    ['Error text', 'Want to changed text'],
    ...list.map((d) => [getErrorText(d), getWantedText(d)])
  ];

  let sheetRowsXml = '';
  for (let r = 0; r < rows.length; r++) {
    const rowNum = r + 1;
    const isHeader = r === 0;
    const styleAttr = isHeader ? ' s="1"' : '';
    const c1 = `<c r="A${rowNum}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${escapeXml(rows[r][0])}</t></is></c>`;
    const c2 = `<c r="B${rowNum}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${escapeXml(rows[r][1])}</t></is></c>`;
    sheetRowsXml += `<row r="${rowNum}">${c1}${c2}</row>`;
  }

  zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView tabSelected="1" workbookViewId="0" rightToLeft="1"/>
  </sheetViews>
  <cols>
    <col min="1" max="1" width="38" customWidth="1"/>
    <col min="2" max="2" width="38" customWidth="1"/>
  </cols>
  <sheetData>${sheetRowsXml}</sheetData>
</worksheet>`);

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** UTF-8 CSV with BOM so Excel reads Arabic correctly with ONLY the two requested columns */
export function downloadCSV(list, filename = 'arabic-differences.csv') {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Error text', 'Want to changed text']]
    .concat(list.map((d) => [getErrorText(d), getWantedText(d)]));
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map((r) => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Detailed CSV with all original context and chapters */
export function downloadFullCSV(list, filename = 'arabic-differences-detailed.csv') {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Chapter', 'Category', 'Error text', 'Want to changed text', 'Context before', 'Context after']]
    .concat(list.map((d) => [d.chapter, LABELS[d.category], getErrorText(d), getWantedText(d), d.before, d.after]));
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map((r) => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
