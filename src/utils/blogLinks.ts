import type { BlogArticle, BlogRef, BlogVerse } from '../types/blog';
import type { IdeaNode } from '../types';
import { extractVerses, normalizeArabic, paragraphNumber, toArabicDigits } from './arabic';

// Links between the Idea Builder tree and the blog corpus: blogRefs, citations
// and verse matching. Shared by ParametersTab, VersesTab, StatsTab and docxExport.

export const QUOTE_LENGTH = 50;

export function makeQuote(text: string, length = QUOTE_LENGTH): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, length).trim();
}

// Paragraph ids are unique across the corpus, so they win over the part number
// (which can repeat, e.g. lot-14 and lot-14-b).
export function findRefArticle(articles: BlogArticle[], ref: BlogRef): BlogArticle | undefined {
  if (ref.paragraphId) {
    const byParagraph = articles.find(a => a.paragraphs.some(p => p.id === ref.paragraphId));
    if (byParagraph) return byParagraph;
  }
  return articles.find(a => a.partNumber === ref.partNumber);
}

// "المقال ٧ ¶١٢"
export function formatBlogRefLabel(ref: BlogRef): string {
  const part = `المقال ${toArabicDigits(ref.partNumber)}`;
  return ref.paragraphId ? `${part} ¶${toArabicDigits(paragraphNumber(ref.paragraphId))}` : part;
}

// "د. رشيد الجراح، [عنوان المقال]، الفقرة X"
export function formatBlogCitation(ref: BlogRef, article?: BlogArticle): string {
  const title = article?.title ?? `المقال ${toArabicDigits(ref.partNumber)}`;
  const paragraph = ref.paragraphId ? `، الفقرة ${toArabicDigits(paragraphNumber(ref.paragraphId))}` : '';
  return `د. رشيد الجراح، ${title}${paragraph}`;
}

export function verseReference(verse: Pick<BlogVerse, 'surah' | 'ayahFrom' | 'ayahTo'>): string | null {
  if (!verse.surah || verse.ayahFrom === undefined) return null;
  const range = verse.ayahTo !== undefined && verse.ayahTo !== verse.ayahFrom
    ? `${verse.ayahFrom}-${verse.ayahTo}`
    : `${verse.ayahFrom}`;
  return `${verse.surah}: ${range}`;
}

// The tree's quranicVerses format: ﴿text﴾ [سورة: آية]
export function formatVerseForTree(verse: BlogVerse): string {
  const ref = verseReference(verse);
  return `﴿${verse.text}﴾${ref ? ` [${ref}]` : ''}`;
}

// ---------------------------------------------------------------------------
// Verse matching
// ---------------------------------------------------------------------------

interface VerseRange { surah: string; from: number; to: number }
interface ComparableVerse { range: VerseRange | null; letters: string }

// Below this many letters a text match is too likely to be a coincidence.
const MIN_TEXT_MATCH_LETTERS = 8;

const normalizeSurah = (s: string) => normalizeArabic(s).replace(/^سورة\s+/, '');
const lettersOf = (s: string) => normalizeArabic(s).replace(/[^ء-ي]/g, '');

function parseVerseKey(key: string): VerseRange | null {
  if (key.startsWith('unref:')) return null;
  const m = normalizeArabic(key).match(/^(.+?)\s*:\s*(\d+)(?:\s*-\s*(\d+))?$/);
  if (!m) return null;
  return { surah: normalizeSurah(m[1]), from: Number(m[2]), to: Number(m[3] ?? m[2]) };
}

// A tree verse field may hold several ﴿…﴾ verses, or only a bare reference.
function parseTreeVerses(raw: string): ComparableVerse[] {
  const found = extractVerses(raw, '', 0).map(v => ({ range: parseVerseKey(v.key), letters: lettersOf(v.text) }));
  if (found.length > 0) return found;

  const ref = normalizeArabic(raw).match(/[[(]\s*([^\])\d:،,]+?)\s*[:،,]?\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*[\])]/);
  return ref
    ? [{ range: { surah: normalizeSurah(ref[1]), from: Number(ref[2]), to: Number(ref[3] ?? ref[2]) }, letters: '' }]
    : [];
}

// Same surah with overlapping ayah ranges; when either side has no reference,
// fall back to one normalized text containing the other.
function versesMatch(a: ComparableVerse, b: ComparableVerse): boolean {
  if (a.range && b.range) {
    return a.range.surah === b.range.surah && a.range.from <= b.range.to && b.range.from <= a.range.to;
  }
  return (
    a.letters.length >= MIN_TEXT_MATCH_LETTERS &&
    b.letters.length >= MIN_TEXT_MATCH_LETTERS &&
    (a.letters.includes(b.letters) || b.letters.includes(a.letters))
  );
}

export interface BlogVerseMatch {
  article: BlogArticle;
  verse: BlogVerse;
}

// Every blog verse matching a verse from a tree node's quranicVerses field.
export function findBlogMatches(treeVerseText: string, articles: BlogArticle[]): BlogVerseMatch[] {
  const treeVerses = parseTreeVerses(treeVerseText);
  if (treeVerses.length === 0) return [];

  const matches: BlogVerseMatch[] = [];
  for (const article of articles) {
    for (const verse of article.verses) {
      const blogVerse = { range: parseVerseKey(verse.key), letters: lettersOf(verse.text) };
      if (treeVerses.some(t => versesMatch(t, blogVerse))) matches.push({ article, verse });
    }
  }
  return matches;
}

// For display: one entry per paragraph.
export function uniqueByParagraph(matches: BlogVerseMatch[]): BlogVerseMatch[] {
  const seen = new Set<string>();
  return matches.filter(m => !seen.has(m.verse.paragraphId) && seen.add(m.verse.paragraphId));
}

// Groups blog verses by reference (or by text when unreferenced), for listing
// verses that appear in the blog but nowhere in the tree.
export function groupBlogVerses(matches: BlogVerseMatch[]): BlogVerseMatch[][] {
  const groups = new Map<string, BlogVerseMatch[]>();
  for (const m of matches) {
    const range = parseVerseKey(m.verse.key);
    const key = range ? `${range.surah}:${range.from}-${range.to}` : `text:${lettersOf(m.verse.text)}`;
    const group = groups.get(key);
    if (group) {
      if (!group.some(g => g.verse.paragraphId === m.verse.paragraphId)) group.push(m);
    } else {
      groups.set(key, [m]);
    }
  }
  return [...groups.values()];
}

// Verses from the tree that also appear in the blog. Tree verses are grouped
// the same way VersesTab groups its cards (first 50 chars of the field).
export function countSharedTreeVerses(nodes: IdeaNode[], articles: BlogArticle[]): number {
  const seen = new Set<string>();
  let shared = 0;
  for (const node of nodes) {
    const raw = node.quranicVerses?.trim();
    if (!raw) continue;
    const key = raw.slice(0, 50);
    if (seen.has(key)) continue;
    seen.add(key);
    if (findBlogMatches(raw, articles).length > 0) shared++;
  }
  return shared;
}
