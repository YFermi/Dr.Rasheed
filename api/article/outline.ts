// POST /api/article/outline — plans the article: title, opening recap, one
// section per tree axis (thesis, moves, verses, transitions, word budget), closing.

import type { ArticleInput, ArticleOutline, OutlineSection } from '../../src/types/article';
import {
  type ApiRequest,
  type ApiResponse,
  HttpError,
  handleJson,
  generateJson,
  loadStylePack,
  isAllowedRef,
  canonicalRef,
  asString,
  asStringArray,
  ORDINALS,
} from '../_lib/gemini.js';

const TIMEOUT_MS = 50_000; // under Vercel's 60 s limit
const MIN_SECTION_WORDS = 300;
const CLOSING_LINE = 'وللحديث بقية';

const OUTLINE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    opening: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          axisName: { type: 'string' },
          thesis: { type: 'string' },
          keyMoves: { type: 'array', items: { type: 'string' } },
          verseRefs: { type: 'array', items: { type: 'string' } },
          transitionIn: { type: 'string' },
          transitionOut: { type: 'string' },
          wordBudget: { type: 'integer' },
          coveredNodeIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'axisName', 'thesis', 'keyMoves', 'verseRefs', 'transitionIn', 'transitionOut', 'wordBudget', 'coveredNodeIds'],
        additionalProperties: false,
      },
    },
    closing: { type: 'string' },
  },
  additionalProperties: false,
  required: ['title', 'opening', 'sections', 'closing'],
};

export function buildOutlinePrompt(input: ArticleInput, styleGuide: string): { system: string; prompt: string } {
  const system = `أنت محرر يخطط لجزء جديد من سلسلة مقالات د. رشيد الجراح بأسلوبه.
مهمتك الآن التخطيط فقط، لا كتابة المقال.

${styleGuide}`;

  const sections = input.sections.map((s, i) => ({
    id: s.id,
    order: `المحور ${ORDINALS[i] ?? i + 1}`,
    axisName: s.axisName,
    ideas: s.nodes.map(n => ({
      id: n.id,
      type: n.type,
      label: n.label,
      notes: n.notes.slice(0, 600),
      isNew: n.isNew,
      verseRefs: n.verseRefs,
      links: n.links,
      fromBlogParts: n.blogParts,
    })),
    verseRefs: s.verseRefs,
  }));

  const prompt = `# المشروع
${input.projectTitle}

# آخر جزء منشور
العنوان: ${input.previousArticleTitle || '—'}
خاتمته:
"""
${input.previousArticleEnding || '—'}
"""

# المحاور المطلوبة (بالترتيب، محور لكل عنصر — لا تحذف ولا تضف ولا تغيّر المعرفات)
${JSON.stringify(sections, null, 1)}

# المراجع القرآنية المسموح بها
${input.allowedVerseRefs.join('، ') || '—'}

# المطلوب
خطط لمقال طوله نحو ${input.targetLength} كلمة في ${input.sections.length} محاور، وأرجع JSON فقط:
- title: عنوان الجزء الجديد بأسلوب السلسلة.
- opening: فقرة افتتاحية (٦٠–١٢٠ كلمة) تلخص الجزء السابق وتبدأ بعبارة مثل «وصلنا في الجزء السابق إلى…».
- sections: عنصر لكل محور أعلاه، بالترتيب نفسه وبالمعرف (id) نفسه:
  - axisName: عنوان دالّ للمحور (دون كلمة «المحور»).
  - thesis: الأطروحة المركزية في جملة أو جملتين.
  - keyMoves: ٣–٦ خطوات حجاجية بالترتيب (سؤال، شاهد، نقد الموروث، افتراء، نتيجة…).
  - verseRefs: الآيات التي سيستشهد بها المحور، من القائمة المسموح بها فقط، بالصيغة «سورة:آية».
  - transitionIn / transitionOut: كيف يدخل المحور وكيف يسلّم لما بعده.
  - wordBudget: عدد كلمات المحور؛ مجموعها نحو ${input.targetLength}، وأفكار أكثر = كلمات أكثر.
  - coveredNodeIds: معرفات الأفكار التي يتناولها المحور (من أفكاره هو).
- closing: فقرة ختامية تمهد للجزء القادم وتنتهي بالسطر «${CLOSING_LINE}».`;

  return { system, prompt };
}

// The model's outline, forced back onto the input: one section per axis, in
// order, with allowed verses only and budgets that add up to the target.
export function normalizeOutline(raw: Partial<ArticleOutline>, input: ArticleInput): ArticleOutline {
  const rawSections = Array.isArray(raw.sections) ? raw.sections : [];
  const sections: OutlineSection[] = input.sections.map((s, i) => {
    const m: Partial<OutlineSection> = rawSections.find(r => r?.id === s.id) ?? rawSections[i] ?? {};
    const nodeIds = new Set(s.nodes.map(n => n.id));
    const covered = asStringArray(m.coveredNodeIds).filter(id => nodeIds.has(id));
    return {
      id: s.id,
      axisName: asString(m.axisName).trim() || s.axisName,
      thesis: asString(m.thesis),
      keyMoves: asStringArray(m.keyMoves),
      verseRefs: asStringArray(m.verseRefs).filter(r => isAllowedRef(r, input.allowedVerseRefs)).map(canonicalRef),
      transitionIn: asString(m.transitionIn),
      transitionOut: asString(m.transitionOut),
      wordBudget: Number.isFinite(m.wordBudget) ? Math.max(MIN_SECTION_WORDS, Number(m.wordBudget)) : 0,
      coveredNodeIds: covered.length > 0 ? covered : [...nodeIds],
    };
  });

  // Budgets: fill gaps by idea count, then scale to the target length.
  const ideaCount = (i: number) => Math.max(1, input.sections[i].nodes.length);
  const totalIdeas = input.sections.reduce((n, _, i) => n + ideaCount(i), 0);
  sections.forEach((s, i) => {
    if (!s.wordBudget) s.wordBudget = Math.round((input.targetLength * ideaCount(i)) / totalIdeas);
  });
  const sum = sections.reduce((n, s) => n + s.wordBudget, 0);
  sections.forEach(s => {
    s.wordBudget = Math.max(MIN_SECTION_WORDS, Math.round((s.wordBudget * input.targetLength) / sum / 10) * 10);
  });

  let closing = asString(raw.closing).trim();
  if (!closing.endsWith(CLOSING_LINE)) closing = `${closing}\n\n${CLOSING_LINE}`.trim();

  return {
    title: asString(raw.title).trim() || input.projectTitle,
    opening: asString(raw.opening).trim(),
    sections,
    closing,
  };
}

function validateInput(body: Record<string, unknown>): ArticleInput {
  const tree = body.tree as ArticleInput | undefined;
  if (!tree || !Array.isArray(tree.sections) || tree.sections.length === 0) {
    throw new HttpError(400, 'يلزم إرسال شجرة الأفكار (tree.sections)');
  }
  return {
    ...tree,
    previousArticleEnding: asString(body.previousArticleEnding, tree.previousArticleEnding ?? ''),
    targetLength: Number(body.targetLength) || tree.targetLength || 4000,
    allowedVerseRefs: asStringArray(tree.allowedVerseRefs),
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  return handleJson(req, res, async (body, apiKey) => {
    const input = validateInput(body);
    const { styleGuide } = await loadStylePack();
    const { system, prompt } = buildOutlinePrompt(input, styleGuide);
    const raw = await generateJson<Partial<ArticleOutline>>({
      apiKey,
      system,
      prompt,
      schema: OUTLINE_SCHEMA,
      timeoutMs: TIMEOUT_MS,
      effort: 'medium', // planning benefits from some thinking
    });
    return normalizeOutline(raw, input);
  });
}
