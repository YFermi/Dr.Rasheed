// POST /api/analyze-reference — Gemini analysis of a finished, verified article:
// its main ideas in order (with verse refs and a verbatim excerpt), its structure
// and its distinctive style. The ideas join the tree as reference ideas.
// Runs as a Vercel serverless function; server.ts mounts the same handler for local dev.

import { type ApiRequest, type ApiResponse, handleJson, generateJson, HttpError, asString, asStringArray, wordCount } from './_lib/gemini.js';

export const MAX_ARTICLE_CHARS = 80_000;
const MAX_EXCERPT_WORDS = 200;
const MAX_OUTPUT_TOKENS = 16_384; // ~15 ideas with excerpts of up to 200 words
const TIME_BUDGET_MS = 55_000; // under Vercel's 60 s limit, retry included
const MIN_RETRY_MS = 20_000; // a retry needs at least this much of the budget left

interface AnalyzeRequestBody {
  text?: unknown;
  title?: unknown;
  storyName?: unknown;
}

export interface ReferenceIdea {
  title: string;
  summary: string;
  verses: string[];
  excerpt: string;
  excerptFound: boolean; // the excerpt appears verbatim in the article
  axisIndex: number;
}

export interface ReferenceAnalysis {
  title: string;
  structure: { introduction: string; axes: string[]; conclusion: string };
  ideas: ReferenceIdea[];
  styleNotes: string;
  seriesNotes: string;
}

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    structure: {
      type: 'object',
      properties: {
        introduction: { type: 'string' },
        axes: { type: 'array', items: { type: 'string' } },
        conclusion: { type: 'string' },
      },
      required: ['introduction', 'axes', 'conclusion'],
      additionalProperties: false,
    },
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          verses: { type: 'array', items: { type: 'string' } },
          excerpt: { type: 'string' },
          axisIndex: { type: 'integer' },
        },
        required: ['title', 'summary', 'verses', 'excerpt', 'axisIndex'],
        additionalProperties: false,
      },
    },
    styleNotes: { type: 'string' },
    seriesNotes: { type: 'string' },
  },
  required: ['title', 'structure', 'ideas', 'styleNotes', 'seriesNotes'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `أنت باحث في الدراسات القرآنية تعمل مع فريق د. رشيد الجراح.

المطلوب: تحليل المقال التالي تحليلاً بنوياً دقيقاً واستخراج:

1. الأفكار الرئيسية مرتبة حسب تسلسلها في المقال.
   لكل فكرة: عنوان مختصر، ملخص (2-3 جمل)، الآيات المستشهد بها (مراجع فقط مثل [هود: 77-83])، والمقطع الأبرز من المقال الذي يعبّر عنها (اقتباس حرفي لا يتجاوز 200 كلمة).

2. بنية المقال: المقدمة، المحاور (بعناوينها)، الخاتمة.

3. الأسلوب المميز في هذا المقال: عبارات انتقال فريدة، نبرة خاصة، طريقة استدلال مميزة. (هذا سيُستخدم لاحقاً كمرجع أسلوب).

قواعد صارمة:
- لا تخترع أفكاراً غير موجودة في النص.
- لا تكتب نص الآيات، اذكر المرجع فقط.
- حافظ على تسلسل الأفكار كما وردت في المقال.
- إذا كان المقال جزءاً من سلسلة، اذكر ما يشير إليه من أجزاء سابقة.`;

function buildPrompt(text: string, title: string, storyName: string): string {
  return `القصة: ${storyName || 'غير محددة'}
عنوان المقال: ${title || 'غير محدد'}

نص المقال:
"""
${text}
"""

أعد JSON بالحقول:
- title: عنوان المقال
- structure: { introduction: ملخص المقدمة، axes: عناوين المحاور بترتيبها، conclusion: ملخص الخاتمة }
- ideas: الأفكار بترتيب ورودها، لكل فكرة: title، summary، verses (مراجع بصيغة "السورة: الآية" أو "السورة: من-إلى" دون نص الآية)، excerpt (اقتباس حرفي منقول كما هو من النص، لا يتجاوز 200 كلمة)، axisIndex (رقم المحور في structure.axes الذي وردت فيه الفكرة، يبدأ من 0)
- styleNotes: ملاحظات الأسلوب المميز في هذا المقال
- seriesNotes: ما يشير إليه المقال من أجزاء سابقة في السلسلة (نص فارغ إن لم يُشر إلى شيء)`;
}

// Same idea as normalizeArabic in src/utils/arabic.ts (not imported, see _lib/gemini.ts):
// enough to find a quotation in the article despite diacritics and spacing.
function normalizeForMatch(text: string): string {
  return text
    .replace(/[ً-ٰٟۖ-ۭـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[«»"“”'(){}\[\]﴿﴾.,،؛:!?؟…-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "[هود: 77-83]" / "﴿…﴾ هود:٧٧" → "هود: 77-83"; null when not a reference
function normalizeVerseRef(ref: string): string | null {
  const m = ref
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[[\]﴿﴾()]/g, '')
    .match(/^\s*(?:سورة\s+)?([؀-ۿ\s]+?)\s*:\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*$/);
  if (!m) return null;
  const to = m[3] && m[3] !== m[2] ? `-${m[3]}` : '';
  return `${m[1].trim()}: ${m[2]}${to}`;
}

const trimWords = (text: string, max: number) => {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length <= max ? text.trim() : `${words.slice(0, max).join(' ')}…`;
};

// Keeps the response to the schema whatever the model returned; null when it
// has no usable idea (then the request is retried once).
export function normalizeAnalysis(raw: Partial<ReferenceAnalysis> | null, text: string, fallbackTitle: string): ReferenceAnalysis | null {
  if (!raw || typeof raw !== 'object') return null;
  const structure = (raw.structure && typeof raw.structure === 'object' ? raw.structure : {}) as Partial<ReferenceAnalysis['structure']>;
  const axes = asStringArray(structure.axes).map(a => a.trim()).filter(Boolean);
  const normalizedText = normalizeForMatch(text);

  const ideas: ReferenceIdea[] = (Array.isArray(raw.ideas) ? raw.ideas : [])
    .filter(i => i && typeof i === 'object' && asString(i.title).trim())
    .map(i => {
      const excerpt = trimWords(asString(i.excerpt), MAX_EXCERPT_WORDS);
      const probe = normalizeForMatch(excerpt.replace(/…$/, ''));
      const index = Number.isInteger(i.axisIndex) ? i.axisIndex : 0;
      return {
        title: asString(i.title).trim(),
        summary: asString(i.summary).trim(),
        verses: [...new Set(asStringArray(i.verses).map(normalizeVerseRef).filter((r): r is string => r !== null))],
        excerpt,
        excerptFound: probe.length > 0 && normalizedText.includes(probe),
        axisIndex: axes.length ? Math.min(Math.max(index, 0), axes.length - 1) : 0,
      };
    });
  if (ideas.length === 0) return null;

  return {
    title: asString(raw.title).trim() || fallbackTitle,
    structure: {
      introduction: asString(structure.introduction).trim(),
      axes: axes.length ? axes : [fallbackTitle || 'المقال'],
      conclusion: asString(structure.conclusion).trim(),
    },
    ideas,
    styleNotes: asString(raw.styleNotes).trim(),
    seriesNotes: asString(raw.seriesNotes).trim(),
  };
}

// The model's answer was unusable (bad JSON / schema), as opposed to a key,
// quota or timeout error, where a retry would not help.
const isBadOutput = (e: unknown) => e instanceof HttpError && e.status === 502 && /JSON|أي نص/.test(e.message);

export async function analyzeReference(apiKey: string, body: AnalyzeRequestBody, model?: string): Promise<ReferenceAnalysis> {
  const text = asString(body.text).trim();
  const title = asString(body.title).trim();
  const prompt = buildPrompt(text, title, asString(body.storyName).trim());
  const started = Date.now();

  for (let attempt = 1; ; attempt++) {
    const remaining = TIME_BUDGET_MS - (Date.now() - started);
    try {
      const raw = await generateJson<Partial<ReferenceAnalysis>>({
        apiKey,
        model,
        system: SYSTEM_PROMPT,
        prompt,
        schema: ANALYSIS_SCHEMA,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        timeoutMs: remaining,
        effort: 'minimal', // extraction, not reasoning; keeps it within the time limit
      });
      const analysis = normalizeAnalysis(raw, text, title);
      if (analysis) return analysis;
      if (attempt >= 2 || TIME_BUDGET_MS - (Date.now() - started) < MIN_RETRY_MS) {
        throw new HttpError(502, 'لم يستخرج النموذج أي فكرة من المقال');
      }
    } catch (e) {
      if (!isBadOutput(e) || attempt >= 2 || TIME_BUDGET_MS - (Date.now() - started) < MIN_RETRY_MS) throw e;
    }
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  // handleJson: method check, the browser's key (header) or the server's GEMINI_API_KEY
  return handleJson(req, res, async (body, apiKey, model) => {
    const request = body as AnalyzeRequestBody;
    const text = typeof request.text === 'string' ? request.text.trim() : '';
    if (!text) throw new HttpError(400, 'يرجى تزويد نص المقال (text)');
    if (text.length > MAX_ARTICLE_CHARS) {
      throw new HttpError(413, `المقال أطول من ${MAX_ARTICLE_CHARS.toLocaleString('en-US')} حرف`);
    }
    if (wordCount(text) < 50) throw new HttpError(400, 'النص أقصر من أن يكون مقالاً مكتملاً');
    return analyzeReference(apiKey, request, model);
  });
}
