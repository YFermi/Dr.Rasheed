import type { BlogCorpus, BlogArticle } from '../types/blog';
import type { ArticleNodeInput, CorpusExcerpt } from '../types/article';
import type { ReferenceArticle } from '../store/useReferenceStore';
import { DEFAULT_STORY, referenceToBlogArticle } from '../store/useReferenceStore';
import { normalizeArabic, queryStems, replaceQuranGlyphs } from './arabic';

// Passages of the story's earlier articles (blog.json + reference articles) that
// are most relevant to one axis, sent with its section so the model can cite and
// link to them. Uses the app's Arabic normalisation and stemming; paragraphs are
// scored by the ideas' words they contain (rare words weigh more, words found
// almost everywhere such as «لوط» are ignored) plus the verses they share.

export const MAX_EXCERPTS = 8;
export const MAX_EXCERPT_TOTAL_WORDS = 4000;
const MAX_EXCERPT_WORDS = 450;
const EXCERPT_TARGET_WORDS = 250;
const MIN_PARAGRAPH_WORDS = 25;
const MAX_PER_ARTICLE = 2;
const COMMON_STEM_SHARE = 0.15; // a stem in more than 15% of paragraphs says nothing
const VERSE_BONUS = 4;
const IDEA_TEXT_WORDS = 40; // label + the start of the notes

interface VerseKey { surah: string; from: number; to: number }

interface SearchParagraph {
  article: SearchArticle;
  index: number;
  text: string;
  norm: string;
  verses: VerseKey[];
}

export interface SearchArticle {
  source: string; // "الجزء 15" / "مقال مرجعي"
  title: string;
  paragraphs: SearchParagraph[];
}

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const surahKey = (s: string) => normalizeArabic(s).replace(/^سوره\s+/, '').replace(/\s+/g, '');

function parseRef(ref: string): VerseKey | null {
  const m = ref.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).match(/^\s*(.+?)\s*:\s*(\d+)(?:\s*-\s*(\d+))?\s*$/);
  return m ? { surah: surahKey(m[1]), from: Number(m[2]), to: Number(m[3] ?? m[2]) } : null;
}

const overlaps = (a: VerseKey, b: VerseKey) => a.surah === b.surah && a.from <= b.to && b.from <= a.to;

function fromBlogArticle(article: BlogArticle, source = `الجزء ${article.partNumber}`): SearchArticle {
  const target: SearchArticle = { source, title: article.title, paragraphs: [] };
  const versesByParagraph = new Map<string, VerseKey[]>();
  for (const v of article.verses) {
    if (!v.surah || !v.ayahFrom) continue;
    const list = versesByParagraph.get(v.paragraphId) ?? [];
    list.push({ surah: surahKey(v.surah), from: v.ayahFrom, to: v.ayahTo ?? v.ayahFrom });
    versesByParagraph.set(v.paragraphId, list);
  }
  target.paragraphs = article.paragraphs
    .filter(p => !p.isHeading)
    .map((p, index) => ({ article: target, index, text: replaceQuranGlyphs(p.text, '﴿…﴾'), norm: p.norm, verses: versesByParagraph.get(p.id) ?? [] }));
  return target;
}

// The blog corpus is the story of Lot (content/blog/قصة لوط, plus approved
// articles saved to it); reference articles carry their own story name.
export function storySources(storyName: string, corpus: BlogCorpus | null, referenceArticles: ReferenceArticle[]): SearchArticle[] {
  return [
    ...(storyName === DEFAULT_STORY && corpus ? corpus.articles.map(a => fromBlogArticle(a)) : []),
    ...referenceArticles.filter(a => a.storyName === storyName).map(a => fromBlogArticle(referenceToBlogArticle(a), 'مقال مرجعي')),
  ];
}

// Tables and lists of titles (short lines) are not prose to learn from
function isProse(text: string): boolean {
  const lines = text.split('\n').filter(l => l.trim());
  return lines.length <= 1 || words(text) / lines.length >= 10;
}

// Mostly a quoted verse: it reads better with the commentary after it
function isMostlyVerse(text: string): boolean {
  const quoted = (text.match(/﴿[^﴾]*﴾/g) ?? []).join('').length;
  return quoted / Math.max(1, text.length) > 0.6;
}

const MAX_REASON_IDEAS = 3;

function trimWords(text: string, max: number): string {
  const list = text.split(/\s+/).filter(Boolean);
  return list.length <= max ? text : `${list.slice(0, max).join(' ')}…`;
}

// The 5–8 most relevant passages for an axis's ideas, ≤ 4,000 words in all
export function corpusSearch(
  ideas: Pick<ArticleNodeInput, 'label' | 'notes' | 'verseRefs'>[],
  sources: SearchArticle[]
): CorpusExcerpt[] {
  const paragraphs = sources.flatMap(a => a.paragraphs).filter(p => words(p.text) >= MIN_PARAGRAPH_WORDS && isProse(p.text));
  if (paragraphs.length === 0 || ideas.length === 0) return [];

  const df = new Map<string, number>();
  const weight = (stem: string) => {
    if (!df.has(stem)) df.set(stem, paragraphs.reduce((n, p) => n + (p.norm.includes(stem) ? 1 : 0), 0));
    const count = df.get(stem)!;
    if (count === 0 || count / paragraphs.length > COMMON_STEM_SHARE) return 0;
    return Math.log(paragraphs.length / count);
  };

  const scores = new Map<SearchParagraph, { score: number; ideas: Set<string>; verses: Set<string> }>();
  for (const idea of ideas) {
    // An axis's own label starts with «المحور الأول:», which is no topic
    const label = idea.label.replace(/^المحور\s+\S+\s*:\s*/, '');
    const text = `${label} ${idea.notes.split(/\s+/).slice(0, IDEA_TEXT_WORDS).join(' ')}`;
    const stems = queryStems(text).filter(s => s.length >= 3).map(s => ({ s, w: weight(s) })).filter(x => x.w > 0);
    const refs = idea.verseRefs.map(r => ({ ref: r, key: parseRef(r) })).filter((r): r is { ref: string; key: VerseKey } => r.key !== null);
    const minMatches = Math.min(2, stems.length);

    for (const p of paragraphs) {
      const matched = stems.filter(x => p.norm.includes(x.s));
      const sharedVerses = refs.filter(r => p.verses.some(v => overlaps(v, r.key)));
      const wordScore = matched.length >= minMatches && matched.length > 0 ? matched.reduce((n, x) => n + x.w, 0) : 0;
      const score = wordScore + sharedVerses.length * VERSE_BONUS;
      if (score <= 0) continue;
      const entry = scores.get(p) ?? { score: 0, ideas: new Set<string>(), verses: new Set<string>() };
      entry.score += score;
      if (wordScore > 0) entry.ideas.add(label);
      sharedVerses.forEach(r => entry.verses.add(r.ref));
      scores.set(p, entry);
    }
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score);
  const perArticle = new Map<SearchArticle, number>();
  const picked: CorpusExcerpt[] = [];
  let total = 0;
  for (const [p, { ideas: matchedIdeas, verses }] of ranked) {
    if (picked.length >= MAX_EXCERPTS) break;
    if ((perArticle.get(p.article) ?? 0) >= MAX_PER_ARTICLE) continue;
    // A passage, not a bare paragraph: the following paragraphs of the same
    // article are added up to ~EXCERPT_TARGET_WORDS (a quoted verse always gets
    // the commentary after it)
    const parts = [p.text];
    for (let i = p.index + 1; i < p.article.paragraphs.length; i++) {
      const last = parts[parts.length - 1];
      if (words(parts.join(' ')) >= EXCERPT_TARGET_WORDS && !isMostlyVerse(last)) break;
      parts.push(p.article.paragraphs[i].text);
    }
    const body = parts.join('\n\n');
    const text = trimWords(body, Math.min(MAX_EXCERPT_WORDS, MAX_EXCERPT_TOTAL_WORDS - total));
    if (words(text) < MIN_PARAGRAPH_WORDS) break;
    const reasons = [
      ...(matchedIdeas.size ? [`يتناول ${[...matchedIdeas].slice(0, MAX_REASON_IDEAS).map(l => `«${l}»`).join('، ')}`] : []),
      ...(verses.size ? [`يستشهد بـ ${[...verses].join('، ')}`] : []),
    ];
    picked.push({ source: p.article.source, title: p.article.title, text, reason: reasons.join('؛ ') });
    perArticle.set(p.article, (perArticle.get(p.article) ?? 0) + 1);
    total += words(text);
  }
  return picked;
}
