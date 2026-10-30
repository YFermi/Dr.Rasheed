// POST /api/article/section — writes one محور as structured blocks. Verse blocks
// carry only a reference; the client inserts the canonical (Tanzil) text.

import type {
  ArticleNodeInput,
  ArticleOutline,
  DraftBlock,
  SectionRequest,
  SectionResponse,
  StyleExample,
} from '../../src/types/article';
import {
  type ApiRequest,
  type ApiResponse,
  HttpError,
  handleJson,
  generateJson,
  loadStylePack,
  formatExamples,
  isAllowedRef,
  canonicalRef,
  asString,
  asStringArray,
  wordCount,
  ORDINALS,
} from '../_lib/claude.js';

const TIMEOUT_MS = 55_000; // under Vercel's 60 s limit
const MAX_EXAMPLES = 5;
const BLOCK_TYPES = new Set(['heading', 'subheading', 'paragraph', 'verse']);

const SECTION_SCHEMA = {
  type: 'object',
  properties: {
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['heading', 'subheading', 'paragraph', 'verse'] },
          text: { type: 'string' },
          ref: { type: 'string' },
        },
        required: ['type', 'text'],
        additionalProperties: false,
      },
    },
    coveredNodeIds: { type: 'array', items: { type: 'string' } },
    wordCount: { type: 'integer' },
  },
  required: ['blocks', 'coveredNodeIds', 'wordCount'],
  additionalProperties: false,
};

// The moves this section needs most; «افتراء» examples only when it has new ideas.
export function pickExamples(examples: StyleExample[], nodes: ArticleNodeInput[]): StyleExample[] {
  const wanted = ['verse', 'question', 'refutation', ...(nodes.some(n => n.isNew) ? ['iftiraa'] : ['opinion']), 'result', 'transition'];
  const picked: StyleExample[] = [];
  for (const category of wanted) {
    const example = examples.find(e => e.category === category && !picked.includes(e));
    if (example) picked.push(example);
    if (picked.length >= MAX_EXAMPLES) break;
  }
  return picked;
}

export function buildSectionPrompt(
  req: SectionRequest,
  styleGuide: string,
  examples: StyleExample[]
): { system: string; prompt: string; heading: string; wordBudget: number } {
  const outline = req.outline;
  const index = outline.sections.findIndex(s => s.id === req.sectionId);
  const plan = outline.sections[index];
  const heading = `المحور ${ORDINALS[index] ?? index + 1}: ${plan.axisName}`;
  const wordBudget = req.wordBudget ?? plan.wordBudget;

  const system = `أنت تكتب بأسلوب د. رشيد الجراح محوراً واحداً من جزء جديد في سلسلته. التزم بدليل الأسلوب التالي التزاماً تاماً.

${styleGuide}

## أمثلة حقيقية من كتابته (الآيات فيها مختصرة إلى ﴿…﴾؛ لا تنسخ عباراتها حرفياً بل حاكِ أسلوبها)
${formatExamples(examples)}

## قواعد الإخراج
- أرجع JSON فقط بالحقول blocks و coveredNodeIds و wordCount.
- أنواع العناصر: heading (عنوان المحور، مرة واحدة في البداية)، subheading (عناوين فرعية مثل «أولاً: …»)، paragraph (فقرة نثرية)، verse (آية).
- عنصر الآية: {"type":"verse","text":"","ref":"سورة:آية"} — اترك text فارغاً دائماً، واختر ref من القائمة المسموح بها فقط.
- لا تكتب أي نص قرآني داخل الفقرات ولا الأقواس ﴿ ﴾؛ يجوز اقتباس كلمتين إلى أربع من آية أوردتها في عنصر آية، بين «».
- «افتراء من عند أنفسنا» مرة واحدة على الأكثر، ولفكرة isNew فقط.
- لا تكتب خاتمة المقال ولا «وللحديث بقية»؛ هذا محور في وسط المقال.`;

  const outlineSummary = outline.sections
    .map((s, i) => `${i === index ? '◀' : ' '} المحور ${ORDINALS[i] ?? i + 1} [${s.id}]: ${s.axisName} — ${s.thesis}`)
    .join('\n');

  const prompt = `# المخطط العام
العنوان: ${outline.title}
الافتتاح: ${outline.opening}
${outlineSummary}

# المحور المطلوب كتابته الآن
العنوان: ${heading}
الأطروحة: ${plan.thesis}
الخطوات بالترتيب:
${plan.keyMoves.map(m => `- ${m}`).join('\n') || '- (اختر خطوات مناسبة وفق نمط تطوير الفكرة)'}
الدخول: ${plan.transitionIn || '—'}
الخروج: ${plan.transitionOut || '—'}
الطول المستهدف: نحو ${wordBudget} كلمة (±15%)

# الأفكار التي يجب أن يتناولها هذا المحور (من شجرة الأفكار)
${JSON.stringify(req.sectionNodes.map(n => ({ id: n.id, type: n.type, label: n.label, notes: n.notes, isNew: n.isNew, verseRefs: n.verseRefs, links: n.links, fromBlogParts: n.blogParts })), null, 1)}

# المراجع القرآنية المسموح بها (لا تستشهد بغيرها)
${req.allowedVerseRefs.join('، ') || '— (لا آيات؛ لا تستعمل عناصر verse)'}

# نهاية ما قبل هذا المحور (ليتصل الكلام)
"""
${req.previousSectionEnding || '—'}
"""

# ما يلي هذا المحور (مهّد له في آخر فقرة)
${req.nextSectionPlan || '—'}
${req.instruction ? `\n# تعليمات المحرر لهذا المحور (لها الأولوية)\n${req.instruction}\n` : ''}
# المطلوب
اكتب «${heading}» وحده: ابدأ بعنصر heading بهذا العنوان، ثم الفقرات والآيات والعناوين الفرعية. ضع في coveredNodeIds معرفات الأفكار التي تناولتها فعلاً.`;

  return { system, prompt, heading, wordBudget };
}

const VERSE_SPAN_RE = /[﴾﴿]([^﴾﴿]*)[﴾﴿]\s*(?:[[(]([^\])]+)[\])])?/g;

// Enforces the rules the prompt asks for: allowed verse refs only, no verse text
// written by the model (inline ﴿…﴾ spans become verse blocks or are removed),
// a heading first, and a word count computed from the text itself.
export function normalizeSection(raw: Partial<SectionResponse>, req: SectionRequest, heading: string): SectionResponse {
  const rejectedRefs: string[] = [];
  const blocks: DraftBlock[] = [];

  for (const b of Array.isArray(raw.blocks) ? raw.blocks : []) {
    const type = asString(b?.type);
    if (!BLOCK_TYPES.has(type)) continue;

    if (type === 'verse') {
      const ref = asString(b.ref).trim();
      if (ref && isAllowedRef(ref, req.allowedVerseRefs)) blocks.push({ type: 'verse', text: '', ref: canonicalRef(ref) });
      else rejectedRefs.push(ref || '(بلا مرجع)');
      continue;
    }

    const text = asString(b.text).trim();
    if (!text) continue;
    if (type !== 'paragraph' || !/[﴾﴿]/.test(text)) {
      blocks.push({ type: type as DraftBlock['type'], text });
      continue;
    }

    // The model quoted a verse inline despite the rules
    let cursor = 0;
    for (const m of text.matchAll(VERSE_SPAN_RE)) {
      const before = text.slice(cursor, m.index).trim();
      if (before) blocks.push({ type: 'paragraph', text: before });
      const ref = m[2]?.trim();
      if (ref && isAllowedRef(ref, req.allowedVerseRefs)) blocks.push({ type: 'verse', text: '', ref: canonicalRef(ref) });
      else rejectedRefs.push(ref ? ref : 'نص آية بلا مرجع');
      cursor = m.index! + m[0].length;
    }
    const after = text.slice(cursor).trim();
    if (after) blocks.push({ type: 'paragraph', text: after });
  }

  if (blocks[0]?.type !== 'heading') blocks.unshift({ type: 'heading', text: heading });

  const nodeIds = new Set(req.sectionNodes.map(n => n.id));
  return {
    blocks,
    coveredNodeIds: asStringArray(raw.coveredNodeIds).filter(id => nodeIds.has(id)),
    wordCount: blocks.filter(b => b.type === 'paragraph').reduce((n, b) => n + wordCount(b.text), 0),
    ...(rejectedRefs.length > 0 ? { rejectedRefs } : {}),
  };
}

function validateInput(body: Record<string, unknown>): SectionRequest {
  const outline = body.outline as ArticleOutline | undefined;
  const sectionId = asString(body.sectionId);
  if (!outline || !Array.isArray(outline.sections)) throw new HttpError(400, 'يلزم إرسال المخطط (outline)');
  if (!outline.sections.some(s => s.id === sectionId)) throw new HttpError(400, `المحور ${sectionId} غير موجود في المخطط`);
  const wordBudget = Number(body.wordBudget);
  return {
    outline,
    sectionId,
    sectionNodes: Array.isArray(body.sectionNodes) ? (body.sectionNodes as ArticleNodeInput[]) : [],
    previousSectionEnding: asString(body.previousSectionEnding),
    nextSectionPlan: asString(body.nextSectionPlan),
    allowedVerseRefs: asStringArray(body.allowedVerseRefs),
    ...(Number.isFinite(wordBudget) && wordBudget > 0 ? { wordBudget } : {}),
    ...(asString(body.instruction).trim() ? { instruction: asString(body.instruction).trim() } : {}),
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  return handleJson(req, res, async (body, apiKey) => {
    const request = validateInput(body);
    const pack = await loadStylePack();
    const { system, prompt, heading } = buildSectionPrompt(request, pack.styleGuide, pickExamples(pack.examples, request.sectionNodes));
    const raw = await generateJson<Partial<SectionResponse>>({
      apiKey,
      system,
      prompt,
      schema: SECTION_SCHEMA,
      timeoutMs: TIMEOUT_MS,
      // Speed: the outline already did the planning, and the 55 s limit leaves
      // no room for long thinking before ~1,500 words of prose.
      effort: 'low',
      // Style guide + examples repeat across the article's section calls
      cacheSystem: true,
    });
    return normalizeSection(raw, request, heading);
  });
}
