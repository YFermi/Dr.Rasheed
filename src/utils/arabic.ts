import type { BlogArticle, BlogVerse, SearchResult } from '../types/blog';

// Shared by the browser app and scripts/build-blog.ts — keep it dependency-free.

const ARABIC_INDIC_ZERO = 0x0660;

function toWesternDigits(s: string): string {
  return s.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - ARABIC_INDIC_ZERO));
}

export function normalizeArabic(s: string): string {
  return toWesternDigits(
    s
      .replace(/[ً-ٟ]/g, '')   // tashkeel
      .replace(/[ۖ-ۭ]/g, '')   // Quranic annotation marks
      .replace(/ٰ/g, '')            // dagger alef
      .replace(/ـ/g, '')            // tatweel
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

// Quran-font glyph codes (e.g. Quran Word / KFGQPC fonts): the Private Use Area
// plus Arabic Presentation Forms A and B. The ornate parentheses ﴾﴿ (U+FD3E/FD3F)
// sit inside Forms-A but are ordinary verse brackets, so they are excluded.
const QURAN_GLYPH_RE = /[-ﭐ-ﴽ﵀-﷿ﹰ-﻿]/;
const QURAN_GLYPH_RE_GLOBAL = new RegExp(QURAN_GLYPH_RE.source, 'g');

export function containsQuranGlyphs(text: string): boolean {
  return QURAN_GLYPH_RE.test(text);
}

// Number of glyph characters (for diagnostics)
export function countGlyphChars(text: string): number {
  return text.match(QURAN_GLYPH_RE_GLOBAL)?.length ?? 0;
}

// Longest first, so "وال" wins over "و".
const PREFIXES = ['ولل', 'وال', 'فال', 'بال', 'كال', 'لل', 'ال', 'و', 'ف', 'ب', 'ك', 'ل'];
const SUFFIXES = ['ات', 'ين', 'ون', 'ان', 'ة', 'ه', 'ي', 'ن', 'ا'];

// Stripping is skipped when it would leave fewer than this many letters,
// which keeps short words like "قوم" or "بيت" intact.
const MIN_CORE = 3;

export function lightStem(word: string): string {
  let w = word;

  // A one-letter proclitic may be followed by another prefix ("لبسبيل" → "بسبيل" → "سبيل"),
  // but nothing is stripped after the article ("الفاحشة" must not lose its ف).
  for (let pass = 0; pass < 2; pass++) {
    const p = PREFIXES.find(pre => w.startsWith(pre) && w.length - pre.length >= MIN_CORE);
    if (!p) break;
    w = w.slice(p.length);
    if (p.length > 1) break;
  }

  const s = SUFFIXES.find(suf => w.endsWith(suf) && w.length - suf.length >= MIN_CORE);
  if (s) w = w.slice(0, -s.length);

  return w.length >= 2 ? w : word;
}

// ﴿ is U+FD3F and ﴾ is U+FD3E; documents use them in either order.
const BRACKET = '[\\uFD3E\\uFD3F]';
const DIGITS = '[0-9\\u0660-\\u0669]+';

// ﴿text﴾ optionally followed by a reference in [] or (), e.g.
// [الحجر: 76]  (سورة الحجر، 76)  [الأعراف 80-84]  (هود الآية ٨٢)
const VERSE_RE = new RegExp(
  `${BRACKET}([^\\uFD3E\\uFD3F]{2,3000}?)${BRACKET}` +
  `(?:\\s*[\\[(]\\s*(?:سورة\\s+)?([\\u0621-\\u065F\\u0670\\u0671\\s]+?)` +
  `\\s*(?:[:：،,]|\\s(?:الآيات|الآية|آيات|آية))?\\s*(${DIGITS})` +
  `(?:\\s*[-–—]\\s*(${DIGITS}))?\\s*[\\])])?`,
  'g'
);

export function extractVerses(text: string, paragraphId: string, partNumber: number): BlogVerse[] {
  const verses: BlogVerse[] = [];

  for (const m of text.matchAll(VERSE_RE)) {
    const verseText = m[1].replace(/\s+/g, ' ').trim();
    if (!verseText) continue;

    // Keep the hamza spelling ("الأعراف") so keys match crossReferences in the tree.
    const surah = m[2]
      ? m[2].replace(/[ً-ٰٟـ]/g, '').replace(/\s+/g, ' ').trim().replace(/^سورة\s+/, '')
      : undefined;
    const ayahFrom = m[3] ? Number(toWesternDigits(m[3])) : undefined;
    const ayahTo = m[4] ? Number(toWesternDigits(m[4])) : undefined;

    const key = surah && ayahFrom !== undefined
      ? `${surah}:${ayahFrom}${ayahTo !== undefined && ayahTo !== ayahFrom ? `-${ayahTo}` : ''}`
      : `unref:${normalizeArabic(verseText).slice(0, 60)}`;

    verses.push({ key, text: verseText, surah, ayahFrom, ayahTo, paragraphId, partNumber, replacedFromGlyphs: false });
  }

  return verses;
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) {
    count++;
  }
  return count;
}

export function toArabicDigits(n: number): string {
  return n.toLocaleString('ar-EG');
}

// Arabic number agreement: 1 → one, 2 → two, 3–10 → few (plural), 11+ → many.
export function formatArabicCount(
  n: number,
  forms: { zero: string; one: string; two: string; few: string; many: string }
): string {
  if (n === 0) return forms.zero;
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  const mod100 = n % 100;
  return `${toArabicDigits(n)} ${mod100 >= 3 && mod100 <= 10 ? forms.few : forms.many}`;
}

export function formatResultCount(n: number): string {
  return formatArabicCount(n, {
    zero: 'لا توجد نتائج', one: 'نتيجة واحدة', two: 'نتيجتان', few: 'نتائج', many: 'نتيجة',
  });
}

// Paragraph ids are "p{part}-{index}" with a zero-based index; shown 1-based.
export function paragraphNumber(paragraphId: string): number {
  return Number(paragraphId.slice(paragraphId.lastIndexOf('-') + 1)) + 1;
}

const SNIPPET_RADIUS = 70;

function makeSnippet(norm: string, needle: string): string {
  const at = Math.max(0, norm.indexOf(needle));
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(norm.length, at + needle.length + SNIPPET_RADIUS);
  return `${start > 0 ? '…' : ''}${norm.slice(start, end)}${end < norm.length ? '…' : ''}`;
}

// The stems searchCorpus looks for — also used to highlight matches in snippets.
export function queryStems(query: string): string[] {
  const normQuery = normalizeArabic(query);
  return normQuery ? [...new Set(normQuery.split(' ').map(lightStem).filter(Boolean))] : [];
}

// Every query word (as a stem) must appear in the paragraph; results are ranked
// by total occurrences, with a bonus when the whole normalized phrase appears.
export function searchCorpus(articles: BlogArticle[], query: string): SearchResult[] {
  const normQuery = normalizeArabic(query);
  if (!normQuery) return [];

  const stems = queryStems(query);
  const results: SearchResult[] = [];

  for (const article of articles) {
    for (const paragraph of article.paragraphs) {
      const counts = stems.map(stem => countOccurrences(paragraph.norm, stem));
      if (counts.some(c => c === 0)) continue;

      const phraseHits = stems.length > 1 ? countOccurrences(paragraph.norm, normQuery) : 0;
      results.push({
        article,
        paragraph,
        matchCount: counts.reduce((a, b) => a + b, 0) + phraseHits * stems.length,
        snippet: makeSnippet(paragraph.norm, phraseHits > 0 ? normQuery : stems[0]),
      });
    }
  }

  return results.sort((a, b) =>
    b.matchCount - a.matchCount || a.article.partNumber - b.article.partNumber
  );
}
