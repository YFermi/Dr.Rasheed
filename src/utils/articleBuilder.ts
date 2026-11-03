import type { IdeaNode } from '../types';
import type { BlogCorpus } from '../types/blog';
import type {
  ArticleInput,
  ArticleNodeInput,
  ArticleOptions,
  ArticleOutline,
  ArticleSectionInput,
  DraftSection,
  GeneratedArticle,
  SectionResponse,
  StitchResponse,
} from '../types/article';
import { extractVerses, containsQuranGlyphs, normalizeArabic, toArabicDigits } from './arabic';
import { callApiWithKey } from './apiKey';

// Client-side orchestration of article generation: tree → input, then the
// /api/article/* calls one after another (outline → sections → stitches), then
// canonical verse text from the Tanzil data (loaded lazily, ~2 MB).

export const DEFAULT_ARTICLE_OPTIONS: ArticleOptions = {
  targetLength: 4000,
  styleMode: 'rasheed-original',
  includeDeferred: false,
};

const MIN_SECTIONS = 2;
const PREVIOUS_ENDING_MAX_PARAGRAPHS = 4;
const PREVIOUS_ENDING_WORDS = 120;
const PREVIOUS_ENDING_MAX_CHARS = 1500;
// Shorter trailing lines are signatures and dates ("د. رشيد الجراح", "30 أكتوبر 2026")
const MIN_ENDING_LINE_WORDS = 6;
const STITCH_PARAGRAPHS = 2;

// ---- Tree → article input -----------------------------------------------------

export function isIncluded(node: IdeaNode, options: ArticleOptions): boolean {
  if (!node.includeInDoc || node.status === 'rejected') return false;
  return options.includeDeferred || node.status !== 'deferred';
}

// "الأعراف: 80" / "الأعراف:٨٠" → "الأعراف:80"; null if not a reference
function normalizeRef(ref: string): string | null {
  const m = normalizeArabic(ref).match(/^(.+?)\s*:\s*(\d+)(?:\s*-\s*(\d+))?$/);
  if (!m) return null;
  const surah = ref.slice(0, ref.indexOf(':')).trim();
  return `${surah}:${m[2]}${m[3] && m[3] !== m[2] ? `-${m[3]}` : ''}`;
}

export function verseRefsOf(node: IdeaNode): string[] {
  const fromVerses = node.quranicVerses
    ? extractVerses(node.quranicVerses, '', 0).filter(v => !v.key.startsWith('unref:')).map(v => v.key)
    : [];
  const refs = [...fromVerses, ...node.crossReferences]
    .map(normalizeRef)
    .filter((r): r is string => r !== null);
  return [...new Set(refs)];
}

function toNodeInput(node: IdeaNode, depth: number, labels: Map<string, string>): ArticleNodeInput {
  return {
    id: node.id,
    type: node.type === 'evidence' || node.type === 'question' ? node.type : 'idea',
    label: node.arabicLabel,
    notes: node.notes ?? '',
    verseRefs: verseRefsOf(node),
    // Published ideas come from Dr. Rasheed's articles; the rest are new and may
    // be introduced with «افتراء من عند أنفسنا».
    isNew: node.source !== 'rasheed_article' && !(node.blogRefs?.length),
    status: node.status,
    links: node.linkedIdeas.map(l => ({ type: l.type, target: labels.get(l.targetId) ?? l.targetId })),
    blogParts: [...new Set((node.blogRefs ?? []).map(r => r.partNumber))],
    depth,
  };
}

export interface PreviousArticle {
  title: string;
  ending: string;
}

// The last paragraphs of the latest blog part, for the opening recap.
export function previousArticleOf(corpus: BlogCorpus | null): PreviousArticle {
  const last = corpus?.articles.reduce<BlogCorpus['articles'][number] | null>(
    (best, a) => (!best || a.partNumber > best.partNumber ? a : best),
    null
  );
  if (!last) return { title: '', ending: '' };
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
  const body = last.paragraphs.filter(p =>
    !p.isHeading &&
    !containsQuranGlyphs(p.text) &&
    words(p.text) >= MIN_ENDING_LINE_WORDS &&
    !/^[وف]?للحديث بقي/.test(normalizeArabic(p.text))
  );
  const picked: string[] = [];
  for (let i = body.length - 1; i >= 0 && picked.length < PREVIOUS_ENDING_MAX_PARAGRAPHS; i--) {
    picked.unshift(body[i].text);
    if (words(picked.join(' ')) >= PREVIOUS_ENDING_WORDS) break;
  }
  return { title: last.title, ending: picked.join('\n\n').slice(-PREVIOUS_ENDING_MAX_CHARS) };
}

// One section per included axis that has at least one included idea under it.
export function buildArticleInput(
  tree: IdeaNode,
  options: ArticleOptions,
  context: { projectTitle: string; previous: PreviousArticle }
): ArticleInput {
  const labels = new Map<string, string>();
  const index = (n: IdeaNode) => {
    labels.set(n.id, n.arabicLabel);
    n.children?.forEach(index);
  };
  index(tree);

  const sections: ArticleSectionInput[] = [];
  for (const axis of tree.children ?? []) {
    if (axis.type !== 'axis' || !isIncluded(axis, options)) continue;

    const nodes: ArticleNodeInput[] = [];
    // The axis's own notes / verses frame the section
    if (axis.notes?.trim() || verseRefsOf(axis).length > 0) nodes.push(toNodeInput(axis, 0, labels));
    const walk = (n: IdeaNode, depth: number) => {
      for (const child of n.children ?? []) {
        if (!isIncluded(child, options)) continue; // an excluded node excludes its subtree
        nodes.push(toNodeInput(child, depth, labels));
        walk(child, depth + 1);
      }
    };
    walk(axis, 1);

    if (nodes.every(n => n.depth === 0)) continue; // no ideas under this axis
    sections.push({
      id: axis.id,
      axisName: axis.arabicLabel.replace(/^المحور\s+\S+\s*:\s*/, ''),
      nodes,
      verseRefs: [...new Set(nodes.flatMap(n => n.verseRefs))],
    });
  }

  return {
    projectTitle: context.projectTitle,
    previousArticleTitle: context.previous.title,
    previousArticleEnding: context.previous.ending,
    targetLength: options.targetLength,
    styleMode: options.styleMode,
    sections,
    allowedVerseRefs: [...new Set([...verseRefsOf(tree), ...sections.flatMap(s => s.verseRefs)])],
  };
}

export function hasEnoughContent(input: ArticleInput): boolean {
  return input.sections.length >= MIN_SECTIONS;
}

// ---- Staleness -----------------------------------------------------------------

// FNV-1a over the section's inputs: any edit, reorder, (de)selection or status
// change of its ideas changes the hash.
export function computeSectionHash(section: ArticleSectionInput): string {
  const s = JSON.stringify({ axisName: section.axisName, nodes: section.nodes, verseRefs: section.verseRefs });
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// ---- Tree order ------------------------------------------------------------------

// Same list as api/_lib/gemini.ts, which heads each section «المحور الأول: …»
const SECTION_ORDINALS = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
const SECTION_HEADING_PREFIX = /^المحور\s+\S+\s*:/;

// Sorts by position in the tree's axis order; items whose axis left the tree go
// last (the sort is stable, so they keep their relative order).
export function sortByAxisOrder<T extends { id: string }>(items: T[], axisIds: string[]): T[] {
  const rank = new Map(axisIds.map((id, i) => [id, i]));
  const at = (id: string) => rank.get(id) ?? axisIds.length;
  return [...items].sort((a, b) => at(a.id) - at(b.id));
}

function renumberHeading(section: DraftSection, i: number): DraftSection {
  const [first, ...rest] = section.blocks;
  if (first?.type !== 'heading' || !SECTION_HEADING_PREFIX.test(first.text)) return section;
  const text = first.text.replace(SECTION_HEADING_PREFIX, `المحور ${SECTION_ORDINALS[i] ?? i + 1}:`);
  return text === first.text ? section : { ...section, blocks: [{ ...first, text }, ...rest] };
}

// Puts the draft's sections (and their outline plans) in the tree's axis order and
// renumbers the «المحور …» headings; no text is regenerated. Returns the same
// article when nothing changed.
export function orderArticleByTree(article: GeneratedArticle, axisIds: string[]): GeneratedArticle {
  const sections = sortByAxisOrder(article.sections, axisIds).map(renumberHeading);
  const outlineSections = sortByAxisOrder(article.outline.sections, axisIds);
  const unchanged = sections.every((s, i) => s === article.sections[i])
    && outlineSections.every((s, i) => s === article.outline.sections[i]);
  return unchanged ? article : { ...article, sections, outline: { ...article.outline, sections: outlineSections } };
}

// ---- API calls -------------------------------------------------------------------

// Sends the browser's API key with the request (see utils/apiKey.ts)
export async function callAPI<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return callApiWithKey<T>(path, body, signal);
}

// ---- Paragraph helpers -----------------------------------------------------------

const paragraphIndices = (s: DraftSection) => s.blocks.flatMap((b, i) => (b.type === 'paragraph' ? [i] : []));

function lastParagraphs(s: DraftSection, n: number): string[] {
  return paragraphIndices(s).slice(-n).map(i => s.blocks[i].text);
}

function firstParagraphs(s: DraftSection, n: number): string[] {
  return paragraphIndices(s).slice(0, n).map(i => s.blocks[i].text);
}

function replaceParagraphs(s: DraftSection, which: 'first' | 'last', texts: string[]): DraftSection {
  const all = paragraphIndices(s);
  const targets = which === 'last' ? all.slice(-texts.length) : all.slice(0, texts.length);
  const blocks = s.blocks.map(b => ({ ...b }));
  targets.forEach((blockIndex, k) => (blocks[blockIndex].text = texts[k]));
  return { ...s, blocks, wordCount: blocks.filter(b => b.type === 'paragraph').reduce((n, b) => n + b.text.split(/\s+/).filter(Boolean).length, 0) };
}

// ---- Verse text --------------------------------------------------------------------

// Verse blocks only carry a reference; their text always comes from Tanzil.
export async function resolveVerses(sections: DraftSection[]): Promise<DraftSection[]> {
  const { resolveVerseRef } = await import('./quranLookup');
  return sections.map(s => ({
    ...s,
    blocks: s.blocks.map(b => {
      if (b.type !== 'verse' || !b.ref) return b;
      const resolved = resolveVerseRef(b.ref);
      return resolved ? { ...b, text: resolved.text, unresolved: false } : { ...b, text: '', unresolved: true };
    }),
  }));
}

// ---- Orchestration -----------------------------------------------------------------

export interface GenerationProgress {
  label: string;
  step: number;
  total: number;
}

type ProgressFn = (p: GenerationProgress) => void;

const ordinal = (i: number) => toArabicDigits(i + 1);

async function writeSection(
  outline: ArticleOutline,
  section: ArticleSectionInput,
  allowedVerseRefs: string[],
  previousEnding: string,
  nextPlan: string,
  signal?: AbortSignal,
  extra: { wordBudget?: number; instruction?: string } = {}
): Promise<DraftSection> {
  const plan = outline.sections.find(s => s.id === section.id)!;
  const response = await callAPI<SectionResponse>('/api/article/section', {
    outline,
    sectionId: section.id,
    sectionNodes: section.nodes,
    previousSectionEnding: previousEnding,
    nextSectionPlan: nextPlan,
    allowedVerseRefs,
    ...extra,
  }, signal);
  return { ...response, id: section.id, axisName: plan.axisName };
}

// Smooths the boundary between sections[i] and sections[i + 1]; a locked side
// keeps its text.
async function stitchBoundary(
  sections: DraftSection[],
  i: number,
  outline: ArticleOutline,
  locked: Set<string>,
  signal?: AbortSignal
): Promise<void> {
  const a = sections[i];
  const b = sections[i + 1];
  if (locked.has(a.id) && locked.has(b.id)) return;
  const aEnd = lastParagraphs(a, STITCH_PARAGRAPHS);
  const bStart = firstParagraphs(b, STITCH_PARAGRAPHS);
  if (aEnd.length === 0 || bStart.length === 0) return;

  const plan = outline.sections.find(s => s.id === a.id);
  const result = await callAPI<StitchResponse>('/api/article/stitch', {
    sectionA_ending: aEnd,
    sectionB_start: bStart,
    transitionPlan: [plan?.transitionOut, outline.sections.find(s => s.id === b.id)?.transitionIn].filter(Boolean).join(' — '),
  }, signal);
  if (!locked.has(a.id)) sections[i] = replaceParagraphs(a, 'last', result.newA_ending);
  if (!locked.has(b.id)) sections[i + 1] = replaceParagraphs(b, 'first', result.newB_start);
}

export async function generateArticle(
  input: ArticleInput,
  options: ArticleOptions,
  onProgress: ProgressFn,
  { signal, existing, locked = new Set() }: { signal?: AbortSignal; existing?: GeneratedArticle | null; locked?: Set<string> } = {}
): Promise<GeneratedArticle> {
  const n = input.sections.length;
  const total = 1 + n + Math.max(0, n - 1) + 1;
  let step = 0;
  const report = (label: string) => onProgress({ label, step: ++step, total });

  // 1. Outline
  report('جاري إنشاء المخطط...');
  const outline = await callAPI<ArticleOutline>('/api/article/outline', {
    tree: input,
    previousArticleEnding: input.previousArticleEnding,
    targetLength: options.targetLength,
    numAxes: n,
    styleMode: options.styleMode,
  }, signal);

  // 2. Sections, one after another (each call stays under the function time limit)
  const sections: DraftSection[] = [];
  for (let i = 0; i < n; i++) {
    const s = input.sections[i];
    report(`جاري كتابة المحور ${ordinal(i)} من ${toArabicDigits(n)}...`);
    const kept = locked.has(s.id) ? existing?.sections.find(e => e.id === s.id) : undefined;
    if (kept) {
      sections.push(kept);
      continue;
    }
    const previousEnding = i === 0 ? outline.opening : lastParagraphs(sections[i - 1], 1).join('\n');
    const nextPlan = i + 1 < n ? outline.sections[i + 1].thesis : outline.closing;
    sections.push(await writeSection(outline, s, input.allowedVerseRefs, previousEnding, nextPlan, signal));
  }

  // 3. Transitions between neighbours
  for (let i = 0; i < n - 1; i++) {
    report(`جاري تنعيم الانتقالات (${ordinal(i)} من ${toArabicDigits(n - 1)})...`);
    await stitchBoundary(sections, i, outline, locked, signal);
  }

  // 4. Canonical verse text
  report('جاري إدراج الآيات...');
  const resolved = await resolveVerses(sections);

  return {
    title: outline.title,
    opening: outline.opening,
    closing: outline.closing,
    outline,
    sections: resolved,
    options,
    generatedAt: new Date().toISOString(),
    approvedAt: null,
  };
}

// Rewrites one section (optionally longer/shorter or with an editor's
// instruction) and re-stitches it with its neighbours.
export async function regenerateOneSection(
  article: GeneratedArticle,
  section: ArticleSectionInput,
  allowedVerseRefs: string[],
  extra: { wordBudget?: number; instruction?: string },
  onProgress: ProgressFn,
  { signal, locked = new Set() }: { signal?: AbortSignal; locked?: Set<string> } = {}
): Promise<GeneratedArticle> {
  const i = article.sections.findIndex(s => s.id === section.id);
  if (i < 0) throw new Error('هذا المحور غير موجود في المسودة');
  const outline = extra.wordBudget
    ? { ...article.outline, sections: article.outline.sections.map(s => (s.id === section.id ? { ...s, wordBudget: extra.wordBudget! } : s)) }
    : article.outline;
  const sections = [...article.sections];
  const total = 1 + (i > 0 ? 1 : 0) + (i < sections.length - 1 ? 1 : 0) + 1;
  let step = 0;
  const report = (label: string) => onProgress({ label, step: ++step, total });

  report(`جاري إعادة كتابة المحور ${ordinal(i)}...`);
  const previousEnding = i === 0 ? article.opening : lastParagraphs(sections[i - 1], 1).join('\n');
  const nextPlan = i + 1 < sections.length ? outline.sections[i + 1]?.thesis ?? '' : article.closing;
  sections[i] = await writeSection(outline, section, allowedVerseRefs, previousEnding, nextPlan, signal, extra);

  if (i > 0) {
    report('جاري تنعيم الانتقال السابق...');
    await stitchBoundary(sections, i - 1, outline, locked, signal);
  }
  if (i < sections.length - 1) {
    report('جاري تنعيم الانتقال اللاحق...');
    await stitchBoundary(sections, i, outline, locked, signal);
  }

  report('جاري إدراج الآيات...');
  const resolved = await resolveVerses(sections);
  return { ...article, outline, sections: resolved, approvedAt: null };
}

export function articleWordCount(article: GeneratedArticle): number {
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
  return words(article.opening) + words(article.closing) + article.sections.reduce((n, s) => n + s.wordCount, 0);
}
