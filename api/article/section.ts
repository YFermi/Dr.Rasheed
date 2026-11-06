// POST /api/article/section — writes one محور as structured blocks. Verse blocks
// carry only a reference; the client inserts the canonical (Tanzil) text.

import type {
  ArticleNodeInput,
  ArticleOutline,
  CorpusExcerpt,
  DraftBlock,
  PreviousIdea,
  SectionPart,
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
  referenceSection,
  DR_RASHEED_METHODOLOGY_CHARTER,
  taskHeader,
  CHARTER_VERSE_NOTE,
  FORBIDDEN_PHRASES,
  stripReaderAddress,
} from '../_lib/gemini.js';

// Dr. Rasheed's axes run 1,000–3,000 words. The client writes a long section in
// parts of ≤ 1,500 words (models fall well short of long targets in one call);
// 32,768 output tokens leave room for thinking and the JSON around the prose.
const MAX_OUTPUT_TOKENS = 32_768;
export const MAX_SECTION_WORDS = 4000; // 3,000 + «أطول» (×1.3)
const MAX_PART_WORDS = 2000;
// Guards against oversized requests (the client sends ≤ 3,000 words of reference)
const MAX_REFERENCE_CHARS = 30_000;
const MAX_CORPUS_EXCERPTS = 20;
const MAX_CORPUS_CHARS = 80_000; // ~8,000 Arabic words (src/utils/corpusSearch.ts)
const MAX_PREVIOUS_IDEAS = 40;
// Within vercel.json's maxDuration (300 s) for api/article/*
const TIMEOUT_MS = 250_000;
const MAX_EXAMPLES = 3;
const EXAMPLE_MAX_WORDS = 40;
const BLOCK_TYPES = new Set(['heading', 'subheading', 'paragraph', 'verse']);

// The essentials of data/style-guide.md, for the per-section calls (the outline
// and stitch calls still get the full guide).
const CORE_STYLE_RULES = `## قواعد الأسلوب الأساسية
- ضمير المتكلم الجمع مع التحوّط: «نظن»، «لا أظن»، «في رأينا»، «إننا»؛ لا جزم مطلق.
- نبرة حوارية بلا منادى: أسئلة كثيرة («لماذا…؟»، «السؤال: …») تُطرح مباشرة دون مخاطبة القارئ.
- تطوير الفكرة: سؤال ← شاهد قرآني ← تفكيك اللفظ وسياقه ومقابلته بمواضعه الأخرى في كتاب الله ← فهم جديد ← «النتيجة: …».
- «افتراء من عند أنفسنا: …» لفكرة isNew فقط ومرة واحدة على الأكثر؛ والفكرة المنشورة سابقاً: «كما بيّنا في الجزء …».
- فقرات قصيرة متصلة؛ لا تعداد نقطي، ولا عناوين إنجليزية، ولا «في الختام» أو «خلاصة القول».`;

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

// A short excerpt: whole sentences up to EXAMPLE_MAX_WORDS words.
function shortExample(e: StyleExample): StyleExample {
  const sentences = e.text.replace(/\s+/g, ' ').split(/(?<=[.؟!:])\s+/);
  let text = sentences[0];
  for (const s of sentences.slice(1)) {
    if (wordCount(`${text} ${s}`) > EXAMPLE_MAX_WORDS) break;
    text = `${text} ${s}`;
  }
  const words = text.split(/\s+/);
  return { ...e, text: words.length > EXAMPLE_MAX_WORDS ? `${words.slice(0, EXAMPLE_MAX_WORDS).join(' ')}…` : text };
}

// Three short examples of the core moves; «افتراء» only when the section has new ideas.
export function pickExamples(examples: StyleExample[], nodes: ArticleNodeInput[]): StyleExample[] {
  const wanted = ['question', nodes.some(n => n.isNew) ? 'iftiraa' : 'opinion', 'result', 'verse'];
  const picked: StyleExample[] = [];
  for (const category of wanted) {
    const example = examples.find(e => e.category === category && !picked.includes(e) && !FORBIDDEN_PHRASES.test(e.text));
    if (example) picked.push(example);
    if (picked.length >= MAX_EXAMPLES) break;
  }
  return picked.map(shortExample);
}

// Reference ideas: treated in earlier parts, to be referred to, never re-explained
export function previousIdeasSection(ideas: PreviousIdea[] | undefined): string {
  if (!ideas?.length) return '';
  return `
## ما سبق تناوله في الأجزاء السابقة (للإحالة فقط)

الأفكار التالية تم بحثها بالتفصيل في مقالات سابقة. لا تُعِد شرحها أو تفصيلها. إذا احتجت الإشارة إليها، استخدم عبارات مثل:
- "كما بيّنا في الجزء السابق..."
- "وقد أوضحنا سابقاً أن..."
- "وكما تقدّم معنا..."

قيد صارم: لا تكتب أكثر من جملة إحالة واحدة لكل فكرة سابقة. القارئ يقرأ السلسلة بالترتيب.

${ideas.map(i => `${i.title}: ${i.summary || '—'}`).join('\n')}
`;
}

// Passages of the story's earlier articles picked for this axis (corpusSearch)
function corpusSection(excerpts: CorpusExcerpt[] | undefined): string {
  if (!excerpts?.length) return '';
  return `
## من مقالات القصة السابقة (للاستشهاد والربط)

المقاطع التالية من مقالات سابقة في نفس القصة. استخدمها للاستشهاد والربط إن كانت ذات صلة، ولا تنقلها حرفياً:
(الاستشهاد بالآيات يبقى مقيداً بالمراجع المسموح بها أدناه.)

${excerpts.map(e => `[من ${e.source} - "${e.title}"${e.reason ? ` — ${e.reason}` : ''}:]\n"${e.text}"`).join('\n\n')}
`;
}

export function buildSectionPrompt(
  req: SectionRequest,
  examples: StyleExample[]
): { system: string; prompt: string; heading: string; wordBudget: number } {
  const outline = req.outline;
  const index = outline.sections.findIndex(s => s.id === req.sectionId);
  const plan = outline.sections[index];
  const heading = `المحور ${ORDINALS[index] ?? index + 1}: ${plan.axisName}`;
  const wordBudget = Math.min(req.wordBudget ?? plan.wordBudget, MAX_SECTION_WORDS);
  const part = req.part && req.part.count > 1 ? req.part : undefined;
  const partWords = Math.min(Math.round(wordBudget / (part?.count ?? 1) / 10) * 10, MAX_PART_WORDS);

  const system = `${DR_RASHEED_METHODOLOGY_CHARTER}

${taskHeader('كتابة مقال/جزء من مقال')}

ستتلقى الآن:
1. المقال المرجعي (كأسلوب وبنية يُحتذى بها فقط، وليس كمصدر معلومات).
2. المقاطع المسترجعة من المدونة القرآنية للدكتور رشيد (هذه هي مصدر الأفكار الوحيد).
3. عنوان المقال المطلوب كتابته والمحاور الأساسية.

اكتب الجزء المطلوب بالتزام تام بالدستور المنهجي أعلاه.
الطول المستهدف: 1500 كلمة لكل استدعاء (يُبنى المقال الكامل من استدعاءين متتاليين لإنتاج 3000 كلمة).

ملاحظة تطبيقية: «المحاور الأساسية» في البند 3 تصلك مع أفكار المحور من جلسة العصف (شجرة الأفكار)، وهي جزء من المصادر المقدمة لك: اكتب أفكار المحور هذه وادعمها من المقاطع المسترجعة، ولا تضف فكرة ليست في أفكار المحور ولا في المقاطع. والطول الدقيق لهذا الاستدعاء مذكور في المطلوب أدناه.

${CORE_STYLE_RULES}

${referenceSection(req.referenceContext)}

## أمثلة قصيرة من كتابته (حاكِ الأسلوب ولا تنسخ العبارات)
${formatExamples(examples)}

## قواعد الإخراج
- أرجع JSON فقط بالحقول blocks و coveredNodeIds و wordCount.
- أنواع العناصر: heading (عنوان المحور، مرة واحدة في البداية)، subheading (عناوين فرعية مثل «أولاً: …»)، paragraph (فقرة نثرية)، verse (آية).
- عنصر الآية: {"type":"verse","text":"","ref":"سورة:آية"} — اترك text فارغاً دائماً، واختر ref من القائمة المسموح بها فقط.
- ${CHARTER_VERSE_NOTE}
- لا تكتب أي نص قرآني داخل الفقرات ولا الأقواس ﴿ ﴾ أو { }؛ يجوز اقتباس كلمتين إلى أربع من آية أوردتها في عنصر آية، بين «».
- «افتراء من عند أنفسنا» مرة واحدة على الأكثر، ولفكرة isNew فقط.
- لا تكتب خاتمة المقال ولا «وللحديث بقية»؛ هذا محور في وسط المقال.
- اكتب بالطول المطلوب فعلاً: فقرات وافية تطوّر كل فكرة (سؤال ← شاهد ← تفكيك ← نتيجة)، لا تلخيصاً.`;

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
الطول المستهدف للمحور كله: نحو ${wordBudget} كلمة (الحد 3000 كلمة)

# الأفكار التي يجب أن يتناولها هذا المحور (من شجرة الأفكار)
${JSON.stringify(req.sectionNodes.map(n => ({ id: n.id, type: n.type, label: n.label, notes: n.notes, isNew: n.isNew, verseRefs: n.verseRefs, links: n.links, fromBlogParts: n.blogParts })), null, 1)}
${previousIdeasSection(req.previousIdeas)}${corpusSection(req.corpusExcerpts)}
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
${part ? partInstructions(part, heading, partWords, plan.keyMoves) : `اكتب «${heading}» وحده في نحو ${partWords} كلمة: ابدأ بعنصر heading بهذا العنوان، ثم الفقرات والآيات والعناوين الفرعية.`}
ضع في coveredNodeIds معرفات الأفكار التي تناولتها فعلاً.`;

  return { system, prompt, heading, wordBudget };
}

// What one part of a long section must do; the key moves are shared out in order.
function partInstructions(part: SectionPart, heading: string, partWords: number, keyMoves: string[]): string {
  const per = Math.ceil(keyMoves.length / part.count);
  const moves = keyMoves.slice((part.index - 1) * per, part.index * per);
  const isLast = part.index === part.count;
  const start = part.index === 1
    ? `ابدأ بعنصر heading بعنوان «${heading}».`
    : `أكمل الكلام من حيث انتهى الجزء السابق، بلا عنوان رئيسي ولا تمهيد جديد، ولا تكرر ما قيل.
نهاية الجزء السابق من هذا المحور:
"""
${part.previousPartEnding || '—'}
"""${part.subheadingsSoFar.length ? `\nالعناوين الفرعية المستعملة حتى الآن (لا تكررها): ${part.subheadingsSoFar.join('، ')}` : ''}`;
  return `هذا هو الجزء ${part.index} من ${part.count} من «${heading}»، وطوله نحو ${partWords} كلمة.
${start}
${moves.length ? `الخطوات التي يغطيها هذا الجزء:\n${moves.map(m => `- ${m}`).join('\n')}\n` : ''}${isLast
    ? 'هذا آخر أجزاء المحور: أتمّ النتيجة، ومهّد في آخر فقرة لما يلي المحور.'
    : 'ليس هذا آخر أجزاء المحور: لا تختم المحور ولا تمهّد لما بعده؛ توقف عند نهاية فكرة مكتملة.'}`;
}

// ﴿…﴾ or the charter's {…}, with its reference; «> قال تعالى:» before it belongs to the block
const VERSE_SPAN_RE = />?\s*(?:قال تعالى\s*:?\s*)?[﴾﴿{]([^﴾﴿{}]*)[﴾﴿}]\s*(?:[[(]([^\])]+)[\])])?/g;

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

    const text = stripReaderAddress(asString(b.text));
    if (!text) continue;
    if (type !== 'paragraph' || !/[﴾﴿{]/.test(text)) {
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

  // Later parts of a long section continue it: no heading of their own
  const firstPart = !req.part || req.part.index === 1;
  if (firstPart && blocks[0]?.type !== 'heading') blocks.unshift({ type: 'heading', text: heading });
  if (!firstPart) while (blocks[0]?.type === 'heading') blocks.shift();

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
    ...(isSectionPart(body.part) ? { part: body.part } : {}),
    ...(asString(body.referenceContext).trim() ? { referenceContext: asString(body.referenceContext).slice(0, MAX_REFERENCE_CHARS) } : {}),
    ...corpusExcerptsOf(body.corpusExcerpts),
    ...previousIdeasOf(body.previousIdeas),
  };
}

// Well-formed excerpts only, within MAX_CORPUS_CHARS in all
function corpusExcerptsOf(v: unknown): { corpusExcerpts?: CorpusExcerpt[] } {
  if (!Array.isArray(v)) return {};
  const excerpts: CorpusExcerpt[] = [];
  let chars = 0;
  for (const e of v.slice(0, MAX_CORPUS_EXCERPTS)) {
    const text = asString(e?.text).trim();
    if (!text || chars + text.length > MAX_CORPUS_CHARS) continue;
    excerpts.push({ source: asString(e.source), title: asString(e.title), text, reason: asString(e.reason) });
    chars += text.length;
  }
  return excerpts.length ? { corpusExcerpts: excerpts } : {};
}

function previousIdeasOf(v: unknown): { previousIdeas?: PreviousIdea[] } {
  if (!Array.isArray(v)) return {};
  const ideas = v.slice(0, MAX_PREVIOUS_IDEAS)
    .map(i => ({ title: asString(i?.title).trim().slice(0, 200), summary: asString(i?.summary).trim().slice(0, 400) }))
    .filter(i => i.title);
  return ideas.length ? { previousIdeas: ideas } : {};
}

function isSectionPart(v: unknown): v is SectionPart {
  const p = v as SectionPart | undefined;
  return !!p && Number.isInteger(p.index) && Number.isInteger(p.count) && p.index >= 1 && p.index <= p.count
    && typeof p.previousPartEnding === 'string' && Array.isArray(p.subheadingsSoFar);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  return handleJson(req, res, async (body, apiKey, model) => {
    const request = validateInput(body);
    const pack = await loadStylePack();
    const { system, prompt, heading } = buildSectionPrompt(request, pickExamples(pack.examples, request.sectionNodes));
    const raw = await generateJson<Partial<SectionResponse>>({
      apiKey,
      model,
      system,
      prompt,
      schema: SECTION_SCHEMA,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      timeoutMs: TIMEOUT_MS,
      // Quality first: a little thinking keeps a long part coherent
      effort: 'low',
    });
    return normalizeSection(raw, request, heading);
  });
}
