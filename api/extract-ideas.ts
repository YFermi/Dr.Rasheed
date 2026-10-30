import { GoogleGenAI } from '@google/genai';
import { resolveApiKey } from './_lib/gemini.js';

// POST /api/extract-ideas — Gemini extraction of ideas from a brainstorm transcript.
// Runs as a Vercel serverless function; server.ts mounts the same handler for local dev.
// On any non-200 response the client (ScriptImportModal) falls back to local suggestions.

const MODEL = 'gemini-2.5-flash';
const MAX_TRANSCRIPT_CHARS = 8000;
const REQUEST_TIMEOUT_MS = 6000;
const DEFAULT_SPEAKERS = 'د. رشيد، مصطفى، يوسف، زكريا، أبو هارون، علي نور';

// The subset of the request/response API this handler uses. Vercel's Node
// runtime and Express both provide it, so no @vercel/node types are needed.
export interface ApiRequest {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: unknown): void;
}

interface ExtractRequestBody {
  transcript?: unknown;
  speakers?: string[];
  axes?: { id: string; label: string }[];
}

function buildPrompt(transcript: string, speakers: string[], axes: { id: string; label: string }[]): string {
  return `أنت باحث أكاديمي متخصص في الدراسات القرآنية واللغوية وتحليل جلسات العصف الذهني.
المهمة: قم بتحليل تفريغ جلسة العصف الذهني الآتية باللغة العربية واستخراج الأفكار والشواهد والأسئلة البحثية المقترحة لإضافتها إلى شجرة البحث (Idea Builder).

قائمة المتحدثين الحاضرين في الجلسة:
${speakers.length > 0 ? speakers.join('، ') : DEFAULT_SPEAKERS}

قائمة المحاور الحالية في الشجرة:
${axes.map(a => `- [${a.id}]: ${a.label}`).join('\n')}

نص التفريغ:
"""
${transcript.slice(0, MAX_TRANSCRIPT_CHARS)}
"""

المطلوب: استخراج قائمة من الأفكار والشواهد القرآنية بصيغة JSON حصراً.
كل عنصر يجب أن يحتوي على:
- id: معرف نصي فريد (مثل idea-ext-1)
- title: عنوان موجز للفكرة باللغة العربية (مثل: "دلالة السبيل في سياق التجارة والنسل")
- summary: شرح أو ملخص للفكرة في جملة أو جملتين
- speaker: اسم المتحدث الأقرب للفكرة من قائمة المتحدثين
- suggestedParentId: معرف المحور الأنسب من قائمة المحاور أعلاه (أو 'root-project' إذا كانت محوراً جديداً)
- suggestedParentLabel: اسم المحور الأنسب
- quranicVerses: الآيات القرآنية المستشهد بها إن وجدت مع الأقواس ﴿ ﴾ ورقم الآية
- type: أحد الأنواع التالية فقط: 'idea' أو 'evidence' أو 'question'
- status: 'brainstorm'
- accepted: true

أرجع مصفوفة JSON نقية فقط بدون أي كتل نصوص markdown إضافية:
[
  {
    "id": "ext-1",
    "title": "...",
    "summary": "...",
    "speaker": "...",
    "suggestedParentId": "...",
    "suggestedParentLabel": "...",
    "quranicVerses": "...",
    "type": "idea",
    "status": "brainstorm",
    "accepted": true
  }
]`;
}

function parseIdeas(responseText: string): unknown[] {
  try {
    const parsed = JSON.parse(responseText);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // The model sometimes wraps the array in markdown
    const match = responseText.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  }
}

export async function extractIdeas(apiKey: string, body: ExtractRequestBody) {
  const transcript = typeof body.transcript === 'string' ? body.transcript : '';
  const ai = new GoogleGenAI({ apiKey });

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('AI request timeout')), REQUEST_TIMEOUT_MS)
  );
  const response = await Promise.race([
    ai.models.generateContent({
      model: MODEL,
      contents: buildPrompt(transcript, body.speakers ?? [], body.axes ?? []),
      config: { responseMimeType: 'application/json' },
    }),
    timeout,
  ]);

  return { fallback: false, ideas: parseIdeas(response.text?.trim() || '[]') };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = (req.body ?? {}) as ExtractRequestBody;
  if (typeof body.transcript !== 'string' || !body.transcript.trim()) {
    return res.status(400).json({ error: 'يرجى تزويد نص العصف الذهني (transcript)' });
  }

  // The browser's key (header) first, then the server's GEMINI_API_KEY
  const apiKey = resolveApiKey(req)?.key;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing GEMINI_API_KEY' });
  }

  try {
    const result = await extractIdeas(apiKey, body);
    return res.status(200).json(result);
  } catch (error) {
    console.error('AI extraction error:', error);
    return res.status(500).json({ error: String(error) });
  }
}
