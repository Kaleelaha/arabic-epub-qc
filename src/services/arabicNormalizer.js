// Normalization is used ONLY for comparison keys; `raw` always keeps the source text.
const TATWEEL = /\u0640/g;
const DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00AD]/g;

// Word pattern: matches Arabic/alphanumeric words including diacritics and tatweel
const WORD_PATTERN = /[\p{L}\p{N}\p{M}\u0640]+/gu;

export function normalizeToken(s, { ignoreDiacritics = true } = {}) {
  let t = (s || '').normalize('NFKC').replace(TATWEEL, '');           // NFKC also folds Arabic presentation forms
  t = t.replace(/ی/g, 'ي').replace(/ک/g, 'ك');                 // Persian yeh/kaf -> Arabic
  t = t.replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 15)); // Arabic/Persian digits -> ASCII
  // Alef/hamza and ى/ي are deliberately NOT merged: those are real spelling distinctions.
  if (ignoreDiacritics) t = t.replace(DIACRITICS, '');
  return t.replace(/[\p{P}\p{S}]/gu, '').trim();                      // punctuation never counts as a difference
}

/** Split text into tokens {raw, norm, ch, pos}. `ch` = chapter index. */
export function tokenize(text, opts = {}, ch = 0) {
  let src = text || '';
  if (opts.normalizeWhitespace !== false) {
    src = src.replace(/\u00A0/g, ' ').replace(INVISIBLE, '');
  }
  const out = [];
  for (const m of src.matchAll(WORD_PATTERN)) {
    const raw = m[0];
    const norm = normalizeToken(raw, opts);
    if (norm) {
      out.push({ raw, norm, pos: m.index, ch });
    }
  }
  return out;
}

