import { diffArrays } from 'diff';
import { tokenize } from './arabicNormalizer.js';

const N = 5; // n-gram length used to anchor EPUB chapters inside the PDF text
const join = (a) => a.map((t) => t.raw).join(' ');
const key = (t, i) => t.slice(i, i + N).map((x) => x.norm).join(' ');

function lev(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Find where each EPUB chapter starts in the PDF tokens. Unanchored chapters join the previous group. */
function groupByChapter(pdf, chapters) {
  const idx = new Map();
  for (let i = 0; i + N <= pdf.length; i++) {
    const k = key(pdf, i);
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(i);
  }
  const groups = [], lead = [];
  let from = 0, anchored = 0;
  for (const ct of chapters) {
    let found = -1;
    for (let off = 0; off <= Math.min(60, ct.length - N) && found < 0; off += 3) {
      const hit = idx.get(key(ct, off))?.find((p) => p - off >= from);
      if (hit !== undefined) found = Math.max(from, hit - off);
    }
    if (found >= 0) { groups.push({ pdfStart: found, epub: ct.slice() }); from = found + 1; anchored++; }
    else if (groups.length) ct.forEach((t) => groups[groups.length - 1].epub.push(t));
    else ct.forEach((t) => lead.push(t));
  }
  if (!groups.length) return { groups: null, anchored };
  groups[0].epub = lead.concat(groups[0].epub);
  groups.forEach((g, i) => (g.pdfEnd = groups[i + 1] ? groups[i + 1].pdfStart : pdf.length));
  return { groups, anchored };
}

function alignMultiTokens(rem, ins, startJ, add) {
  const M = rem.length;
  const N_len = ins.length;
  const dp = Array.from({ length: M + 1 }, () => new Float32Array(N_len + 1));
  const back = Array.from({ length: M + 1 }, () => new Uint8Array(N_len + 1)); // 1=diag, 2=up, 3=left

  const GAP = -0.4;
  for (let i = 1; i <= M; i++) { dp[i][0] = i * GAP; back[i][0] = 2; }
  for (let j = 1; j <= N_len; j++) { dp[0][j] = j * GAP; back[0][j] = 3; }

  function sim(r, a) {
    const d = lev(r.norm, a.norm);
    const maxLen = Math.max(r.norm.length, a.norm.length) || 1;
    if (d === 0) return 2.0;
    const ratio = d / maxLen;
    if (d <= 2 && ratio <= 0.45) return 1.5 - ratio;
    if (ratio <= 0.6) return 0.7 - ratio;
    return -0.6;
  }

  for (let i = 1; i <= M; i++) {
    for (let j = 1; j <= N_len; j++) {
      const s = sim(rem[i - 1], ins[j - 1]);
      const diag = dp[i - 1][j - 1] + s;
      const up = dp[i - 1][j] + GAP;
      const left = dp[i][j - 1] + GAP;

      if (diag >= up && diag >= left) {
        dp[i][j] = diag;
        back[i][j] = 1;
      } else if (up >= left) {
        dp[i][j] = up;
        back[i][j] = 2;
      } else {
        dp[i][j] = left;
        back[i][j] = 3;
      }
    }
  }

  let i = M, j = N_len;
  const steps = [];
  while (i > 0 || j > 0) {
    const b = back[i][j];
    if (b === 1) {
      steps.push({ r: rem[i - 1], a: ins[j - 1] });
      i--; j--;
    } else if (b === 2) {
      steps.push({ r: rem[i - 1], a: null });
      i--;
    } else {
      steps.push({ r: null, a: ins[j - 1] });
      j--;
    }
  }
  steps.reverse();

  let curJ = startJ;
  let idx = 0;
  while (idx < steps.length) {
    const s = steps[idx];
    if (s.r && s.a) {
      const d = lev(s.r.norm, s.a.norm);
      const maxLen = Math.max(s.r.norm.length, s.a.norm.length) || 1;
      if (d === 0) {
        curJ++;
        idx++;
        continue;
      }
      if (d <= 2 && d / maxLen <= 0.45) {
        add('spelling', [s.r], [s.a], curJ);
        curJ++;
        idx++;
        continue;
      }
      const remGroup = [s.r], insGroup = [s.a];
      let jIdx = curJ + 1;
      idx++;
      while (idx < steps.length && steps[idx].r && steps[idx].a) {
        const nextD = lev(steps[idx].r.norm, steps[idx].a.norm);
        const nextLen = Math.max(steps[idx].r.norm.length, steps[idx].a.norm.length) || 1;
        if (nextD === 0 || (nextD <= 2 && nextD / nextLen <= 0.45)) break;
        remGroup.push(steps[idx].r);
        insGroup.push(steps[idx].a);
        jIdx++;
        idx++;
      }
      add('changed', remGroup, insGroup, curJ);
      curJ = jIdx;
    } else if (s.r && !s.a) {
      const remGroup = [s.r];
      idx++;
      while (idx < steps.length && steps[idx].r && !steps[idx].a) {
        remGroup.push(steps[idx].r);
        idx++;
      }
      add('missing', remGroup, [], curJ);
    } else if (!s.r && s.a) {
      const insGroup = [s.a];
      const at = curJ;
      curJ++;
      idx++;
      while (idx < steps.length && !steps[idx].r && steps[idx].a) {
        insGroup.push(steps[idx].a);
        curJ++;
        idx++;
      }
      add('extra', [], insGroup, at);
    }
  }
}

function align(pdf, epub, titles, out) {
  const parts = diffArrays(pdf, epub, { comparator: (a, b) => a.norm === b.norm });
  let j = 0;
  const ctx = (s, e) => ({ before: join(epub.slice(Math.max(0, s - 6), s)), after: join(epub.slice(e, e + 6)) });
  const add = (cat, r, a, at) => {
    const t = epub[Math.min(at, Math.max(0, epub.length - 1))];
    out.push({ category: cat, chapter: titles[t ? t.ch : 0] || 'Document', pdfText: join(r), epubText: join(a), ...ctx(at, at + a.length) });
  };
  for (let p = 0; p < parts.length; p++) {
    if (!parts[p].added && !parts[p].removed) { j += parts[p].count; continue; }
    const rem = [], ins = [];
    for (; p < parts.length && (parts[p].added || parts[p].removed); p++)
      (parts[p].removed ? rem : ins).push(...parts[p].value);
    p--;
    if (!ins.length) add('missing', rem, [], j);
    else if (!rem.length) add('extra', [], ins, j);
    else if (rem.length === 1 && ins.length === 1) {
      const r = rem[0], a = ins[0];
      const d = lev(r.norm, a.norm), len = Math.max(r.norm.length, a.norm.length) || 1;
      add(Math.min(r.norm.length, a.norm.length) >= 2 && d <= 2 && d / len <= 0.45 ? 'spelling' : 'changed', [r], [a], j);
    } else {
      alignMultiTokens(rem, ins, j, add);
    }
    j += ins.length;
  }
}

export function compareBook({ pdfText, chapters, options }, progress = () => {}) {
  const warnings = [];
  const pdf = tokenize(pdfText, options);
  const chTok = chapters.map((c, i) => tokenize(c.text, options, i));
  const titles = chapters.map((c) => c.title);
  if (!pdf.length) throw new Error('No comparable words were found in the PDF.');
  if (!chTok.some((c) => c.length)) throw new Error('No comparable words were found in the EPUB.');
  const diffs = [];
  let groups = null;

  if (options.byChapter) {
    progress(5, 'Matching chapters to PDF…');
    const r = groupByChapter(pdf, chTok);
    if (r.groups && r.anchored >= chapters.length / 2) {
      groups = r.groups;
      if (r.anchored < chapters.length)
        warnings.push(`${chapters.length - r.anchored} chapter(s) could not be located in the PDF and were compared together with the preceding chapter.`);
    } else warnings.push('Chapters could not be matched reliably to the PDF. The whole book was compared instead; results may contain more noise.');
  } else warnings.push('Whole-book comparison: chapter boundaries were not used for alignment.');

  if (groups) {
    groups.forEach((g, i) => {
      progress(10 + (85 * i) / groups.length, `Comparing section ${i + 1} of ${groups.length}…`);
      align(pdf.slice(g.pdfStart, g.pdfEnd), g.epub, titles, diffs);
    });
  } else {
    progress(10, 'Comparing whole book (large books may take a while)…');
    align(pdf, chTok.flat(), titles, diffs);
  }
  diffs.forEach((d, i) => (d.id = i));
  const count = (c) => diffs.filter((d) => d.category === c).length;
  const stats = { total: diffs.length, missing: count('missing'), extra: count('extra'), changed: count('changed'),
    spelling: count('spelling'), chapters: new Set(diffs.map((d) => d.chapter)).size };
  progress(100, 'Done');
  return { diffs, stats, warnings };
}
