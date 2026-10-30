/// <reference types="node" />
// Converts the Story-of-Lot .docx files into public/blog/blog.json.
//
// Usage: npx tsx scripts/build-blog.ts [sourceDir] [outFile]
//   defaults: content/blog/قصة لوط/  →  public/blog/blog.json
//
// A file containing several "المقال الأول / المقال الثاني …" headings is split into
// one article per heading; any other file is a single article whose part number
// comes from its filename (e.g. "Part 15.docx", "الجزء ١٥.docx").

import mammoth from 'mammoth';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractVerses, normalizeArabic, containsQuranGlyphs, countGlyphChars } from '../src/utils/arabic';
import { getVerseText, getSurahNumber, QURAN_TEXT_ATTRIBUTION } from '../src/utils/quranLookup';
import type { BlogArticle, BlogCorpus, BlogParagraph, BlogVerse } from '../src/types/blog';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.resolve(process.argv[2] ?? path.join(ROOT, 'content', 'blog', 'قصة لوط'));
const OUT_FILE = path.resolve(process.argv[3] ?? path.join(ROOT, 'public', 'blog', 'blog.json'));

const CORPUS_VERSION = 1;

// Word installed in Arabic names its built-in heading styles "عنوان 1" etc.
const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='العنوان'] => h1:fresh",
  ...[1, 2, 3, 4, 5, 6].map(n => `p[style-name='عنوان ${n}'] => h${n}:fresh`),
];

// ---------------------------------------------------------------------------
// Article heading detection
// ---------------------------------------------------------------------------

// Ordinals as they look after normalizeArabic (أ → ا).
const ORDINALS: [string, number][] = [
  ['الاول', 1], ['الثاني', 2], ['الثالث', 3], ['الرابع', 4], ['الخامس', 5],
  ['السادس', 6], ['السابع', 7], ['الثامن', 8], ['التاسع', 9], ['العاشر', 10],
  ['الحادي عشر', 11], ['الثاني عشر', 12], ['الثالث عشر', 13], ['الرابع عشر', 14],
  ['الخامس عشر', 15], ['السادس عشر', 16], ['السابع عشر', 17], ['الثامن عشر', 18],
  ['التاسع عشر', 19], ['العشرون', 20],
];
// Longest first so "الثاني عشر" is tried before "الثاني".
const ORDINAL_ALT = [...ORDINALS].sort((a, b) => b[0].length - a[0].length).map(o => o[0]).join('|');
const ARTICLE_HEADING_RE = new RegExp(
  `^[\\s\\-–—:.*#]*(?:ال)?مقال[ةه]?\\s*(?:رقم\\s*)?(?:(${ORDINAL_ALT})(?![\\u0621-\\u064A])|\\(?(\\d+)\\)?)`
);

// A non-heading paragraph only counts as an article title when it is this short.
const MAX_FALLBACK_TITLE_LENGTH = 120;

function articleNumberOf(norm: string): number | null {
  const m = norm.match(ARTICLE_HEADING_RE);
  if (!m) return null;
  if (m[1]) return ORDINALS.find(o => o[0] === m[1])![1];
  return Number(m[2]);
}

// ---------------------------------------------------------------------------
// HTML → blocks
// ---------------------------------------------------------------------------

interface Block {
  tag: string;
  html: string;
  text: string;
  norm: string;
}

const VOID_TAGS = new Set(['br', 'img', 'hr']);

// mammoth emits well-formed, flat-ish HTML; walk the tags and cut at depth 0
// so nested lists and tables stay inside their block.
function splitTopLevelBlocks(html: string): { tag: string; html: string }[] {
  const blocks: { tag: string; html: string }[] = [];
  const tagRe = /<(\/?)([a-zA-Z0-9]+)\b[^>]*?(\/?)>/g;
  let depth = 0;
  let start = 0;
  let topTag = '';

  for (const m of html.matchAll(tagRe)) {
    const [whole, closing, rawName, selfClosing] = m;
    const name = rawName.toLowerCase();
    if (VOID_TAGS.has(name) || selfClosing) continue;

    if (!closing) {
      if (depth === 0) {
        start = m.index!;
        topTag = name;
      }
      depth++;
    } else {
      depth--;
      if (depth === 0) {
        blocks.push({ tag: topTag, html: html.slice(start, m.index! + whole.length) });
      }
    }
  }
  return blocks;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ent: string) => {
      if (ent[0] === '#') {
        const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
        return String.fromCodePoint(code);
      }
      return ENTITIES[ent.toLowerCase()] ?? whole;
    })
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function toBlocks(html: string): Block[] {
  return splitTopLevelBlocks(html)
    .map(b => {
      const text = htmlToText(b.html);
      return { tag: b.tag, html: b.html, text, norm: normalizeArabic(text) };
    })
    .filter(b => b.text.length > 0);
}

const headingLevelOf = (tag: string) => (/^h[1-6]$/.test(tag) ? Number(tag[1]) : undefined);

// ---------------------------------------------------------------------------
// Blocks → articles
// ---------------------------------------------------------------------------

interface Section {
  partNumber: number;
  title: string;
  blocks: Block[];
}

// Series headings number each part at the end: "لماذا قدّم نبي الله لوط بناته بدلاً من ضيوفه (3)؟"
const SERIES_PART_RE = /\((\d+)\)\s*[؟?]?\s*$/;

function headingPartNumber(b: Block): number | null {
  const level = headingLevelOf(b.tag);
  if (level === undefined) return null;
  const byWord = articleNumberOf(b.norm);
  if (byWord !== null) return byWord;
  const m = level === 1 ? b.norm.match(SERIES_PART_RE) : null;
  return m ? Number(m[1]) : null;
}

// A heading may be preceded by its own title lines, e.g. "لماذا قدم …؟" then
// "(الجزء الثالث)"; those belong to the new article, not the end of the previous one.
const PART_LINE_RE = /^\(?الجزء\s/;
const MAX_PART_LINE_LENGTH = 40;

function sectionStart(blocks: Block[], headingIndex: number): number {
  const isPlainShort = (b: Block | undefined, max: number) => b !== undefined && !headingLevelOf(b.tag) && b.norm.length <= max;
  const prev = blocks[headingIndex - 1];
  if (!isPlainShort(prev, MAX_PART_LINE_LENGTH) || !PART_LINE_RE.test(prev.norm)) return headingIndex;
  return isPlainShort(blocks[headingIndex - 2], MAX_FALLBACK_TITLE_LENGTH) ? headingIndex - 2 : headingIndex - 1;
}

function findSplitPoints(blocks: Block[]): { index: number; partNumber: number }[] {
  const byHeadings = blocks
    .map((b, index) => ({ index, partNumber: headingPartNumber(b) }))
    .filter((s): s is { index: number; partNumber: number } => s.partNumber !== null)
    .map(s => ({ ...s, index: sectionStart(blocks, s.index) }));
  if (byHeadings.length >= 2) return byHeadings;

  return blocks
    .map((b, index) => ({
      index,
      partNumber: b.norm.length <= MAX_FALLBACK_TITLE_LENGTH ? articleNumberOf(b.norm) : null,
    }))
    .filter((s): s is { index: number; partNumber: number } => s.partNumber !== null);
}

function titleFrom(blocks: Block[], fallback: string): string {
  const first = blocks[0];
  if (!first) return fallback;
  // A bare "المقال الأول" / "الجزء السادس عشر:" heading followed by a heading → join them.
  const second = blocks[1];
  const bareLabel = first.text.replace(/[\s:：]+$/, '');
  const isBareLabel =
    (articleNumberOf(first.norm) !== null || PART_LINE_RE.test(first.norm)) &&
    !bareLabel.includes(':') &&
    first.norm.length < 25;
  if (isBareLabel && second && headingLevelOf(second.tag)) {
    return `${bareLabel}: ${second.text}`;
  }
  const heading = blocks.find(b => headingLevelOf(b.tag));
  const text = (heading ?? first).text.replace(/\s+/g, ' ');
  return text.length > MAX_FALLBACK_TITLE_LENGTH ? `${text.slice(0, MAX_FALLBACK_TITLE_LENGTH)}…` : text;
}

function splitIntoSections(blocks: Block[], file: string): Section[] | null {
  const points = findSplitPoints(blocks);
  if (points.length < 2) return null;

  let sections: Section[] = points.map((p, i) => {
    const sectionBlocks = blocks.slice(p.index, points[i + 1]?.index ?? blocks.length);
    return { partNumber: p.partNumber, title: titleFrom(sectionBlocks, file), blocks: sectionBlocks };
  });

  // The same number twice usually means a table of contents line plus the real
  // article; keep the longer section.
  const best = new Map<number, Section>();
  for (const s of sections) {
    const prev = best.get(s.partNumber);
    if (!prev || wordsIn(s.blocks) > wordsIn(prev.blocks)) best.set(s.partNumber, s);
  }
  const dropped = sections.filter(s => best.get(s.partNumber) !== s);
  if (dropped.length > 0) {
    console.warn(`  ⚠ ${file}: ignored ${dropped.length} short duplicate heading section(s) (likely a table of contents).`);
  }
  sections = sections.filter(s => best.get(s.partNumber) === s);

  if (points[0].index > 0) {
    console.warn(`  ⚠ ${file}: skipped ${points[0].index} paragraph(s) before the first article heading.`);
  }
  return sections;
}

function wordsIn(blocks: Block[]): number {
  return blocks.reduce((n, b) => n + (b.text.match(/\S+/g)?.length ?? 0), 0);
}

function partNumberFromFilename(file: string): number | null {
  const m = path.parse(file).name.match(/[0-9٠-٩]+/);
  return m ? Number(normalizeArabic(m[0])) : null;
}

// ---------------------------------------------------------------------------
// Quran-font glyphs → canonical Tanzil text
// ---------------------------------------------------------------------------
//
// Dr. Rasheed's files cite verses with a Quran font (Quran Word), stored as
// glyph codes that are not Arabic letters. Each glyph verse with a parsable
// reference is replaced by the Tanzil text of that reference: Uthmani for the
// displayed HTML, Simple-Clean (standard spelling) for the search index.

// A bracketed verse in mammoth HTML, either bracket order; may contain inline tags.
const HTML_VERSE_RE = /[﴾﴿]([^﴾﴿]*?)[﴾﴿]/g;
// The reference "[سورة: آية]" must start within this many characters after the verse.
const REF_LOOKAHEAD_CHARS = 160;
// A glyph citation shorter than this share of the canonical verse is likely partial.
const PARTIAL_CITATION_RATIO = 0.6;

interface VerseOutcome {
  replaced: boolean;
  originalText?: string;
}

const glyphStats = {
  replaced: 0,
  spanning: 0,
  partial: 0,
  unreplaceable: [] as string[],
  ayahMismatches: [] as string[],
  missingClosers: [] as string[],
  misaligned: [] as string[],
};

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Inline tags inside a replaced verse are kept (emptied) so the HTML stays balanced.
const tagsOf = (html: string) => html.match(/<[^>]+>/g)?.join('') ?? '';

function describeRef(v: BlogVerse): string {
  return v.ayahTo !== undefined ? `${v.surah}:${v.ayahFrom}-${v.ayahTo}` : `${v.surah}:${v.ayahFrom}`;
}

function checkCitation(glyphText: string, ref: BlogVerse, canonical: string, paragraphId: string) {
  // Quran Word keeps the ayah-end numbers as ordinary digits (e.g. "٣٣").
  const markers = (normalizeArabic(glyphText).match(/\d+/g) ?? []).map(Number);
  const from = ref.ayahFrom!;
  const to = ref.ayahTo ?? from;
  const outside = markers.filter(n => n < from || n > to);
  if (outside.length > 0) {
    glyphStats.ayahMismatches.push(`${paragraphId}: reference ${describeRef(ref)}, but the glyph text marks ayah ${outside.join('، ')}`);
  }
  if (countGlyphChars(glyphText) < canonical.split(/\s+/).length * PARTIAL_CITATION_RATIO) {
    glyphStats.partial++;
  }
}

function replaceGlyphVerses(html: string, paragraphId: string): { html: string; searchHtml: string; outcomes: VerseOutcome[] } {
  const outcomes: VerseOutcome[] = [];
  let display = '';
  let search = '';
  let cursor = 0;

  for (const m of html.matchAll(HTML_VERSE_RE)) {
    const start = m.index!;
    const end = start + m[0].length;
    const between = html.slice(cursor, start);
    display += between;
    search += between;
    cursor = end;

    const keep = () => {
      display += m[0];
      search += m[0];
    };
    const inner = htmlToText(m[1]);
    if (inner.length < 2) { keep(); continue; } // extractVerses ignores these too

    if (!containsQuranGlyphs(inner)) {
      outcomes.push({ replaced: false });
      keep();
      continue;
    }

    const following = htmlToText(html.slice(end, end + REF_LOOKAHEAD_CHARS * 3)).slice(0, REF_LOOKAHEAD_CHARS);
    const [ref] = extractVerses(`﴿نص﴾ ${following}`, paragraphId, 0);
    let reason: string | null = null;
    let uthmani: string | null = null;
    if (!ref?.surah || ref.ayahFrom === undefined) reason = 'no reference';
    else if (getSurahNumber(ref.surah) === null) reason = `unknown surah «${ref.surah}»`;
    else if (!(uthmani = getVerseText(ref.surah, ref.ayahFrom, ref.ayahTo))) reason = `ayah out of range (${describeRef(ref)})`;

    if (reason || !uthmani) {
      glyphStats.unreplaceable.push(`${paragraphId}: ${reason} — after: "${following.slice(0, 50)}"`);
      outcomes.push({ replaced: false });
      keep();
      continue;
    }

    const simple = getVerseText(ref!.surah!, ref!.ayahFrom!, ref!.ayahTo, 'simple-clean')!;
    checkCitation(inner, ref!, uthmani, paragraphId);
    display += `﴿${escapeHtml(uthmani)}﴾${tagsOf(m[1])}`;
    search += `﴿${escapeHtml(simple)}﴾${tagsOf(m[1])}`;
    outcomes.push({ replaced: true, originalText: inner });
    glyphStats.replaced++;
  }

  display += html.slice(cursor);
  search += html.slice(cursor);
  return { html: display, searchHtml: search, outcomes };
}

// Long citations can span several Word paragraphs: ﴿ opens in one, ﴾ [ref] closes
// a few paragraphs later. The ayah-end numbers in the glyph text tell which
// ayahs each paragraph holds, so each paragraph gets exactly its own ayahs.

const GLYPH_CLASS = '\\uE000-\\uF8FF\\uFB50-\\uFD3D\\uFD40-\\uFDFF\\uFE70-\\uFEFF';
// A glyph run, possibly with spaces, ayah numbers and inline tags inside it. It may
// start with a number: an ayah split at a paragraph break leaves its number there.
const GLYPH_RUN_RE = new RegExp(
  `[${GLYPH_CLASS}\\u0660-\\u06690-9](?:[${GLYPH_CLASS}\\s\\u0660-\\u06690-9]|<[^>]+>)*`,
  'g'
);
const GLYPH_ONLY_TEXT_RE = new RegExp(`^[${GLYPH_CLASS}\\s\\u0660-\\u06690-9]+$`);
const BRACKET_RE = /[﴾﴿]/g;
// Some citations run a whole passage one ayah per paragraph; the ayah-marker
// validation below rejects a wrong pairing, so this limit can be generous.
const MAX_SPAN_PARAGRAPHS = 150;

const bracketPositions = (html: string) => [...html.matchAll(BRACKET_RE)].map(m => m.index!);
const ayahMarkers = (text: string) => (normalizeArabic(text).match(/\d+/g) ?? []).map(Number);

interface SpanPiece {
  index: number;
  start: number; // run position in that paragraph's HTML
  run: string;
}

// The glyph run in one paragraph of a spanning verse, or null if the paragraph
// holds anything other than verse glyphs on the verse side of its bracket.
function spanPiece(html: string, index: number, role: 'first' | 'middle' | 'last'): SpanPiece | null {
  const brackets = bracketPositions(html);
  const from = role === 'first' ? brackets[brackets.length - 1] + 1 : 0;
  const to = role === 'last' ? brackets[0] : html.length;
  const region = html.slice(from, to);
  const runs = [...region.matchAll(GLYPH_RUN_RE)];
  if (runs.length !== 1) return null;
  const outside = region.slice(0, runs[0].index!) + region.slice(runs[0].index! + runs[0][0].length);
  if (htmlToText(outside).trim() !== '') return null;
  return { index, start: from + runs[0].index!, run: runs[0][0] };
}

// "﴿glyphs ٣٢ [العنكبوت: 31-32]" — an opening bracket whose closing ﴾ was forgotten,
// with the reference right after the glyph run in the same paragraph.
// Where the glyph run after the paragraph's last (unmatched) bracket is.
function locateUnclosedRun(html: string): { openAt: number; runStart: number; runEnd: number; run: string } | null {
  const openAt = bracketPositions(html).at(-1);
  if (openAt === undefined) return null;
  const region = html.slice(openAt + 1);
  const m = region.match(new RegExp(GLYPH_RUN_RE.source));
  if (!m || htmlToText(region.slice(0, m.index!)).trim() !== '') return null;
  const runStart = openAt + 1 + m.index!;
  return { openAt, runStart, runEnd: runStart + m[0].length, run: m[0] };
}

function replaceUnclosedVerse(display: string[], search: string[], i: number, id: string, partNumber: number): BlogVerse | null {
  const at = locateUnclosedRun(display[i]);
  if (!at) return null;
  const following = htmlToText(display[i].slice(at.runEnd, at.runEnd + REF_LOOKAHEAD_CHARS * 3)).slice(0, REF_LOOKAHEAD_CHARS);
  const [ref] = extractVerses(`﴿نص﴾ ${following}`, id, partNumber);
  if (!ref?.surah || ref.ayahFrom === undefined) return null;
  const uthmani = getVerseText(ref.surah, ref.ayahFrom, ref.ayahTo);
  const simple = getVerseText(ref.surah, ref.ayahFrom, ref.ayahTo, 'simple-clean');
  if (!uthmani || !simple) return null;

  // Located separately in each copy: earlier verses in the paragraph may differ in length.
  const rebuild = (html: string, text: string) => {
    const loc = locateUnclosedRun(html)!;
    return html.slice(0, loc.openAt) + '﴿' + html.slice(loc.openAt + 1, loc.runStart) +
      escapeHtml(text) + '﴾' + tagsOf(loc.run) + html.slice(loc.runEnd);
  };
  display[i] = rebuild(display[i], uthmani);
  search[i] = rebuild(search[i], simple);
  checkCitation(htmlToText(at.run), ref, uthmani, id);
  glyphStats.missingClosers.push(`${id}: added the missing ﴾ before ${describeRef(ref)}`);
  return { ...ref, text: uthmani, replacedFromGlyphs: true, originalText: htmlToText(at.run) };
}

// "glyphs ١٩٦﴾ [الشعراء: 196]" at the start of a paragraph — the opening ﴿ was forgotten.
function locateUnopenedRun(html: string): { closeAt: number; runStart: number; runEnd: number; run: string } | null {
  const closeAt = bracketPositions(html)[0];
  if (closeAt === undefined) return null;
  const region = html.slice(0, closeAt);
  const runs = [...region.matchAll(GLYPH_RUN_RE)];
  if (runs.length !== 1) return null;
  const m = runs[0];
  if (htmlToText(region.slice(0, m.index!) + region.slice(m.index! + m[0].length)).trim() !== '') return null;
  return { closeAt, runStart: m.index!, runEnd: m.index! + m[0].length, run: m[0] };
}

function replaceUnopenedVerse(display: string[], search: string[], i: number, id: string, partNumber: number): BlogVerse | null {
  const at = locateUnopenedRun(display[i]);
  if (!at) return null;
  const following = htmlToText(display[i].slice(at.closeAt + 1, at.closeAt + 1 + REF_LOOKAHEAD_CHARS * 3)).slice(0, REF_LOOKAHEAD_CHARS);
  const [ref] = extractVerses(`﴿نص﴾ ${following}`, id, partNumber);
  if (!ref?.surah || ref.ayahFrom === undefined) return null;
  const uthmani = getVerseText(ref.surah, ref.ayahFrom, ref.ayahTo);
  const simple = getVerseText(ref.surah, ref.ayahFrom, ref.ayahTo, 'simple-clean');
  if (!uthmani || !simple) return null;

  const rebuild = (html: string, text: string) => {
    const loc = locateUnopenedRun(html)!;
    return html.slice(0, loc.runStart) + '﴿' + escapeHtml(text) + tagsOf(loc.run) + html.slice(loc.runEnd, loc.closeAt) + '﴾' + html.slice(loc.closeAt + 1);
  };
  display[i] = rebuild(display[i], uthmani);
  search[i] = rebuild(search[i], simple);
  checkCitation(htmlToText(at.run), ref, uthmani, id);
  glyphStats.missingClosers.push(`${id}: added the missing ﴿ before ${describeRef(ref)}`);
  return { ...ref, text: uthmani, replacedFromGlyphs: true, originalText: htmlToText(at.run) };
}

function replaceSpanningVerses(display: string[], search: string[], ids: string[], partNumber: number): BlogVerse[] {
  const verses: BlogVerse[] = [];
  const oddBrackets = (i: number) => bracketPositions(display[i]).length % 2 === 1;

  for (let i = 0; i < display.length; i++) {
    if (!oddBrackets(i) || !containsQuranGlyphs(htmlToText(display[i]))) continue;

    const repaired =
      replaceUnclosedVerse(display, search, i, ids[i], partNumber) ??
      replaceUnopenedVerse(display, search, i, ids[i], partNumber);
    if (repaired) {
      verses.push(repaired);
      glyphStats.replaced++;
      continue;
    }

    let j = i + 1;
    while (j < display.length && j - i < MAX_SPAN_PARAGRAPHS && !oddBrackets(j)) j++;
    const fail = (reason: string) => glyphStats.unreplaceable.push(`${ids[i]}…${ids[j] ?? 'end'}: multi-paragraph verse, ${reason}`);
    if (j >= display.length || j - i >= MAX_SPAN_PARAGRAPHS) { fail('closing bracket not found'); continue; }

    const closeAt = bracketPositions(display[j])[0];
    const following = htmlToText(display[j].slice(closeAt + 1, closeAt + 1 + REF_LOOKAHEAD_CHARS * 3)).slice(0, REF_LOOKAHEAD_CHARS);
    const [ref] = extractVerses(`﴿نص﴾ ${following}`, ids[i], partNumber);
    if (!ref?.surah || ref.ayahFrom === undefined || getSurahNumber(ref.surah) === null) { fail('no usable reference'); i = j; continue; }
    const last = ref.ayahTo ?? ref.ayahFrom;

    const pieces: SpanPiece[] = [];
    for (let k = i; k <= j; k++) {
      const role = k === i ? 'first' : k === j ? 'last' : 'middle';
      if (role === 'middle') {
        const text = htmlToText(display[k]);
        // Separators ("*** ***") or the author's commentary between parts of the verse
        if (!containsQuranGlyphs(text)) continue;
        if (!GLYPH_ONLY_TEXT_RE.test(text)) { pieces.length = 0; break; }
      }
      const piece = spanPiece(display[k], k, role);
      if (!piece) { pieces.length = 0; break; }
      pieces.push(piece);
    }
    if (pieces.length === 0) { fail('paragraphs mix verse glyphs with other text'); i = j; continue; }

    // Each paragraph covers the ayahs up to its last ayah-end marker.
    let next = ref.ayahFrom;
    const ranges = pieces.map(p => {
      const markers = ayahMarkers(htmlToText(p.run));
      if (markers.length === 0) return null; // ayah continues in the next paragraph
      const range = { from: next, to: markers[markers.length - 1] };
      next = range.to + 1;
      return range;
    });
    const covered = ranges.filter((r): r is { from: number; to: number } => r !== null);
    const valid = covered.length > 0 && next === last + 1 && covered.every(r => r.from <= r.to);
    if (!valid) { fail(`ayah markers do not match ${describeRef(ref)}`); i = j; continue; }

    // Replace from the last paragraph backwards so earlier positions stay valid.
    for (let p = pieces.length - 1; p >= 0; p--) {
      const { index, start, run } = pieces[p];
      const range = ranges[p];
      const uthmani = range ? getVerseText(ref.surah, range.from, range.to)! : '';
      const simple = range ? getVerseText(ref.surah, range.from, range.to, 'simple-clean')! : '';
      const swap = (html: string, text: string) => html.slice(0, start) + escapeHtml(text) + tagsOf(run) + html.slice(start + run.length);
      display[index] = swap(display[index], uthmani);
      search[index] = swap(search[index], simple);
    }
    // Normalize the outer brackets to ﴿ … ﴾ (positions differ between the two versions)
    const setChar = (s: string, at: number, ch: string) => s.slice(0, at) + ch + s.slice(at + 1);
    for (const arr of [display, search]) {
      arr[i] = setChar(arr[i], bracketPositions(arr[i]).at(-1)!, '﴿');
      arr[j] = setChar(arr[j], bracketPositions(arr[j])[0], '﴾');
    }

    verses.push({
      key: ref.key,
      text: getVerseText(ref.surah, ref.ayahFrom, last)!,
      surah: ref.surah,
      ayahFrom: ref.ayahFrom,
      ...(ref.ayahTo !== undefined ? { ayahTo: ref.ayahTo } : {}),
      paragraphId: ids[i],
      partNumber,
      replacedFromGlyphs: true,
      originalText: pieces.map(p => htmlToText(p.run)).join(' '),
    });
    glyphStats.replaced++;
    glyphStats.spanning++;
    i = j;
  }
  return verses;
}

function buildArticle(section: Section, id: string, paragraphPrefix: string, sourceFile: string): BlogArticle {
  const verses: BlogVerse[] = [];
  const ids = section.blocks.map((_, i) => `${paragraphPrefix}-${i}`);

  // 1. Verses whose brackets are within one paragraph
  const perBlock = section.blocks.map((b, i) => replaceGlyphVerses(b.html, ids[i]));
  const display = perBlock.map(r => r.html);
  const search = perBlock.map(r => r.searchHtml);
  // 2. Verses spanning several paragraphs
  const spanningVerses = replaceSpanningVerses(display, search, ids, section.partNumber);

  const paragraphs: BlogParagraph[] = section.blocks.map((b, i) => {
    const paragraphId = ids[i];
    const level = headingLevelOf(b.tag);
    const { outcomes } = perBlock[i];
    const html = display[i];
    const searchHtml = search[i];
    const text = htmlToText(html);

    // Verses come out of the text in the same order as the replacement outcomes.
    const paragraphVerses = extractVerses(text, paragraphId, section.partNumber);
    if (paragraphVerses.length === outcomes.length) {
      paragraphVerses.forEach((v, k) => {
        if (outcomes[k].replaced) {
          v.replacedFromGlyphs = true;
          v.originalText = outcomes[k].originalText;
        }
      });
    } else if (outcomes.some(o => o.replaced)) {
      glyphStats.misaligned.push(paragraphId);
    }
    verses.push(...paragraphVerses);
    verses.push(...spanningVerses.filter(v => v.paragraphId === paragraphId));

    return {
      id: paragraphId,
      html,
      text,
      norm: normalizeArabic(htmlToText(searchHtml)),
      isHeading: level !== undefined,
      ...(level !== undefined ? { headingLevel: level } : {}),
    };
  });

  return {
    id,
    partNumber: section.partNumber,
    title: section.title,
    sourceFile,
    paragraphs,
    verses,
    wordCount: paragraphs.reduce((n, p) => n + (p.text.match(/\S+/g)?.length ?? 0), 0),
  };
}

function printVerseSummary(corpus: BlogCorpus) {
  const all = corpus.articles.flatMap(a => a.verses);
  const replaced = all.filter(v => v.replacedFromGlyphs).length;
  const stillGlyphs = all.filter(v => !v.replacedFromGlyphs && containsQuranGlyphs(v.text)).length;
  const glyphParagraphs = corpus.articles.flatMap(a => a.paragraphs).filter(p => containsQuranGlyphs(p.text)).length;
  const list = (items: string[], max: number) => {
    items.slice(0, max).forEach(item => console.log(`      ${item}`));
    if (items.length > max) console.log(`      … and ${items.length - max} more`);
  };

  console.log('\nQuran verse text (Tanzil):');
  console.log(`  total verses:                          ${all.length}`);
  console.log(`  replaced from glyphs:                  ${replaced} (${glyphStats.spanning} spanning several paragraphs)`);
  console.log(`  glyphs but unreplaceable:              ${stillGlyphs} (+ ${glyphStats.unreplaceable.length - stillGlyphs} multi-paragraph passages)`);
  console.log(`  already in Arabic (unchanged):         ${all.length - replaced - stillGlyphs}`);
  console.log(`  partial citations shown as full verse: ${glyphStats.partial}`);
  console.log(`  paragraphs still containing glyphs:    ${glyphParagraphs} (mostly short quotes without ﴿﴾ or reference)`);

  if (glyphStats.unreplaceable.length > 0) {
    console.warn(`  ⚠ Unreplaceable glyph verses (fix the reference in the .docx):`);
    list(glyphStats.unreplaceable, Infinity);
  }
  if (glyphStats.ayahMismatches.length > 0) {
    console.warn(`  ⚠ ${glyphStats.ayahMismatches.length} reference/ayah-number mismatches (possible reference typos):`);
    list(glyphStats.ayahMismatches, 20);
  }
  if (glyphStats.missingClosers.length > 0) {
    console.warn(`  ℹ ${glyphStats.missingClosers.length} verses had a missing bracket (added):`);
    list(glyphStats.missingClosers, 20);
  }
  if (glyphStats.misaligned.length > 0) {
    console.warn(`  ⚠ ${glyphStats.misaligned.length} paragraphs where replacement flags could not be matched to verses: ${glyphStats.misaligned.slice(0, 10).join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function writeCorpus(articles: BlogArticle[]): Promise<BlogCorpus> {
  const corpus: BlogCorpus = {
    version: CORPUS_VERSION,
    generatedAt: new Date().toISOString(),
    totalArticles: articles.length,
    totalParagraphs: articles.reduce((n, a) => n + a.paragraphs.length, 0),
    totalVerses: articles.reduce((n, a) => n + a.verses.length, 0),
    ...(glyphStats.replaced > 0 ? { quranTextSource: QURAN_TEXT_ATTRIBUTION } : {}),
    articles,
  };
  // `npm run build` runs this every time: keep the committed file (and its
  // timestamp) when the content is unchanged.
  if (existsSync(OUT_FILE)) {
    const { generatedAt: _previousDate, ...previous } = JSON.parse(await readFile(OUT_FILE, 'utf8')) as BlogCorpus;
    const { generatedAt: _newDate, ...next } = corpus;
    if (JSON.stringify(previous) === JSON.stringify(next)) return { ...corpus, generatedAt: _previousDate };
  }
  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(corpus, null, 2), 'utf8');
  return corpus;
}

async function main() {
  const files = existsSync(SRC_DIR)
    ? (await readdir(SRC_DIR))
        .filter(f => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'))
        .sort((a, b) => a.localeCompare(b, 'ar', { numeric: true }))
    : [];

  if (files.length === 0) {
    // The .docx sources are not in git, so a fresh clone has none: never replace
    // a committed corpus with an empty one.
    if (existsSync(OUT_FILE)) {
      console.log('ℹ No .docx files found. Keeping existing blog.json.');
      console.log(`    source: ${SRC_DIR}`);
      return;
    }
    console.log(`ℹ No .docx files found in:\n    ${SRC_DIR}`);
    console.log('  Place the Story of Lot .docx files there and run: npm run blog');
    await writeCorpus([]);
    console.log(`  Wrote an empty corpus to ${path.relative(ROOT, OUT_FILE)}`);
    return;
  }

  console.log(`Reading ${files.length} file(s) from ${path.relative(ROOT, SRC_DIR)}`);
  const pending: { section: Section; sourceFile: string }[] = [];
  const singles: { file: string; blocks: Block[]; partNumber: number | null }[] = [];

  for (const file of files) {
    const { value: html, messages } = await mammoth.convertToHtml(
      { path: path.join(SRC_DIR, file) },
      { styleMap: STYLE_MAP }
    );
    const warnings = messages.length;
    const blocks = toBlocks(html);

    const sections = splitIntoSections(blocks, file);
    if (sections) {
      console.log(`  • ${file}: ${sections.length} articles (${blocks.length} paragraphs)${warnings ? `, ${warnings} mammoth warnings` : ''}`);
      sections.forEach(section => pending.push({ section, sourceFile: file }));
    } else {
      const partNumber = partNumberFromFilename(file) ?? (blocks[0] ? articleNumberOf(blocks[0].norm) : null);
      console.log(`  • ${file}: 1 article, part ${partNumber ?? '?'} (${blocks.length} paragraphs)${warnings ? `, ${warnings} mammoth warnings` : ''}`);
      singles.push({ file, blocks, partNumber });
    }
  }

  // Files with no detectable number go after the highest known part.
  let nextPart = Math.max(0, ...pending.map(p => p.section.partNumber), ...singles.map(s => s.partNumber ?? 0)) + 1;
  for (const s of singles) {
    if (s.partNumber === null) {
      console.warn(`  ⚠ ${s.file}: no part number in filename or first line; assigned part ${nextPart}.`);
      s.partNumber = nextPart++;
    }
    pending.push({
      section: { partNumber: s.partNumber, title: titleFrom(s.blocks, path.parse(s.file).name), blocks: s.blocks },
      sourceFile: s.file,
    });
  }

  pending.sort((a, b) => a.section.partNumber - b.section.partNumber);

  // Duplicate part numbers keep both articles but get distinct ids (lot-14, lot-14-b).
  const seen = new Map<number, number>();
  const articles = pending.map(({ section, sourceFile }) => {
    const n = section.partNumber;
    const dup = seen.get(n) ?? 0;
    seen.set(n, dup + 1);
    const suffix = dup === 0 ? '' : String.fromCharCode(0x61 + dup); // b, c, …
    if (dup > 0) console.warn(`  ⚠ Part ${n} appears more than once (${sourceFile}); using id lot-${String(n).padStart(2, '0')}-${suffix}.`);
    const id = `lot-${String(n).padStart(2, '0')}${suffix ? `-${suffix}` : ''}`;
    return buildArticle(section, id, `p${n}${suffix}`, sourceFile);
  });

  const corpus = await writeCorpus(articles);
  console.log(
    `✓ ${corpus.totalArticles} articles, ${corpus.totalParagraphs} paragraphs, ${corpus.totalVerses} verses → ${path.relative(ROOT, OUT_FILE)}`
  );
  printVerseSummary(corpus);
}

main().catch(err => {
  console.error('✗ build-blog failed:', err);
  process.exit(1);
});
