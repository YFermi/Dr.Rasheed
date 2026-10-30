// POST /api/article/stitch — rewrites the paragraphs on both sides of a section
// boundary so the transition reads smoothly. Paragraph counts are preserved.

import type { StitchRequest, StitchResponse } from '../../src/types/article';
import {
  type ApiRequest,
  type ApiResponse,
  HttpError,
  handleJson,
  generateJson,
  loadStylePack,
  asString,
  asStringArray,
} from '../_lib/gemini.js';

const TIMEOUT_MS = 55_000; // under Vercel's 60 s limit
const MAX_PARAGRAPHS_PER_SIDE = 2;

const STITCH_SCHEMA = {
  type: 'object',
  properties: {
    newA_ending: { type: 'array', items: { type: 'string' } },
    newB_start: { type: 'array', items: { type: 'string' } },
  },
  required: ['newA_ending', 'newB_start'],
  additionalProperties: false,
};

export function buildStitchPrompt(req: StitchRequest, styleGuide: string): { system: string; prompt: string } {
  const system = `أنت محرر يصقل الانتقال بين محورين متتاليين في مقال بأسلوب د. رشيد الجراح.
عدّل أقل قدر ممكن: لا تغيّر الأفكار ولا تضف جديداً، ولا تكتب أي نص قرآني ولا الأقواس ﴿ ﴾.

${styleGuide}`;

  const prompt = `# آخر فقرات المحور الأول (${req.sectionA_ending.length})
${req.sectionA_ending.map((p, i) => `[${i + 1}] ${p}`).join('\n\n')}

# أول فقرات المحور التالي (${req.sectionB_start.length})
${req.sectionB_start.map((p, i) => `[${i + 1}] ${p}`).join('\n\n')}

# خطة الانتقال
${req.transitionPlan || '—'}

# المطلوب
أعد كتابة هذه الفقرات ليتصل الكلام بسلاسة (عبارات مثل «وهذا يقودنا إلى…»، «فنعود لنطرح السؤال نفسه…»).
أرجع JSON: newA_ending بعدد ${req.sectionA_ending.length} فقرات، و newB_start بعدد ${req.sectionB_start.length} فقرات، بالترتيب نفسه.`;

  return { system, prompt };
}

// Falls back to the original paragraphs if the model changed their number or
// slipped verse brackets in.
export function normalizeStitch(raw: Partial<StitchResponse>, req: StitchRequest): StitchResponse & { changed: boolean } {
  const a = asStringArray(raw.newA_ending).map(p => p.trim());
  const b = asStringArray(raw.newB_start).map(p => p.trim());
  const valid = (out: string[], orig: string[]) =>
    out.length === orig.length && out.every(p => p.length > 0 && !/[﴾﴿]/.test(p));
  const okA = valid(a, req.sectionA_ending);
  const okB = valid(b, req.sectionB_start);
  return {
    newA_ending: okA ? a : req.sectionA_ending,
    newB_start: okB ? b : req.sectionB_start,
    changed: okA || okB,
  };
}

function validateInput(body: Record<string, unknown>): StitchRequest {
  const toParagraphs = (v: unknown) =>
    (typeof v === 'string' ? [v] : asStringArray(v)).map(p => p.trim()).filter(Boolean).slice(-MAX_PARAGRAPHS_PER_SIDE);
  const a = toParagraphs(body.sectionA_ending);
  const b = (typeof body.sectionB_start === 'string' ? [body.sectionB_start] : asStringArray(body.sectionB_start))
    .map(p => p.trim())
    .filter(Boolean)
    .slice(0, MAX_PARAGRAPHS_PER_SIDE);
  if (a.length === 0 || b.length === 0) throw new HttpError(400, 'يلزم إرسال فقرات من جانبي الانتقال');
  return { sectionA_ending: a, sectionB_start: b, transitionPlan: asString(body.transitionPlan) };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  return handleJson(req, res, async (body, apiKey) => {
    const request = validateInput(body);
    const { styleGuide } = await loadStylePack();
    const { system, prompt } = buildStitchPrompt(request, styleGuide);
    const raw = await generateJson<Partial<StitchResponse>>({
      apiKey,
      system,
      prompt,
      schema: STITCH_SCHEMA,
      timeoutMs: TIMEOUT_MS,
      effort: 'minimal',
    });
    return normalizeStitch(raw, request);
  });
}
