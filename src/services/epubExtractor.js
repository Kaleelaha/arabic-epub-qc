import JSZip from 'jszip';

const BLOCKS = 'p,div,h1,h2,h3,h4,h5,h6,li,tr,blockquote,br,section,article';

function parseMarkup(str) {
  let doc = new DOMParser().parseFromString(str, 'application/xhtml+xml');
  if (doc.querySelector('parsererror')) doc = new DOMParser().parseFromString(str, 'text/html');
  return doc;
}
const resolve = (base, href) =>
  decodeURIComponent(new URL(href.split('#')[0], 'http://x/' + base).pathname.slice(1));

/** Read an EPUB File: OPF spine order -> [{title, text}] (content documents only). */
export async function extractEpub(file) {
  let zip;
  try { zip = await JSZip.loadAsync(file); } catch { throw new Error('This file is not a valid EPUB (ZIP) archive.'); }
  const read = async (p) => { const f = zip.file(p); return f ? f.async('string') : null; };

  const container = await read('META-INF/container.xml');
  if (!container) throw new Error('Invalid EPUB: META-INF/container.xml is missing.');
  const opfPath = parseMarkup(container).querySelector('rootfile')?.getAttribute('full-path');
  const opfXml = opfPath && (await read(opfPath));
  if (!opfXml) throw new Error('Invalid EPUB: the OPF package document was not found.');

  const opf = parseMarkup(opfXml);
  const baseDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const manifest = new Map();
  opf.querySelectorAll('manifest > item').forEach((i) =>
    manifest.set(i.getAttribute('id'), {
      href: i.getAttribute('href'), type: i.getAttribute('media-type') || '', props: i.getAttribute('properties') || '' }));

  const chapters = [];
  for (const ref of opf.querySelectorAll('spine > itemref')) {
    const item = manifest.get(ref.getAttribute('idref'));
    if (!item || !/html/.test(item.type) || /\bnav\b/.test(item.props)) continue; // skip nav/CSS/images/etc.
    const xml = await read(resolve(baseDir, item.href));
    if (!xml) continue;
    const doc = parseMarkup(xml);
    const body = doc.body || doc.documentElement;
    body.querySelectorAll('script,style,nav').forEach((n) => n.remove());
    const title = body.querySelector('h1,h2,h3')?.textContent.trim() || doc.querySelector('title')?.textContent.trim();
    body.querySelectorAll(BLOCKS).forEach((el) => el.after(doc.createTextNode('\n')));
    const text = body.textContent.replace(/[ \t]+/g, ' ').trim();
    if (text) chapters.push({ title: title || `Section ${chapters.length + 1}`, text });
  }
  if (!chapters.length) throw new Error('No readable text was found in the EPUB spine.');
  return { chapters };
}
