// POST /api/article/outline — plans the article: title, opening recap, one
// section per tree axis (thesis, moves, verses, transitions, word budget), closing.

import type { ArticleInput, ArticleOutline, OutlineSection, PreviousIdea } from '../../src/types/article';
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
  NO_REFERENCE,
  referenceSection,
  METHOD_RULES,
  stripReaderAddress,
} from '../_lib/gemini.js';

// Besides the tree: the reference article and the ideas already treated
export interface OutlineExtras {
  referenceContext?: string;
  previousIdeas?: PreviousIdea[];
}

const MAX_REFERENCE_CHARS = 30_000;
const MAX_PREVIOUS_IDEAS = 40;

const TIMEOUT_MS = 120_000; // within vercel.json's maxDuration (300 s) for api/article/*
const MIN_SECTION_WORDS = 300;
const MAX_SECTION_WORDS = 3000;
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

export function buildOutlinePrompt(input: ArticleInput, styleGuide: string, extras: OutlineExtras = {}): { system: string; prompt: string } {
  const hasReference = !!extras.referenceContext?.trim() && extras.referenceContext.trim() !== NO_REFERENCE;
  const system = `أنت محرر يخطط لجزء جديد من سلسلة مقالات د. رشيد الجراح بأسلوبه.
مهمتك الآن التخطيط فقط، لا كتابة المقال.

${styleGuide}

${METHOD_RULES}

${referenceSection(extras.referenceContext)}${hasReference ? '\n\nصمّم المخطط ليكون استمراراً طبيعياً للمقال السابق.' : ''}`;

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

${extras.previousIdeas?.length ? `# ما سبق تناوله في الأجزاء السابقة (للإحالة فقط)
لا تخطط لإعادة شرح هذه الأفكار؛ يكفي أن يحيل إليها المحور بجملة («كما بيّنا في الجزء السابق…»).
${extras.previousIdeas.map(i => `- ${i.title}: ${i.summary || '—'}`).join('\n')}

` : ''}# المراجع القرآنية المسموح بها
${input.allowedVerseRefs.join('، ') || '—'}

# المطلوب
خطط لمقال طوله نحو ${input.targetLength} كلمة في ${input.sections.length} محاور${input.sectionLength ? ` (نحو ${input.sectionLength} كلمة لكل محور)` : ''}، وأرجع JSON فقط:
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

  // A set length per axis is the budget of every axis (the user's choice)
  if (input.sectionLength) {
    sections.forEach(s => { s.wordBudget = input.sectionLength!; });
    return finishOutline(raw, input, sections);
  }

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
  return finishOutline(raw, input, sections);
}

function finishOutline(raw: Partial<ArticleOutline>, input: ArticleInput, sections: OutlineSection[]): ArticleOutline {
  let closing = stripReaderAddress(asString(raw.closing));
  if (!closing.endsWith(CLOSING_LINE)) closing = `${closing}\n\n${CLOSING_LINE}`.trim();

  return {
    title: asString(raw.title).trim() || input.projectTitle,
    opening: stripReaderAddress(asString(raw.opening)),
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
    ...(Number(tree.sectionLength) > 0 ? { sectionLength: Math.min(Number(tree.sectionLength), MAX_SECTION_WORDS) } : {}),
    allowedVerseRefs: asStringArray(tree.allowedVerseRefs),
  };
}

function outlineExtras(body: Record<string, unknown>): OutlineExtras {
  const referenceContext = asString(body.referenceContext).slice(0, MAX_REFERENCE_CHARS);
  const previousIdeas = (Array.isArray(body.previousIdeas) ? body.previousIdeas : [])
    .slice(0, MAX_PREVIOUS_IDEAS)
    .map(i => ({ title: asString(i?.title).trim().slice(0, 200), summary: asString(i?.summary).trim().slice(0, 400) }))
    .filter(i => i.title);
  return {
    ...(referenceContext.trim() ? { referenceContext } : {}),
    ...(previousIdeas.length ? { previousIdeas } : {}),
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  return handleJson(req, res, async (body, apiKey, model) => {
    const input = validateInput(body);
    const { styleGuide } = await loadStylePack();
    const { system, prompt } = buildOutlinePrompt(input, styleGuide, outlineExtras(body));
    const raw = await generateJson<Partial<ArticleOutline>>({
      apiKey,
      model,
      system,
      prompt,
      schema: OUTLINE_SCHEMA,
      timeoutMs: TIMEOUT_MS,
      effort: 'low', // speed: a light plan is enough
    });
    return normalizeOutline(raw, input);
  });
}
