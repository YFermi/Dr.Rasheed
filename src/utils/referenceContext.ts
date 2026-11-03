import type { ReferenceArticle } from '../store/useReferenceStore';
import { normalizeArabic, replaceQuranGlyphs } from './arabic';

// The style reference sent with the outline and every section: an excerpt of the
// latest reference article of the story (its introduction, its strongest axis
// and its conclusion), with the style notes extracted when it was analysed.

export const REFERENCE_EXCERPT_WORDS = 3000;
const INTRO_WORDS = 600;
const CONCLUSION_WORDS = 400;
const MIN_AXIS_WORDS = 150; // a smaller remainder is not worth another axis
// Same text as api/article/section.ts and outline.ts check for
export const NO_REFERENCE = 'لا يوجد مقال مرجعي. التزم بدليل الأسلوب العام فقط.';

// Markers of Dr. Rasheed's way of reasoning; the axis densest in them is "the strongest"
const STYLE_MARKERS = ['نظن', 'ظني', 'السؤال', 'لماذا', 'النتيجه', 'افتراء', 'يا ساده', 'عزيزي القارئ', 'في راينا', 'الا ترون', 'نحن'];

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const axisKey = (label: string) => normalizeArabic(label.replace(/^المحور\s+\S+\s*:\s*/, '')).trim();

function paragraphsOf(fullText: string): string[] {
  return replaceQuranGlyphs(fullText, '﴿…﴾')
    .split(/\n{2,}|\n/)
    .map(p => p.trim())
    .filter(p => p && !/^[وف]?للحديث بقي/.test(normalizeArabic(p)));
}

// Whole paragraphs from the start (or the end) up to `budget` words
function take(paragraphs: string[], budget: number, fromEnd = false): string[] {
  const list = fromEnd ? [...paragraphs].reverse() : paragraphs;
  const picked: string[] = [];
  let n = 0;
  for (const p of list) {
    const w = words(p);
    if (n + w > budget) {
      if (picked.length === 0) picked.push(p.split(/\s+/).slice(0, budget).join(' ') + '…');
      break;
    }
    picked.push(p);
    n += w;
  }
  return fromEnd ? picked.reverse() : picked;
}

function markerDensity(paragraphs: string[]): number {
  const text = normalizeArabic(paragraphs.join(' '));
  const hits = STYLE_MARKERS.reduce((n, m) => n + (text.split(m).length - 1), 0);
  return hits / Math.max(1, words(text) / 100);
}

// Introduction + the strongest axes + conclusion, ≤ maxWords words
export function pickReferenceExcerpt(
  article: Pick<ReferenceArticle, 'fullText' | 'structure'>,
  maxWords = REFERENCE_EXCERPT_WORDS
): string {
  const paragraphs = paragraphsOf(article.fullText);
  if (words(paragraphs.join(' ')) <= maxWords) return paragraphs.join('\n\n');

  // Axis boundaries: short paragraphs that carry an axis title of the analysis
  const keys = (article.structure?.axes ?? []).map(axisKey).filter(k => k.length > 2);
  const starts = paragraphs
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => words(p) <= 20 && keys.some(k => { const n = normalizeArabic(p); return n.includes(k) || k.includes(n); }))
    .map(({ i }) => i);

  let intro: string[];
  let segments: { title: string; paragraphs: string[] }[];
  if (starts.length > 0) {
    intro = paragraphs.slice(0, starts[0]);
    segments = starts.map((s, k) => ({ title: paragraphs[s], paragraphs: paragraphs.slice(s + 1, starts[k + 1] ?? paragraphs.length) }));
  } else {
    // No headings found: the middle of the article, in windows of ~10 paragraphs
    const cut = Math.max(1, Math.round(paragraphs.length * 0.15));
    intro = paragraphs.slice(0, cut);
    const middle = paragraphs.slice(cut, paragraphs.length - cut);
    segments = [];
    for (let i = 0; i < middle.length; i += 10) segments.push({ title: '', paragraphs: middle.slice(i, i + 10) });
  }
  const introPart = take(intro.length ? intro : paragraphs, INTRO_WORDS);
  const conclusionPart = take(paragraphs, CONCLUSION_WORDS, true);
  const used = new Set([...introPart, ...conclusionPart]);

  // The strongest axis first; the words left go to the next strongest ones
  const candidates = segments
    .map((s, order) => ({ ...s, order, paragraphs: s.paragraphs.filter(p => !used.has(p)) }))
    .filter(s => s.paragraphs.length > 0);
  const strength = (s: { paragraphs: string[] }) => markerDensity(s.paragraphs) * Math.sqrt(words(s.paragraphs.join(' ')));
  let budget = maxWords - words([...introPart, ...conclusionPart].join(' '));
  const axes: { order: number; title: string; paragraphs: string[] }[] = [];
  for (const s of [...candidates].sort((a, b) => strength(b) - strength(a))) {
    if (budget < MIN_AXIS_WORDS) break;
    const part = take(s.paragraphs, budget);
    if (part.length === 0) continue;
    axes.push({ order: s.order, title: s.title, paragraphs: part });
    budget -= words(part.join(' '));
  }

  return [
    `[المقدمة]\n${introPart.join('\n\n')}`,
    ...axes.sort((a, b) => a.order - b.order).map(a => `[من المحور${a.title ? `: ${a.title}` : ''}]\n${a.paragraphs.join('\n\n')}`),
    `[الخاتمة]\n${conclusionPart.join('\n\n')}`,
  ].join('\n\n');
}

// The text sent as referenceContext: the excerpt and the style notes, or NO_REFERENCE
export function referenceContextOf(article: ReferenceArticle | undefined): string {
  if (!article) return NO_REFERENCE;
  return [
    `المقال: «${article.title}»`,
    pickReferenceExcerpt(article),
    ...(article.styleNotes ? [`ملاحظات أسلوبية مستخلصة من هذا المقال:\n${article.styleNotes}`] : []),
  ].join('\n\n');
}

// The latest reference article of a story (by the date it was added)
export function latestReferenceArticle(articles: ReferenceArticle[], storyName: string): ReferenceArticle | undefined {
  return articles
    .filter(a => a.storyName === storyName)
    .reduce<ReferenceArticle | undefined>((best, a) => (!best || a.dateAdded > best.dateAdded ? a : best), undefined);
}

// Its last paragraphs, for the opening recap of the new part
export function referenceEnding(article: ReferenceArticle, maxWords = 120): string {
  return take(paragraphsOf(article.fullText).filter(p => words(p) >= 6), maxWords, true).join('\n\n');
}
