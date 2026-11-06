import { ideaRole, type IdeaNode } from '../types';
import type { BlogCorpus } from '../types/blog';
import type {
  ArticleInput,
  ArticleNodeInput,
  ArticleOptions,
  ArticleOutline,
  ArticleSectionInput,
  CorpusExcerpt,
  DraftSection,
  GeneratedArticle,
  PreviousIdea,
  SectionPart,
  SectionResponse,
  StitchResponse,
} from '../types/article';
import type { ReferenceArticle } from '../store/useReferenceStore';
import { extractVerses, containsQuranGlyphs, normalizeArabic, toArabicDigits } from './arabic';
import { callApiWithKey } from './apiKey';
import { cleanArticle } from '../../lib/articleCleanup';
import { latestReferenceArticle, referenceContextOf } from './referenceContext';
import { corpusSearch, storySources } from './corpusSearch';

// Client-side orchestration of article generation: tree → input, then the
// /api/article/* calls one after another (outline → sections → stitches), then
// canonical verse text from the Tanzil data (loaded lazily, ~2 MB).

export const DEFAULT_ARTICLE_OPTIONS: ArticleOptions = {
  targetLength: 12000,
  sectionLength: 3000,
  styleMode: 'rasheed-original',
  includeDeferred: false,
  storyName: 'قصة لوط',
};

// Words per axis offered in the generation modal (Dr. Rasheed's axes: 1,000–3,000)
export const SECTION_LENGTHS = [
  { words: 1500, label: 'قصير' },
  { words: 2500, label: 'متوسط' },
  { words: 3000, label: 'طويل' },
];

// Options saved before sectionLength / storyName existed get the defaults
export function withOptionDefaults(options: Partial<ArticleOptions> | null | undefined): ArticleOptions {
  return { ...DEFAULT_ARTICLE_OPTIONS, ...(options ?? {}) };
}

// A long section is written in parts of at most this many words: models fall
// well short of long targets in one call, and each call stays short.
export const PART_MAX_WORDS = 1500;
export const partCount = (words: number) => Math.max(1, Math.ceil(words / PART_MAX_WORDS));

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
  // Reference ideas (from a finished article) are for linking, not for the text
  if (ideaRole(node) === 'reference') return false;
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

// The axes the article is written from, in tree order: the root axes, and the
// axes inside a «مقال جديد» root (a brainstorm session). A «مقال مرجعي» root is
// reference and stays out. With `options`, excluded roots and axes are skipped.
export function articleAxes(tree: IdeaNode, options?: ArticleOptions): IdeaNode[] {
  const included = (n: IdeaNode) => !options || isIncluded(n, options);
  return (tree.children ?? []).flatMap(n => {
    if (n.type !== 'axis' || ideaRole(n) === 'reference' || !included(n)) return [];
    if (!n.isArticleRoot) return [n];
    return (n.children ?? []).filter(c => c.type === 'axis' && included(c));
  });
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
  for (const axis of articleAxes(tree, options)) {

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
    // The whole article: the per-axis length × the axes
    targetLength: options.sectionLength ? options.sectionLength * sections.length : options.targetLength,
    ...(options.sectionLength ? { sectionLength: options.sectionLength } : {}),
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

// What the model gets besides the tree, per section and for the outline: the
// reference article (style), passages of the story corpus and the reference
// ideas (already treated). Built by the store from its data.
export interface SectionContext {
  referenceContext?: string;
  corpusExcerpts?: CorpusExcerpt[];
  previousIdeas?: PreviousIdea[];
}
export type SectionContextFn = (section: ArticleSectionInput) => SectionContext;

const noContext: SectionContextFn = () => ({});

// Writes one section, in parts when it is long: each part continues from the end
// of the one before. Returns the merged section.
async function writeSection(
  outline: ArticleOutline,
  section: ArticleSectionInput,
  allowedVerseRefs: string[],
  previousEnding: string,
  nextPlan: string,
  signal: AbortSignal | undefined,
  context: SectionContext,
  onPart: (index: number, count: number) => void,
  extra: { wordBudget?: number; instruction?: string } = {}
): Promise<DraftSection> {
  const plan = outline.sections.find(s => s.id === section.id)!;
  const count = partCount(extra.wordBudget ?? plan.wordBudget);
  let merged: DraftSection = { id: section.id, axisName: plan.axisName, blocks: [], coveredNodeIds: [], wordCount: 0 };

  for (let index = 1; index <= count; index++) {
    onPart(index, count);
    const part: SectionPart | undefined = count > 1
      ? {
        index,
        count,
        previousPartEnding: lastParagraphs(merged, STITCH_PARAGRAPHS).join('\n\n'),
        subheadingsSoFar: merged.blocks.filter(b => b.type === 'subheading').map(b => b.text),
      }
      : undefined;
    const response = await callAPI<SectionResponse>('/api/article/section', {
      outline,
      sectionId: section.id,
      sectionNodes: section.nodes,
      previousSectionEnding: previousEnding,
      nextSectionPlan: nextPlan,
      allowedVerseRefs,
      ...context,
      ...extra,
      ...(part ? { part } : {}),
    }, signal);
    const rejectedRefs = [...(merged.rejectedRefs ?? []), ...(response.rejectedRefs ?? [])];
    merged = {
      ...merged,
      blocks: [...merged.blocks, ...response.blocks],
      coveredNodeIds: [...new Set([...merged.coveredNodeIds, ...response.coveredNodeIds])],
      wordCount: merged.wordCount + response.wordCount,
      ...(rejectedRefs.length ? { rejectedRefs } : {}),
    };
  }
  return merged;
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
  {
    signal,
    existing,
    locked = new Set(),
    contextFor = noContext,
    outlineContext = {},
  }: {
    signal?: AbortSignal;
    existing?: GeneratedArticle | null;
    locked?: Set<string>;
    contextFor?: SectionContextFn;
    outlineContext?: Pick<SectionContext, 'referenceContext' | 'previousIdeas'>;
  } = {}
): Promise<GeneratedArticle> {
  const n = input.sections.length;
  // Until the outline gives the budgets, the parts are estimated from the chosen length
  const estimatedParts = partCount(input.sectionLength ?? input.targetLength / Math.max(1, n));
  let total = 1 + n * estimatedParts + Math.max(0, n - 1) + 1;
  let step = 0;
  const report = (label: string) => onProgress({ label, step: ++step, total });

  // 1. Outline
  report('جاري إنشاء المخطط...');
  const outline = await callAPI<ArticleOutline>('/api/article/outline', {
    tree: input,
    previousArticleEnding: input.previousArticleEnding,
    targetLength: input.targetLength,
    numAxes: n,
    styleMode: options.styleMode,
    ...outlineContext,
  }, signal);
  const toWrite = input.sections.filter(s => !locked.has(s.id) || !existing?.sections.some(e => e.id === s.id));
  total = 1 + toWrite.reduce((k, s) => k + partCount(outline.sections.find(p => p.id === s.id)?.wordBudget ?? 0), 0)
    + Math.max(0, n - 1) + 1;

  // 2. Sections, one after another, each in one or more parts
  const sections: DraftSection[] = [];
  for (let i = 0; i < n; i++) {
    const s = input.sections[i];
    const kept = locked.has(s.id) ? existing?.sections.find(e => e.id === s.id) : undefined;
    if (kept) {
      sections.push(kept);
      continue;
    }
    const previousEnding = i === 0 ? outline.opening : lastParagraphs(sections[i - 1], 1).join('\n');
    const nextPlan = i + 1 < n ? outline.sections[i + 1].thesis : outline.closing;
    sections.push(await writeSection(outline, s, input.allowedVerseRefs, previousEnding, nextPlan, signal, contextFor(s), (p, count) =>
      report(`جاري كتابة المحور ${ordinal(i)} من ${toArabicDigits(n)}${count > 1 ? ` (الجزء ${toArabicDigits(p)} من ${toArabicDigits(count)})` : ''}...`)
    ));
  }

  // 3. Transitions between neighbours
  for (let i = 0; i < n - 1; i++) {
    report(`جاري تنعيم الانتقالات (${ordinal(i)} من ${toArabicDigits(n - 1)})...`);
    await stitchBoundary(sections, i, outline, locked, signal);
  }

  // 4. Canonical verse text
  report('جاري إدراج الآيات...');
  const resolved = await resolveVerses(sections);

  // 5. Final cleanup of the assembled article (prose only; verse boxes untouched)
  return cleanArticle({
    title: outline.title,
    opening: outline.opening,
    closing: outline.closing,
    outline,
    sections: resolved,
    options,
    generatedAt: new Date().toISOString(),
    approvedAt: null,
  });
}

// Rewrites one section (optionally longer/shorter or with an editor's
// instruction) and re-stitches it with its neighbours.
export async function regenerateOneSection(
  article: GeneratedArticle,
  section: ArticleSectionInput,
  allowedVerseRefs: string[],
  extra: { wordBudget?: number; instruction?: string },
  onProgress: ProgressFn,
  { signal, locked = new Set(), context = {} }: { signal?: AbortSignal; locked?: Set<string>; context?: SectionContext } = {}
): Promise<GeneratedArticle> {
  const i = article.sections.findIndex(s => s.id === section.id);
  if (i < 0) throw new Error('هذا المحور غير موجود في المسودة');
  const outline = extra.wordBudget
    ? { ...article.outline, sections: article.outline.sections.map(s => (s.id === section.id ? { ...s, wordBudget: extra.wordBudget! } : s)) }
    : article.outline;
  const sections = [...article.sections];
  const parts = partCount(outline.sections.find(s => s.id === section.id)?.wordBudget ?? 0);
  const total = parts + (i > 0 ? 1 : 0) + (i < sections.length - 1 ? 1 : 0) + 1;
  let step = 0;
  const report = (label: string) => onProgress({ label, step: ++step, total });

  const previousEnding = i === 0 ? article.opening : lastParagraphs(sections[i - 1], 1).join('\n');
  const nextPlan = i + 1 < sections.length ? outline.sections[i + 1]?.thesis ?? '' : article.closing;
  sections[i] = await writeSection(outline, section, allowedVerseRefs, previousEnding, nextPlan, signal, context, (p, count) =>
    report(`جاري إعادة كتابة المحور ${ordinal(i)}${count > 1 ? ` (الجزء ${toArabicDigits(p)} من ${toArabicDigits(count)})` : ''}...`),
    extra
  );

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
  return cleanArticle({ ...article, outline, sections: resolved, approvedAt: null });
}

// ---- Context sent with the calls -------------------------------------------------

export interface GenerationSources {
  tree: IdeaNode;
  corpus: BlogCorpus | null;
  referenceArticles: ReferenceArticle[];
}

export interface GenerationContext {
  referenceTitle: string | null; // the reference article used, if any
  outlineContext: Pick<SectionContext, 'referenceContext' | 'previousIdeas'>;
  contextFor: SectionContextFn;
}

const MAX_PREVIOUS_IDEAS = 40;
const PREVIOUS_SUMMARY_WORDS = 30;

// A reference idea as "already treated": its title and one short sentence
// (the notes hold the summary, then «من المقال: …» with the excerpt)
function toPreviousIdea(node: IdeaNode): PreviousIdea {
  const summary = (node.notes ?? '').split(/\n\nمن المقال:/)[0].split(/(?<=[.؟!])\s/)[0].trim();
  const words = summary.split(/\s+/).filter(Boolean);
  return {
    title: node.arabicLabel,
    summary: words.length > PREVIOUS_SUMMARY_WORDS ? `${words.slice(0, PREVIOUS_SUMMARY_WORDS).join(' ')}…` : summary,
  };
}

const allNodes = (n: IdeaNode): IdeaNode[] => [n, ...(n.children ?? []).flatMap(allNodes)];

// A reference idea / evidence / question (not the «مقال مرجعي» root or its axes)
const isReferenceIdea = (n: IdeaNode) => ideaRole(n) === 'reference' && n.type !== 'project' && n.type !== 'axis';

// Reference ideas for one axis: those under it, and those linked to (or from) its ideas
function previousIdeasFor(tree: IdeaNode, axisId: string): PreviousIdea[] {
  const everything = allNodes(tree);
  const axis = everything.find(n => n.id === axisId);
  if (!axis) return [];
  const inAxis = allNodes(axis);
  const inAxisIds = new Set(inAxis.map(n => n.id));
  const linkedIds = new Set(inAxis.flatMap(n => n.linkedIdeas.map(l => l.targetId)));
  const picked = everything.filter(n => isReferenceIdea(n) && (
    inAxisIds.has(n.id) || linkedIds.has(n.id) || n.linkedIdeas.some(l => inAxisIds.has(l.targetId))
  ));
  return picked.slice(0, MAX_PREVIOUS_IDEAS).map(toPreviousIdea);
}

// The style reference (the latest reference article of the story) goes with the
// outline and every section; each section also gets the story passages most
// relevant to its ideas and the reference ideas it may refer back to.
export function buildGenerationContext(options: ArticleOptions, sources: GenerationSources): GenerationContext {
  const reference = latestReferenceArticle(sources.referenceArticles, options.storyName);
  const referenceContext = referenceContextOf(reference);
  const story = storySources(options.storyName, sources.corpus, sources.referenceArticles);
  const allPrevious = allNodes(sources.tree)
    .filter(n => isReferenceIdea(n))
    .slice(0, MAX_PREVIOUS_IDEAS)
    .map(toPreviousIdea);
  const cache = new Map<string, SectionContext>();
  return {
    referenceTitle: reference?.title ?? null,
    outlineContext: { referenceContext, previousIdeas: allPrevious },
    contextFor: (section) => {
      if (!cache.has(section.id)) {
        cache.set(section.id, {
          referenceContext,
          corpusExcerpts: corpusSearch(section.nodes, story),
          previousIdeas: previousIdeasFor(sources.tree, section.id),
        });
      }
      return cache.get(section.id)!;
    },
  };
}

export function articleWordCount(article: GeneratedArticle): number {
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
  return words(article.opening) + words(article.closing) + article.sections.reduce((n, s) => n + s.wordCount, 0);
}
