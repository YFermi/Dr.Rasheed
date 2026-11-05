// POST /api/generate-podcast-script — turns one segment of an article (the
// introduction, a part of an axis, or the closing) into studio dialog for the
// programme «نظرية الشبكة العنكبوتية», straight from the article text (no idea
// tree). The client splits the article into segments and calls this once per
// segment, in order. Verse lines carry only a reference; the client inserts the
// canonical (Tanzil) text. When Gemini is busy, the next model of the fallback
// chain writes the segment.

import type {
  PodcastSegmentKind,
  PodcastSegmentRequest,
  PodcastSegmentResponse,
  PodcastSpeaker,
  PodcastLeadHost,
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
const COMMENT_SLOT = '...'; // same as src/types/podcast.ts

// Lively but faithful; the penalty discourages repeated verbal tics. Gemini 3.6+
// ignores temperature: the prompt's rules carry the same intent.
export const SAMPLING = { temperature: 0.5, frequencyPenalty: 0.4 };

// Same names as PODCAST_SPEAKERS / VERSE_SPEAKER in src/types/podcast.ts (only
// types are imported from src: the functions run as plain ESM on the server)
const NAMES: Record<Exclude<PodcastSpeaker, 'yousef'>, string> = {
  zakaria: 'زكريا',
  mustafa: 'مصطفى',
  mohammed: 'محمد',
  rasheed: 'د. رشيد الجراح',
  ali: 'أ. علي الشرمان',
};
const VERSE_SPEAKER = 'آية';
const LEAD_HOSTS: PodcastLeadHost[] = ['zakaria', 'mustafa'];

// Who speaks after the lead host in the opening relay, before handing back to him
const RELAY: Record<PodcastLeadHost, [keyof typeof NAMES, keyof typeof NAMES]> = {
  zakaria: ['mohammed', 'mustafa'],
  mustafa: ['zakaria', 'mohammed'],
};

const speakersOf = (coGuest: boolean) =>
  (Object.keys(NAMES) as (keyof typeof NAMES)[]).filter(s => coGuest || s !== 'ali');

function schemaFor(req: PodcastSegmentRequest) {
  return {
    type: 'object',
    properties: {
      lines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            speaker: { type: 'string', enum: [...speakersOf(req.coGuest).map(s => NAMES[s]), VERSE_SPEAKER] },
            text: { type: 'string' },
            ref: { type: 'string' },
          },
          required: ['speaker', 'text'],
        },
      },
      ...(req.kind === 'closing' ? { interruptions: { type: 'array', items: { type: 'string' } } } : {}),
    },
    required: req.kind === 'closing' ? ['lines', 'interruptions'] : ['lines'],
  };
}

// ---- Prompt ----------------------------------------------------------------------

const PROFILES = `## ملفات الشخصيات (ثابتة)
المحاورون:
- ${NAMES.zakaria} (اللغوي / الأصيل): عربية فصحى رصينة، يركّز على التأصيل اللغوي والشرعي للألفاظ.
- ${NAMES.mustafa} (المدقق / المحلل): مصرية بيضاء مثقفة، يركّز على العمق الفكري والنقد الموضوعي.
- ${NAMES.mohammed} (الواقعي / المنهجي): مصرية بيضاء مثقفة، يركّز على التطبيقات العملية والنتائج.
الضيوف:
- ${NAMES.rasheed} (الضيف الرئيسي): يلتزم حرفياً بنص المقال الأصلي، ويتمسك بمصطلحاته الحصرية: «نفتري الظن»، «لغو الأعراب»، «اللسان العربي المبين»، «افتراء من عند أنفسنا»، «والله أعلم».`;

function systemPrompt(req: PodcastSegmentRequest): string {
  const lead = NAMES[req.leadHost];
  const ali = req.coGuest
    ? `\n- ${NAMES.ali} (ضيف مشارك): يشارك ${NAMES.rasheed} الإجابات بالتناوب، من نص المقال وحده كذلك.`
    : `\n- لا ضيف مشارك في هذه الحلقة: ${NAMES.rasheed} هو الضيف الوحيد.`;
  const guests = req.coGuest ? `${NAMES.rasheed} و${NAMES.ali}` : NAMES.rasheed;
  return `أنت محرر سكريبتات صوتية لبرنامج «${req.programName}»، برنامج حواري يقدّم أبحاث أ.د. رشيد الجراح في تدبّر القرآن الكريم.
مهمتك تحويل نص مقال إلى حوار مكتوب يُقرأ في الاستوديو كما هو، دون أن يضيع شيء من مادته.

${PROFILES}${ali}

قائد هذه الحلقة: ${lead}؛ هو من يفتتح ويدير ويختتم.

## الالتزام بالمصدر (صارم)
1. نص المقال هو المصدر الوحيد لإجابات الضيوف (${guests}): كل فكرة وحجة ونتيجة وآية فيه، بالترتيب نفسه، وبألفاظه قدر الإمكان مع تحويلها إلى لغة منطوقة. لا تضف معلومة ليست فيه، ولا تحذف شيئاً منه.
2. المحاورون يسألون ويستوضحون ويعقّبون بإيجاز؛ لا يقدّمون من عندهم معلومة علمية غير موجودة في المقال.
3. المنهج: التحليل يقتصر على النص القرآني؛ لا نقل عن أهل التراث أو المفسرين، ولا قصصهم، ولا الإسرائيليات، ولا مقارنة مع من كتب في الموضوع، ولو سأل المحاور عن ذلك.

## بروتوكول المقص الذكي
4. حد الحديث المتصل: لا يتكلم الضيف أكثر من 200 إلى 250 كلمة متواصلة (دقيقة ونصف إلى دقيقتين)، والآيات التي يتلوها داخلة في كلامه المتصل. اقطع الشرح عند نقطة توقف منطقية، ثم يطرح أحد المحاورين سؤالاً استيضاحياً مبنياً على آخر ما قاله الضيف، دون أن يحرق الإجابة التالية.
5. المساحة الفارغة للتعقيب: إذا طلب المحاور من ضيف أن يعقّب على كلام ضيف آخر، فسطر المعقِّب ثلاث نقاط حصراً: {"speaker":"<اسم الضيف>","text":"${COMMENT_SLOT}"} — لا تكتب تعقيباً ليس في المقال.
6. نوّع صيغ الأسئلة والتعقيبات، ولا تكرر اللوازم الكلامية («بالضبط»، «سؤال جميل»، «أحسنت»…) ولا افتتاحيات الجمل نفسها.

## الآيات
7. كل آية في نص المقطع تُورد عنصراً مستقلاً {"speaker":"${VERSE_SPEAKER}","text":"","ref":"سورة:آية"} في موضعها من كلام الضيف، وقبلها يمهّد لها الضيف («قال تعالى:» أو نحوها). اترك text فارغاً دائماً، فالنظام يُدرج النص القرآني الموثّق. اختر ref من القائمة المسموح بها فقط، ولا تكتب نص أي آية داخل الكلام ولا الأقواس.

## عام
8. يتنادى المتحاورون بأسمائهم طبيعياً. الترحيب بالمستمعين في المقدمة والخاتمة فقط. لا «عزيزي القارئ» ولا «سيدي» ولا «سيادتكم».
9. إخلاء المسؤولية المنهجي نص ثابت يقرؤه ${lead} قبل هذا الحوار ويدرجه النظام؛ لا تكتبه ولا تكرره.
10. نص منطوق فقط: لا عناوين ولا ترقيم ولا إرشادات إخراج.

## الإخراج
أرجع JSON فقط: {"lines":[{"speaker":"…","text":"…","ref":"…"}]${req.kind === 'closing' ? ',"interruptions":["…"]' : ''}}، حيث speaker أحد: ${speakersOf(req.coGuest).map(s => NAMES[s]).join('، ')}، ${VERSE_SPEAKER}؛ و ref لعناصر الآيات فقط.`;
}

function segmentInstructions(req: PodcastSegmentRequest): string {
  const lead = NAMES[req.leadHost];
  const [second, third] = RELAY[req.leadHost].map(s => NAMES[s]);
  const leadVoice = req.leadHost === 'zakaria' ? 'بالفصحى' : 'بالمصرية البيضاء المثقفة';
  const topics = req.topics.length ? req.topics.map(t => `- ${t}`).join('\n') : '—';
  switch (req.kind) {
    case 'intro':
      return `# المطلوب: افتتاح الحلقة (قائدها ${lead})
قرأ ${lead} إخلاء المسؤولية المنهجي للتو؛ تابع افتتاحه بالترتيب الآتي:
1. ${lead} ${leadVoice}: بسملة وترحيب بالمستمعين في برنامج «${req.programName}»، الحلقة ${req.episodeNumber}، ثم يلخّص الثلث الأول من خيوط الحلقة السابقة (نص المقطع أدناه)، ويسلّم الكلمة لـ${second}.
2. ${second}: يلخّص الثلث الثاني، ويسلّم الكلمة لـ${third}.
3. ${third}: يلخّص الثلث الأخير، ويسلّم الكلمة لـ${lead}.
4. ${lead}: يرحّب بالدكتور رشيد${req.coGuest ? ' وبالأستاذ علي الشرمان' : ''} ويطرح السؤال الأول على الدكتور رشيد عن موضوع الحلقة.
لا يتكلم الضيوف في هذا المقطع.

# موضوعات الحلقة (المقاطع القادمة)
${topics}`;
    case 'closing': {
      const highlights = req.highlights?.length ? req.highlights.map(h => `- ${h}`).join('\n') : '—';
      return `# المطلوب: خاتمة الحلقة
- إن كان في نص المقطع تمهيد للجزء القادم أو دعاء، يقوله د. رشيد باختصار وبألفاظه.
- ثم يختتم ${lead} (قائد الحلقة) ${leadVoice}: شكر الضيوف و${second} و${third}، وتوديع المستمعين، والدعوة إلى متابعة الحلقة القادمة. من ٣ إلى ٦ مداخلات.
- interruptions: بنك مقاطعات من 5 إلى 8 أسئلة مقاطعة قصيرة بديلة يستعين بها مخرج الصوت في المونتاج، موزّعة على موضوعات الحلقة، يبدأ كل سؤال باسم المحاور الذي يطرحه («${NAMES.mustafa}: …»)، ولا يحرق إجابة.

# موضوعات الحلقة ومفاتيحها
${topics}
${highlights}`;
    }
    default:
      return `# المطلوب: المقطع ${req.segmentIndex} من ${req.bodyCount} في متن الحلقة — «${req.segmentTitle}»
- واصل الحوار من حيث انتهى (آخر الأسطر أدناه): إن كان آخر سطر سؤالاً للضيف فابدأ بجوابه، وإلا فابدأ بسؤال ينقل إلى هذا المقطع.
- حوّل نص المقطع كاملاً إلى حوار وفق القواعد والمقص الذكي، ووزّع الأسئلة على المحاورين الثلاثة بحسب ملفاتهم. لا تختم الحلقة ولا تودّع${req.segmentIndex < req.bodyCount ? '، فالحوار يستمر بعده' : ''}.`;
  }
}

export function buildPodcastPrompt(req: PodcastSegmentRequest): { system: string; prompt: string } {
  const previous = req.previousLines?.length
    ? `# آخر الحوار قبل هذا المقطع\n${req.previousLines.join('\n')}\n\n`
    : '';
  const instruction = req.instruction ? `\n\n# ملاحظة المستخدم لإعادة الكتابة (التزم بها)\n${req.instruction}` : '';
  const prompt = `# الحلقة
البرنامج: ${req.programName} — الحلقة ${req.episodeNumber}
قائد الحلقة: ${NAMES[req.leadHost]}${req.coGuest ? `\nالضيف المشارك: ${NAMES.ali}` : ''}
المقال: ${req.articleTitle}

${segmentInstructions(req)}

${previous}# نص المقطع${req.kind === 'body' ? ` — «${req.segmentTitle}»` : ''}
${req.sourceText}

# المراجع المسموح بها للآيات
${req.allowedVerseRefs.join('، ') || '— (لا آيات في هذا المقال)'}${instruction}`;
  return { system: systemPrompt(req), prompt };
}

// ---- Output ----------------------------------------------------------------------

const VERSE_SPAN_RE = /[﴾﴿{]([^﴾﴿{}]*)[﴾﴿}]\s*(?:[[(]([^\])]+)[\])])?/g;

// Keeps the episode's cast and allowed verse refs; a verse quoted inside a line
// becomes a verse line when its reference is allowed, and is dropped otherwise.
// A guest's comment slot stays exactly «...».
export function normalizePodcast(
  raw: { lines?: unknown; interruptions?: unknown },
  req: PodcastSegmentRequest
): Omit<PodcastSegmentResponse, 'model'> {
  const byName = new Map(speakersOf(req.coGuest).map(s => [NAMES[s], s as PodcastSpeaker]));
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
    const speaker = byName.get(name);
    if (!speaker) continue;
    const rawText = asString((item as Record<string, unknown>).text).trim();
    if (rawText && /^[.…\s]+$/.test(rawText)) {
      if (speaker === 'rasheed' || speaker === 'ali') lines.push({ type: 'speech', speaker, text: COMMENT_SLOT });
      continue;
    }
    const text = stripReaderAddress(rawText);
    if (!text) continue;
    if (!/[﴾﴿{]/.test(text)) {
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
  const interruptions = req.kind === 'closing'
    ? asStringArray(raw.interruptions).map(q => q.trim()).filter(Boolean).slice(0, 8)
    : undefined;
  return { lines, ...(interruptions ? { interruptions } : {}), ...(rejectedRefs.length ? { rejectedRefs } : {}) };
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
    leadHost: LEAD_HOSTS.includes(body.leadHost as PodcastLeadHost) ? (body.leadHost as PodcastLeadHost) : 'zakaria',
    coGuest: body.coGuest === true,
    articleTitle: asString(body.articleTitle).trim(),
    segmentTitle: asString(body.segmentTitle).trim(),
    segmentIndex: Number(body.segmentIndex) || 0,
    bodyCount: Number(body.bodyCount) || 0,
    topics: asStringArray(body.topics).slice(0, 30),
    highlights: asStringArray(body.highlights).slice(0, 30).map(h => h.slice(0, 300)),
    sourceText,
    allowedVerseRefs: asStringArray(body.allowedVerseRefs),
    previousLines: asStringArray(body.previousLines).slice(-MAX_PREVIOUS_LINES),
    ...(instruction ? { instruction: instruction.slice(0, 2000) } : {}),
  };
}

// ---- Auto-recovery -----------------------------------------------------------------

// When a model is busy (429 / 503), unreachable or not available to the key, the
// next one writes the segment: the chosen model first, then the chain
// gemini-3.8-flash → gemini-3.6-flash → gemini-3.5-flash-lite → gemini-3.1-pro-preview.
export const FALLBACK_CHAIN = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-pro-preview'];
export const recoveryConfig = { delayMs: 2000, minAttemptMs: 30_000 };

export const modelsToTry = (chosen: string) => [chosen, ...FALLBACK_CHAIN.filter(m => m !== chosen)];

const isBusy = (e: unknown) => e instanceof HttpError && (e.status === 429 || e.status === 503);
const isUnavailableModel = (e: unknown) => e instanceof HttpError && e.status === 502 && /غير متاح لهذا المفتاح/.test(e.message);
const isNetwork = (e: unknown) =>
  !(e instanceof HttpError) && (e instanceof TypeError || /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network/i.test(String((e as Error)?.message ?? e)));
// A model that rejects temperature / frequencyPenalty: the same model again without them
const rejectsSampling = (e: unknown) => e instanceof HttpError && /\(400\)/.test(e.message) && /temperature|penalty|frequency/i.test(e.message);

export async function withFallback<T>(
  chosen: string,
  attempt: (model: string, timeoutMs: number, withSampling: boolean) => Promise<T>
): Promise<{ result: T; model: string }> {
  const deadline = Date.now() + TIMEOUT_MS;
  const models = modelsToTry(chosen);
  let lastError: unknown;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    let withSampling = true;
    for (;;) {
      try {
        return { result: await attempt(model, deadline - Date.now(), withSampling), model };
      } catch (e) {
        lastError = e;
        if (withSampling && rejectsSampling(e)) {
          withSampling = false;
          continue;
        }
        break;
      }
    }
    const recoverable = isBusy(lastError) || isNetwork(lastError) || isUnavailableModel(lastError);
    const delay = isUnavailableModel(lastError) ? 0 : recoveryConfig.delayMs;
    if (!recoverable || i === models.length - 1 || deadline - Date.now() - delay < recoveryConfig.minAttemptMs) throw lastError;
    console.warn(`podcast script: ${model} failed (${(lastError as Error)?.message ?? lastError}); trying ${models[i + 1]}`);
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw lastError;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  return handleJson(req, res, async (body, apiKey, chosenModel): Promise<PodcastSegmentResponse> => {
    const request = validateInput(body);
    const { system, prompt } = buildPodcastPrompt(request);
    const { result, model } = await withFallback(chosenModel, (model, timeoutMs, withSampling) =>
      generateJson<{ lines?: unknown; interruptions?: unknown }>({
        apiKey,
        model,
        system,
        prompt,
        schema: schemaFor(request),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        timeoutMs,
        effort: 'low', // long faithful rewriting: a little thinking keeps it complete
        ...(withSampling ? { sampling: SAMPLING } : {}),
      })
    );
    return { ...normalizePodcast(result, request), model };
  });
}
