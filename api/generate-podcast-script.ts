// POST /api/generate-podcast-script — turns one segment of an article (the
// introduction, a part of an axis, or the closing) into studio dialog for the
// programme «نظرية الشبكة العنكبوتية». The client splits the article into
// segments and calls this once per segment, in order. Verse lines carry only a
// reference; the client inserts the canonical (Tanzil) text.

import type {
  PodcastSegmentKind,
  PodcastSegmentRequest,
  PodcastSegmentResponse,
  PodcastSpeaker,
  PodcastHost,
} from '../src/types/podcast';
import {
  type ApiRequest,
  type ApiResponse,
  HttpError,
  handleJson,
  generateJson,
  isAllowedRef,
  canonicalRef,
  asString,
  asStringArray,
  stripReaderAddress,
} from './_lib/gemini.js';

const TIMEOUT_MS = 250_000; // under the function's 300 s (vercel.json)
const MAX_OUTPUT_TOKENS = 16384; // a ~1,400-word segment becomes ~2,000 words of dialog
const MAX_SOURCE_CHARS = 20_000;
const MAX_PREVIOUS_LINES = 6;
const KINDS = new Set<PodcastSegmentKind>(['intro', 'body', 'closing']);

// Same names as PODCAST_SPEAKERS / VERSE_SPEAKER in src/types/podcast.ts (only
// types are imported from src: the functions run as plain ESM on the server)
const PODCAST_SPEAKERS: Record<PodcastSpeaker, string> = {
  yousef: 'د. يوسف',
  rasheed: 'د. رشيد الجراح',
  mustafa: 'مصطفى',
  zakaria: 'زكريا',
};
const VERSE_SPEAKER = 'آية';

const SPEAKER_BY_NAME = new Map<string, PodcastSpeaker>(
  (Object.entries(PODCAST_SPEAKERS) as [PodcastSpeaker, string][]).map(([id, name]) => [name, id])
);

const SCRIPT_SCHEMA = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          speaker: { type: 'string', enum: [...Object.values(PODCAST_SPEAKERS), VERSE_SPEAKER] },
          text: { type: 'string' },
          ref: { type: 'string' },
        },
        required: ['speaker', 'text'],
      },
    },
  },
  required: ['lines'],
};

const HOSTS: PodcastHost[] = ['yousef', 'zakaria', 'mustafa']; // same as PODCAST_HOSTS

// The lead host and the two others, in the order they speak in the example
function cast(leadHost: PodcastHost) {
  const [second, third] = HOSTS.filter(h => h !== leadHost).map(h => PODCAST_SPEAKERS[h]);
  return { lead: PODCAST_SPEAKERS[leadHost], second, third, rasheed: PODCAST_SPEAKERS.rasheed };
}

// The client's example of the programme's tone and turn-taking, with the names of
// this episode's cast
function example(leadHost: PodcastHost): string {
  const { lead, second, third, rasheed } = cast(leadHost);
  return `${lead}: بسم الله الرحمن الرحيم. أهلًا ومرحبًا بكم مستمعينا الأعزاء في حلقة جديدة من سلسلة نظرية الشبكة العنكبوتية مع الدكتور رشيد الجراح. هدفنا في هذه الدقائق التمهيدية هو استرجاع الخيوط الأساسية التي نسجناها في اللقاء السابق... ما رأيك يا ${second}؟
${second}: أهلاً بك، وأهلاً بكل متابعينا. الحقيقة العمق الفكري الذي طرحه الدكتور رشيد تمثل في إعادة رسم اللحظة الفاصلة... وهنا يأتي دورك يا ${third}.
${third}: شكرًا لك. ومن ذلك الإيمان المشهود، انطلقنا في الحلقة الماضية لفض إشكال لطالما حيّر أذهان المتدبرين... تفضل ببدء النقاش مع الدكتور رشيد.
${lead}: أهلاً بكم متابعينا. نرحب بضيفنا الكريم الدكتور رشيد الجراح. نود أن نبدأ حوار الليلة معك حول اسم الرسول لوط نفسه، فما دلالة هذا الاسم وما معناه؟
${rasheed}: تتميز الكلمات القرآنية عمومًا بقابليتها للاشتقاق من جذور ثلاثية... غير أن كلمة "لوط" تشكل استثناءً واضحًا. لذا، نحن نظن أن كل مفردة في كتاب الله هي من اللسان العربي المبين.`;
}

function systemPrompt(programName: string, leadHost: PodcastHost): string {
  const { lead, second, third, rasheed } = cast(leadHost);
  return `أنت كاتب سكريبتات لبرنامج «${programName}»، برنامج حواري مسموع ومرئي يقدّم أبحاث أ.د. رشيد الجراح في تدبّر القرآن الكريم.
مهمتك تحويل نص مقال علمي إلى حوار مكتوب يُقرأ في الاستوديو كما هو، دون أن يضيع شيء من مادته العلمية.

## الشخصيات في هذه الحلقة
- ${lead}: المذيع الرئيسي؛ يفتتح الحلقة بعد إخلاء المسؤولية، ويرحب بالمستمعين ويسترجع خيوط الحلقة السابقة، ويدير الحوار، ويختتم الحلقة ويودع المستمعين. لا يفتتح غيره ولا يختم غيره.
- ${second} و${third}: محاوران؛ يشاركان في التمهيد، ويطرحان أسئلة التفكيك والاستيضاح، وقد يعيدان صياغة ما فهماه بإيجاز تمهيداً للسؤال التالي.
- ${rasheed}: صاحب البحث؛ الإجابات العلمية التفصيلية له وحده.

## قواعد صارمة
1. الأسئلة موزّعة بالتناوب بين ${lead} و${second} و${third}، وكل سؤال قصير (جملة إلى ثلاث جمل). لا يقدّم المحاورون أي معلومة علمية من المقال من عندهم؛ يسألون أو يلخّصون ما قاله الدكتور.
2. كلام ${rasheed} يمتص النص العلمي للمقطع كاملاً: كل فكرة وكل حجة وكل سؤال يطرحه وكل نتيجة وكل آية، بالترتيب نفسه، وبألفاظ المقال قدر الإمكان مع تحويلها إلى لغة منطوقة سلسة. حافظ على مصطلحاته كما وردت، مثل: «نفتري الظن»، «لغو الأعراب»، «اللسان العربي المبين»، «افتراء من عند أنفسنا»، «والله أعلم».
3. لا تختصر: مجموع كلام الدكتور في المقطع قريب من طول نص المقطع أو أطول منه، لا أقصر. قسّم الإجابات الطويلة على عدة مداخلات تتخللها أسئلة قصيرة.
4. الآيات: كل آية في نص المقطع تُورد عنصراً مستقلاً {"speaker":"${VERSE_SPEAKER}","text":"","ref":"سورة:آية"} في موضعها من كلام الدكتور. اترك text فارغاً دائماً، فالنظام يُدرج النص القرآني الموثّق. اختر ref من القائمة المسموح بها فقط. لا تكتب نص أي آية داخل الكلام ولا الأقواس ﴿ ﴾؛ يجوز اقتباس كلمتين إلى أربع من آية أوردتها، بين «».
5. المنهج: التحليل يقتصر على النص القرآني؛ لا نقل عن أهل التراث أو المفسرين، ولا قصصهم، ولا الإسرائيليات، ولا مقارنة مع من كتب في الموضوع، ولو سأل المحاور عن ذلك.
6. المخاطبة: يتنادى المتحاورون بأسمائهم طبيعياً («يا دكتور»، «يا ${second}»). الترحيب بالمستمعين في المقدمة والخاتمة فقط. لا «عزيزي القارئ» ولا «سيدي» ولا «سيادتكم».
7. إخلاء المسؤولية نص ثابت يدرجه النظام قبل الحوار؛ لا تكتبه ولا تشر إليه.
8. نص منطوق فقط: لا عناوين ولا ترقيم ولا إرشادات إخراج (لا [موسيقى] ولا (يبتسم)).

## مثال توضيحي لأسلوب الحوار (النبرة وتوزيع الأدوار؛ لا تنقل مضمونه)
${example(leadHost)}

## الإخراج
أرجع JSON فقط: {"lines":[{"speaker":"…","text":"…","ref":"…"}]}، حيث speaker أحد: ${lead}، ${second}، ${third}، ${rasheed}، ${VERSE_SPEAKER}؛ و ref لعناصر الآيات فقط.`;
}

function segmentInstructions(req: PodcastSegmentRequest): string {
  const { lead, second, third } = cast(req.leadHost);
  const topics = req.topics.length ? req.topics.map(t => `- ${t}`).join('\n') : '—';
  switch (req.kind) {
    case 'intro':
      return `# المطلوب: مقدمة الحلقة
- يفتتح ${lead} (المذيع الرئيسي) مباشرة بعد إخلاء المسؤولية: بسملة وترحيب بالمستمعين في برنامج «${req.programName}»، الحلقة ${req.episodeNumber}، ثم يسترجع خيوط الحلقة السابقة كما في نص المقطع أدناه.
- يشرك معه ${second} ثم ${third} في تمهيد حواري مشوق (٦ إلى ١٠ مداخلات) يثير أسئلة الحلقة دون الإجابة عنها، كما في المثال.
- يُختم المقطع بترحيب ${lead} بالدكتور رشيد وسؤاله الأول له عن موضوع الحلقة. لا يتكلم الدكتور في هذا المقطع.

# موضوعات الحلقة (المقاطع القادمة)
${topics}`;
    case 'closing':
      return `# المطلوب: خاتمة الحلقة
- إن كان في نص المقطع تمهيد للجزء القادم أو دعاء، يقوله د. رشيد باختصار وبألفاظه.
- ثم يختتم ${lead} (المذيع الرئيسي) إغلاقاً مقتضباً لائقاً: شكر الدكتور و${second} و${third}، وتوديع المستمعين، والدعوة إلى متابعة الحلقة القادمة.
- من ٣ إلى ٦ مداخلات فقط.`;
    default:
      return `# المطلوب: المقطع ${req.segmentIndex} من ${req.bodyCount} في متن الحلقة — «${req.segmentTitle}»
- واصل الحوار من حيث انتهى (آخر الأسطر أدناه): إن كان آخر سطر سؤالاً للدكتور فابدأ بجوابه، وإلا فابدأ بسؤال ينقل إلى هذا المقطع.
- حوّل نص المقطع كاملاً إلى حوار وفق القواعد؛ لا تختم الحلقة ولا تودّع${req.segmentIndex < req.bodyCount ? '، فالحوار يستمر بعده' : ''}.`;
  }
}

export function buildPodcastPrompt(req: PodcastSegmentRequest): { system: string; prompt: string } {
  const previous = req.previousLines?.length
    ? `# آخر الحوار قبل هذا المقطع\n${req.previousLines.join('\n')}\n\n`
    : '';
  const instruction = req.instruction ? `\n\n# ملاحظة المستخدم لإعادة الكتابة (التزم بها)\n${req.instruction}` : '';
  const prompt = `# الحلقة
البرنامج: ${req.programName} — الحلقة ${req.episodeNumber}
المذيع الرئيسي: ${cast(req.leadHost).lead}
المقال: ${req.articleTitle}

${segmentInstructions(req)}

${previous}# نص المقطع${req.kind === 'body' ? ` — «${req.segmentTitle}»` : ''}
${req.sourceText}

# المراجع المسموح بها للآيات
${req.allowedVerseRefs.join('، ') || '— (لا آيات في هذا المقال)'}${instruction}`;
  return { system: systemPrompt(req.programName, req.leadHost), prompt };
}

const VERSE_SPAN_RE = /[﴾﴿]([^﴾﴿]*)[﴾﴿]\s*(?:[[(]([^\])]+)[\])])?/g;

// Keeps the four speakers and allowed verse refs; a verse quoted inside a line
// becomes a verse line when its reference is allowed, and is dropped otherwise.
export function normalizePodcast(raw: { lines?: unknown }, req: PodcastSegmentRequest): PodcastSegmentResponse {
  const lines: PodcastSegmentResponse['lines'] = [];
  const rejectedRefs: string[] = [];
  const pushVerse = (ref: string | undefined) => {
    const r = ref?.trim();
    if (r && isAllowedRef(r, req.allowedVerseRefs)) lines.push({ type: 'verse', text: '', ref: canonicalRef(r) });
    else rejectedRefs.push(r || 'نص آية بلا مرجع');
  };

  for (const item of Array.isArray(raw.lines) ? raw.lines : []) {
    if (!item || typeof item !== 'object') continue;
    const name = asString((item as Record<string, unknown>).speaker).trim();
    if (name === VERSE_SPEAKER) {
      pushVerse(asString((item as Record<string, unknown>).ref));
      continue;
    }
    const speaker = SPEAKER_BY_NAME.get(name);
    if (!speaker) continue;
    const text = stripReaderAddress(asString((item as Record<string, unknown>).text));
    if (!text) continue;
    if (!/[﴾﴿]/.test(text)) {
      lines.push({ type: 'speech', speaker, text });
      continue;
    }
    let cursor = 0;
    for (const m of text.matchAll(VERSE_SPAN_RE)) {
      const before = text.slice(cursor, m.index).trim();
      if (before) lines.push({ type: 'speech', speaker, text: before });
      pushVerse(m[2]);
      cursor = m.index! + m[0].length;
    }
    const after = text.slice(cursor).trim();
    if (after) lines.push({ type: 'speech', speaker, text: after });
  }

  if (!lines.some(l => l.type === 'speech')) throw new HttpError(502, 'لم يُرجع النموذج حواراً صالحاً لهذا المقطع');
  return { lines, ...(rejectedRefs.length ? { rejectedRefs } : {}) };
}

function validateInput(body: Record<string, unknown>): PodcastSegmentRequest {
  const kind = asString(body.kind) as PodcastSegmentKind;
  if (!KINDS.has(kind)) throw new HttpError(400, 'نوع المقطع غير معروف (intro | body | closing)');
  const sourceText = asString(body.sourceText).trim();
  if (!sourceText) throw new HttpError(400, 'نص المقطع فارغ');
  if (sourceText.length > MAX_SOURCE_CHARS) throw new HttpError(413, `نص المقطع أطول من ${MAX_SOURCE_CHARS} حرف`);
  const episodeNumber = Number(body.episodeNumber);
  const instruction = asString(body.instruction).trim();
  return {
    kind,
    programName: asString(body.programName).trim() || 'نظرية الشبكة العنكبوتية',
    episodeNumber: Number.isFinite(episodeNumber) && episodeNumber > 0 ? Math.round(episodeNumber) : 1,
    leadHost: HOSTS.includes(body.leadHost as PodcastHost) ? (body.leadHost as PodcastHost) : 'yousef',
    articleTitle: asString(body.articleTitle).trim(),
    segmentTitle: asString(body.segmentTitle).trim(),
    segmentIndex: Number(body.segmentIndex) || 0,
    bodyCount: Number(body.bodyCount) || 0,
    topics: asStringArray(body.topics).slice(0, 30),
    sourceText,
    allowedVerseRefs: asStringArray(body.allowedVerseRefs),
    previousLines: asStringArray(body.previousLines).slice(-MAX_PREVIOUS_LINES),
    ...(instruction ? { instruction: instruction.slice(0, 2000) } : {}),
  };
}

// ---- Retries ---------------------------------------------------------------------

// Gemini's rate limit (429), overload (503) and dropped connections are usually
// momentary: wait 3 s, then 5 s, before reporting the error. A timeout is not
// retried (no time left), and every attempt fits in the same TIMEOUT_MS budget.
export const retryConfig = { delaysMs: [3000, 5000], minAttemptMs: 30_000 };

export function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) return error.status === 429 || error.status === 503;
  return error instanceof TypeError || /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network/i.test(String((error as Error)?.message ?? error));
}

export async function withRetry<T>(attempt: (timeoutMs: number) => Promise<T>): Promise<T> {
  const deadline = Date.now() + TIMEOUT_MS;
  for (let i = 0; ; i++) {
    try {
      return await attempt(deadline - Date.now());
    } catch (error) {
      const delay = retryConfig.delaysMs[i];
      if (delay === undefined || !isRetryable(error) || deadline - Date.now() - delay < retryConfig.minAttemptMs) throw error;
      console.warn(`podcast script: retry ${i + 1} in ${delay} ms (${(error as Error)?.message ?? error})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  return handleJson(req, res, async (body, apiKey, model) => {
    const request = validateInput(body);
    const { system, prompt } = buildPodcastPrompt(request);
    const raw = await withRetry(timeoutMs => generateJson<{ lines?: unknown }>({
      apiKey,
      model,
      system,
      prompt,
      schema: SCRIPT_SCHEMA,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      timeoutMs,
      effort: 'low', // long faithful rewriting: a little thinking keeps it complete
    }));
    return normalizePodcast(raw, request);
  });
}
