// Shared helpers for the /api/* functions (files under _lib are not routes):
// Google Gemini REST calls over fetch, API key resolution, style data,
// verse-reference checks.
//
// Kept free of imports from src/ and of JSON imports: Vercel runs these files
// as separate ES modules, so runtime imports need explicit .js extensions and
// data files are read with fs (listed under "includeFiles" in vercel.json).

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { StylePack, StyleExample } from '../../src/types/article';

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// gemini-1.5-flash was shut down in 2025 (requests to it fail). For speed the
// default is gemini-3.5-flash-lite, Google's fastest current model, whose
// thinking defaults to "minimal". Override with GEMINI_MODEL.
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
export const MAX_OUTPUT_TOKENS = 8192; // includes thinking tokens
// Every call stays under Vercel's 60 s function limit (vercel.json maxDuration)
export const DEFAULT_TIMEOUT_MS = 55_000;

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

// Models the user may pick in the app (🔑 window), sent in the X-Gemini-Model
// header. Only these are accepted, so a request cannot point the key at any model.
export const SELECTABLE_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.1-pro-preview'];
export const MODEL_HEADER = 'x-gemini-model';

// The picked model when allowed, else GEMINI_MODEL / the default
export function resolveModel(req: ApiRequest): string {
  const raw = req.headers?.[MODEL_HEADER];
  const picked = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return picked && SELECTABLE_MODELS.includes(picked) ? picked : geminiModel();
}

// ---- HTTP plumbing -----------------------------------------------------------

export interface ApiRequest {
  method?: string;
  body?: unknown;
  // Node lower-cases header names (both Vercel and Express)
  headers?: Record<string, string | string[] | undefined>;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: unknown): void;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const API_KEY_HEADER = 'x-gemini-api-key';
export const MISSING_KEY_ERROR = 'Missing GEMINI_API_KEY';
const MAX_KEY_LENGTH = 300;

// Key resolution: 1. the browser's key (X-Gemini-Api-Key header, entered in the
// UI), 2. the server's GEMINI_API_KEY. The key is never logged or returned.
export function resolveApiKey(req: ApiRequest): { key: string; source: 'header' | 'env' } | null {
  const raw = req.headers?.[API_KEY_HEADER];
  const headerKey = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (headerKey && headerKey.length <= MAX_KEY_LENGTH && !/\s/.test(headerKey)) return { key: headerKey, source: 'header' };
  const envKey = process.env.GEMINI_API_KEY;
  return envKey ? { key: envKey, source: 'env' } : null;
}

// Method check, API key, error → status mapping. `run` gets the parsed body.
export async function handleJson<T>(
  req: ApiRequest,
  res: ApiResponse,
  run: (body: Record<string, unknown>, apiKey: string, model: string) => Promise<T>
) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (!body) return res.status(400).json({ error: 'Expected a JSON body' });

  const apiKey = resolveApiKey(req)?.key;
  if (!apiKey) return res.status(500).json({ error: MISSING_KEY_ERROR });

  try {
    return res.status(200).json(await run(body, apiKey, resolveModel(req)));
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error('Gemini API error:', error);
    return res.status(502).json({ error: String(error) });
  }
}

// ---- Gemini generateContent (REST) ---------------------------------------------

export type Effort = 'minimal' | 'low' | 'medium' | 'high';

export interface GeminiRequest {
  apiKey: string;
  model?: string; // default: geminiModel()
  system?: string;
  prompt: string;
  timeoutMs?: number; // default DEFAULT_TIMEOUT_MS
  maxOutputTokens?: number;
  // How much the model thinks before answering (lower = faster and cheaper),
  // mapped to the model's own thinking setting.
  effort?: Effort;
  // JSON Schema for structured output
  schema?: Record<string, unknown>;
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

export interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  modelVersion?: string;
}

// Gemini 3.x takes thinkingLevel; Gemini 2.5 takes thinkingBudget (0 = off on
// Flash). Other models get no thinking setting.
const THINKING_BUDGETS: Record<Effort, number> = { minimal: 0, low: 0, medium: 1024, high: 4096 };
// "minimal" exists only on some 3.x models (Flash-Lite, 3.6 Flash); elsewhere
// the lowest level is "low".
const MINIMAL_THINKING_MODELS = /flash-lite|^gemini-3\.6-flash/;

function thinkingConfig(model: string, effort: Effort | undefined) {
  if (!effort) return undefined;
  if (/^gemini-3/.test(model)) {
    return { thinkingLevel: effort === 'minimal' && !MINIMAL_THINKING_MODELS.test(model) ? 'low' : effort };
  }
  if (/^gemini-2\.5/.test(model)) return { thinkingBudget: THINKING_BUDGETS[effort] };
  return undefined;
}

// Finish reasons meaning the model declined or was blocked
const BLOCKED_FINISH_REASONS = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'LANGUAGE']);

// Maps a Gemini API error to a message for the user (Arabic). Gemini reports an
// invalid key as 400 (API_KEY_INVALID), not 401.
function apiError(status: number, detail: string, model: string): HttpError {
  if (/API key not valid|API_KEY_INVALID/i.test(detail)) return new HttpError(401, 'المفتاح غير صالح');
  switch (status) {
    case 401:
      return new HttpError(401, 'المفتاح غير صالح');
    case 403:
      return new HttpError(403, 'لا يملك هذا المفتاح صلاحية استخدام Gemini API');
    case 404:
      return new HttpError(502, `النموذج ${model} غير متاح لهذا المفتاح`);
    case 429:
      return new HttpError(429, 'تم تجاوز حد الطلبات لدى Gemini، أعد المحاولة بعد قليل');
    case 500:
    case 503:
      return new HttpError(503, 'خدمة Gemini مزدحمة حالياً، أعد المحاولة بعد قليل');
    default:
      return new HttpError(502, `خطأ من Gemini API (${status}): ${detail}`.slice(0, 300));
  }
}

export async function callGemini(req: GeminiRequest): Promise<GeminiResponse> {
  const model = req.model ?? geminiModel();
  const thinking = thinkingConfig(model, req.effort);
  const body = {
    ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
    contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
    generationConfig: {
      maxOutputTokens: req.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
      ...(req.schema ? { responseMimeType: 'application/json', responseJsonSchema: req.schema } : {}),
      ...(thinking ? { thinkingConfig: thinking } : {}),
    },
  };

  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // The key goes in a header, as in Google's REST examples, so it never
    // appears in a URL (logs, proxies, error messages).
    const res = await fetch(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': req.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw apiError(res.status, String(data?.error?.message ?? res.statusText), model);
    }
    return (await res.json()) as GeminiResponse;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new HttpError(504, `انتهت مهلة النموذج (${Math.round(timeoutMs / 1000)} ثانية)`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// The answer text, without thought parts
export function responseText(response: GeminiResponse): string {
  return (response.candidates?.[0]?.content?.parts ?? [])
    .filter(p => !p.thought && typeof p.text === 'string')
    .map(p => p.text)
    .join('')
    .trim();
}

// A structured-output call: checks why the model stopped before parsing.
export async function generateJson<T>(req: GeminiRequest & { schema: Record<string, unknown> }): Promise<T> {
  const response = await callGemini(req);
  const blockReason = response.promptFeedback?.blockReason;
  const finishReason = response.candidates?.[0]?.finishReason;
  if (blockReason || (finishReason && BLOCKED_FINISH_REASONS.has(finishReason))) {
    throw new HttpError(422, `امتنع النموذج عن تنفيذ الطلب (${blockReason ?? finishReason})`);
  }
  if (finishReason === 'MAX_TOKENS') {
    throw new HttpError(502, 'انقطع رد النموذج عند الحد الأقصى للرموز؛ جرّب طولاً أقصر');
  }
  const text = responseText(response);
  if (!text) throw new HttpError(502, 'لم يُرجع النموذج أي نص');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(502, 'أرجع النموذج JSON غير صالح');
  }
}

// ---- Style data (built by scripts/extract-examples.ts) ------------------------

let stylePack: StylePack | null = null;

export async function loadStylePack(): Promise<StylePack> {
  if (!stylePack) {
    const file = path.join(process.cwd(), 'data', 'style-examples.json');
    stylePack = JSON.parse(await readFile(file, 'utf8')) as StylePack;
  }
  return stylePack;
}

export function formatExamples(examples: StyleExample[]): string {
  return examples
    .map((e, i) => `### مثال ${i + 1} — ${e.label}\n${e.text}`)
    .join('\n\n');
}

// ---- Verse references --------------------------------------------------------

interface VerseRange {
  surah: string;
  from: number;
  to: number;
}

// Same idea as normalizeArabic in src/utils/arabic.ts, reduced to what a surah
// name needs (not imported, see the note at the top).
function surahKey(name: string): string {
  return name
    .replace(/[ً-ٰٟۖ-ۭـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/^سوره?\s+/, '')
    .replace(/[\s-]+/g, '');
}

const toWesternDigits = (s: string) => s.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660));

export function parseVerseRef(ref: string): VerseRange | null {
  const m = toWesternDigits(ref).match(/^\s*(.+?)\s*:\s*(\d+)(?:\s*-\s*(\d+))?\s*$/);
  if (!m) return null;
  const from = Number(m[2]);
  const to = Number(m[3] ?? m[2]);
  return to >= from ? { surah: surahKey(m[1]), from, to } : null;
}

// "الأعراف: 80" → "الأعراف:80"
export function canonicalRef(ref: string): string {
  const m = toWesternDigits(ref).match(/^\s*(.+?)\s*:\s*(\d+)(?:\s*-\s*(\d+))?\s*$/);
  if (!m) return ref.trim();
  return `${m[1].trim()}:${m[2]}${m[3] && m[3] !== m[2] ? `-${m[3]}` : ''}`;
}

// Allowed when it lies inside an allowed range of the same surah
// (citing الأعراف:81 is fine when الأعراف:80-84 is allowed).
export function isAllowedRef(ref: string, allowed: string[]): boolean {
  const r = parseVerseRef(ref);
  if (!r) return false;
  return allowed.some(a => {
    const range = parseVerseRef(a);
    return range !== null && range.surah === r.surah && r.from >= range.from && r.to <= range.to;
  });
}

// ---- Small validation helpers ------------------------------------------------

export const asString = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
export const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
export const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

export const ORDINALS = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];

// ---- Prompt pieces shared by the article calls ------------------------------

// Same text as NO_REFERENCE in src/utils/referenceContext.ts
export const NO_REFERENCE = 'لا يوجد مقال مرجعي. التزم بدليل الأسلوب العام فقط.';

// The reference article (the previous part of the series) as a direct style model
export function referenceSection(referenceContext: string | undefined): string {
  const context = referenceContext?.trim();
  if (!context || context === NO_REFERENCE) return `## مرجع أسلوب مباشر\n${NO_REFERENCE}`;
  return `## مرجع أسلوب مباشر (المقال السابق من نفس السلسلة)

اقرأ هذا المقتطف من المقال السابق بعناية. التزم بنفس:
- نبرة الصوت وطريقة مخاطبة القارئ
- طريقة تطوير الفكرة (سؤال ← شاهد ← نقد ← نتيجة)
- عبارات الانتقال والتحفّظ
- طريقة الاستشهاد القرآني

لا تنسخ منه، بل اكتب بنفس الأسلوب:

${context}`;
}
