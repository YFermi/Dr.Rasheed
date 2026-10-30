// Shared helpers for the /api/* functions (files under _lib are not routes):
// Anthropic Messages API calls over fetch, API key resolution, style data,
// verse-reference checks.
//
// Kept free of imports from src/ and of JSON imports: Vercel runs these files
// as separate ES modules, so runtime imports need explicit .js extensions and
// data files are read with fs (listed under "includeFiles" in vercel.json).

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { StylePack, StyleExample } from '../../src/types/article';

export const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';
// Claude Sonnet 3.5 (claude-3-5-sonnet-20241022) was retired on 2025-10-28;
// claude-sonnet-5-5 is the current Sonnet. Override with ANTHROPIC_MODEL.
export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const MAX_TOKENS = 8192;

export function claudeModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

// Models that take the server-side refusal fallback in its "default" form
// (Claude API only): a policy decline is retried on a fallback model in the same call.
const FALLBACK_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1']);
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

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

export const API_KEY_HEADER = 'x-anthropic-api-key';
export const MISSING_KEY_ERROR = 'Missing ANTHROPIC_API_KEY';
const MAX_KEY_LENGTH = 300;

// Key resolution: 1. the browser's key (X-Anthropic-Api-Key header, entered in
// the UI), 2. the server's ANTHROPIC_API_KEY. The key is never logged or returned.
export function resolveApiKey(req: ApiRequest): { key: string; source: 'header' | 'env' } | null {
  const raw = req.headers?.[API_KEY_HEADER];
  const headerKey = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (headerKey && headerKey.length <= MAX_KEY_LENGTH && !/\s/.test(headerKey)) return { key: headerKey, source: 'header' };
  const envKey = process.env.ANTHROPIC_API_KEY;
  return envKey ? { key: envKey, source: 'env' } : null;
}

// Method check, API key, error → status mapping. `run` gets the parsed body.
export async function handleJson<T>(
  req: ApiRequest,
  res: ApiResponse,
  run: (body: Record<string, unknown>, apiKey: string) => Promise<T>
) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (!body) return res.status(400).json({ error: 'Expected a JSON body' });

  const apiKey = resolveApiKey(req)?.key;
  if (!apiKey) return res.status(500).json({ error: MISSING_KEY_ERROR });

  try {
    return res.status(200).json(await run(body, apiKey));
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error('Claude API error:', error);
    return res.status(502).json({ error: String(error) });
  }
}

// ---- Anthropic Messages API ----------------------------------------------------

export type Effort = 'low' | 'medium' | 'high';

export interface ClaudeRequest {
  apiKey: string;
  system?: string;
  prompt: string;
  timeoutMs: number;
  maxTokens?: number;
  // Thinking is adaptive on current models; effort sets how much it does
  // (lower = faster and cheaper). Sampling settings such as temperature are
  // not sent: current models reject non-default values.
  effort?: Effort;
  // JSON schema for structured output (every object needs additionalProperties: false)
  schema?: Record<string, unknown>;
  // Cache the system prompt (shared by consecutive calls, e.g. the style guide)
  cacheSystem?: boolean;
}

interface ClaudeContentBlock {
  type: string;
  text?: string;
}

export interface ClaudeResponse {
  model: string;
  content: ClaudeContentBlock[];
  stop_reason: string | null;
  stop_details?: { category?: string | null; explanation?: string | null } | null;
}

// Maps an Anthropic API error status to a message for the user (Arabic).
function apiErrorMessage(status: number, detail: string, model: string): HttpError {
  switch (status) {
    case 401:
      return new HttpError(401, 'المفتاح غير صالح');
    case 403:
      return new HttpError(403, 'لا يملك هذا المفتاح صلاحية استخدام النموذج');
    case 404:
      return new HttpError(502, `النموذج ${model} غير متاح لهذا المفتاح`);
    case 429:
      return new HttpError(429, 'تم تجاوز حد الطلبات لدى Anthropic، أعد المحاولة بعد قليل');
    case 500:
    case 503:
    case 529:
      return new HttpError(503, 'خدمة Claude مزدحمة حالياً، أعد المحاولة بعد قليل');
    default:
      return new HttpError(502, `خطأ من Anthropic API (${status}): ${detail}`.slice(0, 300));
  }
}

export async function callClaude(req: ClaudeRequest): Promise<ClaudeResponse> {
  const model = claudeModel();
  const useFallback = FALLBACK_MODELS.has(model);
  const outputConfig = {
    ...(req.effort ? { effort: req.effort } : {}),
    ...(req.schema ? { format: { type: 'json_schema', schema: req.schema } } : {}),
  };

  const body = {
    model,
    max_tokens: req.maxTokens ?? MAX_TOKENS,
    ...(req.system
      ? { system: [{ type: 'text', text: req.system, ...(req.cacheSystem ? { cache_control: { type: 'ephemeral' } } : {}) }] }
      : {}),
    messages: [{ role: 'user', content: req.prompt }],
    ...(Object.keys(outputConfig).length > 0 ? { output_config: outputConfig } : {}),
    ...(useFallback ? { fallbacks: 'default' } : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs);
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': req.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
        ...(useFallback ? { 'anthropic-beta': FALLBACK_BETA } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw apiErrorMessage(res.status, String(data?.error?.message ?? res.statusText), model);
    }
    return (await res.json()) as ClaudeResponse;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new HttpError(504, `انتهت مهلة النموذج (${Math.round(req.timeoutMs / 1000)} ثانية)`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function responseText(response: ClaudeResponse): string {
  return response.content
    .filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text)
    .join('')
    .trim();
}

// A structured-output call: checks why the model stopped before parsing.
export async function generateJson<T>(req: ClaudeRequest & { schema: Record<string, unknown> }): Promise<T> {
  const response = await callClaude(req);
  if (response.stop_reason === 'refusal') {
    const category = response.stop_details?.category;
    throw new HttpError(422, `امتنع النموذج عن تنفيذ الطلب${category ? ` (${category})` : ''}`);
  }
  if (response.stop_reason === 'max_tokens') {
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
