// Shared helpers for the /api/article/* functions (files under _lib are not routes).
//
// Kept free of imports from src/ and of JSON imports: Vercel runs these files
// as separate ES modules, so runtime imports need explicit .js extensions and
// data files are read with fs (listed under "includeFiles" in vercel.json).

import { GoogleGenAI } from '@google/genai';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { StylePack, StyleExample } from '../../src/types/article';

export const DEFAULT_MODEL = 'gemini-2.5-flash';

export function articleModel(): string {
  return process.env.ARTICLE_MODEL || DEFAULT_MODEL;
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
const MAX_KEY_LENGTH = 200;

// Key resolution: 1. the browser's key (X-Gemini-Api-Key header, entered in the
// UI), 2. the server's GEMINI_API_KEY. The key itself is never logged or returned.
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
  run: (body: Record<string, unknown>, apiKey: string) => Promise<T>
) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (!body) return res.status(400).json({ error: 'Expected a JSON body' });

  const apiKey = resolveApiKey(req)?.key;
  if (!apiKey) return res.status(500).json({ error: 'Missing GEMINI_API_KEY' });

  try {
    return res.status(200).json(await run(body, apiKey));
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error('Article API error:', error);
    return res.status(502).json({ error: String(error) });
  }
}

// ---- Gemini ------------------------------------------------------------------

export interface GenerateJsonOptions {
  apiKey: string;
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  timeoutMs: number;
  maxOutputTokens: number;
  temperature?: number;
  // Only Gemini 2.5 models accept a thinking budget; newer ones reject it.
  thinkingBudget?: number;
}

export async function generateJson<T>(options: GenerateJsonOptions): Promise<T> {
  const model = articleModel();
  const ai = new GoogleGenAI({ apiKey: options.apiKey });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await ai.models.generateContent({
      model,
      contents: options.prompt,
      config: {
        systemInstruction: options.system,
        responseMimeType: 'application/json',
        responseJsonSchema: options.schema,
        maxOutputTokens: options.maxOutputTokens,
        temperature: options.temperature ?? 0.8,
        abortSignal: controller.signal,
        ...(options.thinkingBudget !== undefined && model.startsWith('gemini-2.5')
          ? { thinkingConfig: { thinkingBudget: options.thinkingBudget } }
          : {}),
      },
    });
    const text = response.text?.trim();
    if (!text) throw new HttpError(502, 'لم يُرجع النموذج أي نص');
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new HttpError(502, 'أرجع النموذج JSON غير صالح');
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new HttpError(504, `انتهت مهلة النموذج (${Math.round(options.timeoutMs / 1000)} ثانية)`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
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
