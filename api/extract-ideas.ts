// POST /api/extract-ideas — Claude extraction of ideas from a brainstorm transcript.
// Runs as a Vercel serverless function; server.ts mounts the same handler for local dev.
// On any non-200 response the client (ScriptImportModal) falls back to local suggestions.

import { type ApiRequest, type ApiResponse, handleJson, generateJson, HttpError } from './_lib/claude.js';

const MAX_TRANSCRIPT_CHARS = 8000;
const REQUEST_TIMEOUT_MS = 50_000; // under Vercel's 60 s limit
const DEFAULT_SPEAKERS = 'د. رشيد، مصطفى، يوسف، زكريا، أبو هارون، علي نور';

interface ExtractRequestBody {
  transcript?: unknown;
  speakers?: string[];
  axes?: { id: string; label: string }[];
}

const IDEA_SCHEMA = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          summary: { type: 'string' },
          speaker: { type: 'string' },
          suggestedParentId: { type: 'string' },
          suggestedParentLabel: { type: 'string' },
          quranicVerses: { type: 'string' },
          type: { type: 'string', enum: ['idea', 'evidence', 'question'] },
          status: { type: 'string', enum: ['brainstorm'] },
          accepted: { type: 'boolean' },
        },
        required: ['id', 'title', 'summary', 'speaker', 'suggestedParentId', 'suggestedParentLabel', 'quranicVerses', 'type', 'status', 'accepted'],
        additionalProperties: false,
      },
    },
  },
  required: ['ideas'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `أنت باحث أكاديمي متخصص في الدراسات القرآنية واللغوية، تعمل مع فريق د. رشيد الجراح على سلسلة «لماذا قدّم نبي الله لوط بناته بدلاً من ضيوفه؟».
مهمتك تحليل تفريغ جلسة عصف ذهني باللغة العربية، واستخراج ما فيها من أفكار وشواهد قرآنية وأسئلة بحثية لإضافتها إلى شجرة البحث (Idea Builder).
- صُغ العناوين والملخصات بعربية فصيحة رصينة، بنبرة التدبّر التي يكتب بها د. رشيد: سؤال يُطرح، وشاهد يُستدعى، وفهم يُقترح بتحوّط («نظن»، «في رأينا»).
- لا تنسب إلى المتحدثين ما لم يقولوه، ولا تخترع آيات: انقل الآية كما وردت في التفريغ مع الأقواس ﴿ ﴾ ومرجعها [سورة: آية]، واترك الحقل فارغاً إن لم ترد آية.`;

function buildPrompt(transcript: string, speakers: string[], axes: { id: string; label: string }[]): string {
  return `قائمة المتحدثين الحاضرين في الجلسة:
${speakers.length > 0 ? speakers.join('، ') : DEFAULT_SPEAKERS}

قائمة المحاور الحالية في الشجرة:
${axes.map(a => `- [${a.id}]: ${a.label}`).join('\n')}

نص التفريغ:
"""
${transcript.slice(0, MAX_TRANSCRIPT_CHARS)}
"""

المطلوب: قائمة ideas، لكل عنصر:
- id: معرف نصي فريد (مثل ext-1)
- title: عنوان موجز للفكرة (مثل: «دلالة السبيل في سياق التجارة والنسل»)
- summary: شرح الفكرة في جملة أو جملتين
- speaker: اسم المتحدث الأقرب للفكرة من قائمة المتحدثين
- suggestedParentId: معرف المحور الأنسب من القائمة أعلاه (أو 'root-project' إذا كانت محوراً جديداً)
- suggestedParentLabel: اسم ذلك المحور
- quranicVerses: الآيات المستشهد بها إن وجدت، وإلا نص فارغ
- type: 'idea' أو 'evidence' أو 'question'
- status: 'brainstorm'
- accepted: true`;
}

export async function extractIdeas(apiKey: string, body: ExtractRequestBody) {
  const transcript = typeof body.transcript === 'string' ? body.transcript : '';
  const result = await generateJson<{ ideas?: unknown[] }>({
    apiKey,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(transcript, body.speakers ?? [], body.axes ?? []),
    schema: IDEA_SCHEMA,
    timeoutMs: REQUEST_TIMEOUT_MS,
    effort: 'low', // extraction, not reasoning
  });
  return { fallback: false, ideas: Array.isArray(result.ideas) ? result.ideas : [] };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  // handleJson: method check, the browser's key (header) or the server's ANTHROPIC_API_KEY
  return handleJson(req, res, async (body, apiKey) => {
    const request = body as ExtractRequestBody;
    if (typeof request.transcript !== 'string' || !request.transcript.trim()) {
      throw new HttpError(400, 'يرجى تزويد نص العصف الذهني (transcript)');
    }
    return extractIdeas(apiKey, request);
  });
}
