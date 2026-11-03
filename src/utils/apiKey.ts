// The user's Google Gemini API key (GEMINI_API_KEY, from Google AI Studio),
// kept only in this browser (localStorage) under its own key — so it is never
// part of the persisted project or its JSON export. Sent with every /api/*
// request in the X-Gemini-Api-Key header.

const STORAGE_KEY = 'idea-builder-gemini-key';
export const API_KEY_HEADER = 'X-Gemini-Api-Key';

export function getApiKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage blocked (private mode, disabled cookies)
  }
}

export function setApiKey(key: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, key.trim());
  } catch {
    // storage blocked: the key just won't persist
  }
}

export function removeApiKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing stored
  }
}

export function hasApiKey(): boolean {
  return !!getApiKey();
}

// Gemini API keys from Google AI Studio start with this prefix
export const KEY_PREFIX = 'AIzaSy';

export function hasValidKeyFormat(key: string): boolean {
  return key.trim().startsWith(KEY_PREFIX);
}

// ---- Model (picked in the 🔑 window, kept in this browser) ---------------------

const MODEL_STORAGE_KEY = 'idea-builder-gemini-model';
export const MODEL_HEADER = 'X-Gemini-Model';

// Same list as SELECTABLE_MODELS in api/_lib/gemini.ts; '' = the server's default
export const MODEL_OPTIONS = [
  { value: '', label: 'Gemini 3.5 Flash-Lite — الافتراضي، سريع' },
  { value: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash — متوازن' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (معاينة) — الأقوى، أبطأ' },
];

export function getModel(): string {
  try {
    const model = localStorage.getItem(MODEL_STORAGE_KEY) ?? '';
    return MODEL_OPTIONS.some(o => o.value === model) ? model : '';
  } catch {
    return '';
  }
}

export function setModel(model: string): void {
  try {
    if (model) localStorage.setItem(MODEL_STORAGE_KEY, model);
    else localStorage.removeItem(MODEL_STORAGE_KEY);
  } catch {
    // storage blocked: the choice just won't persist
  }
}

export const modelLabel = (model: string) => MODEL_OPTIONS.find(o => o.value === model)?.label ?? MODEL_OPTIONS[0].label;

// The key and model headers for an /api/* request
function aiHeaders(key: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers[API_KEY_HEADER] = key.trim();
  const model = getModel();
  if (model) headers[MODEL_HEADER] = model;
  return headers;
}

// "AIza...x7Kq"
export function maskKey(key: string): string {
  return key.length <= 8 ? '•'.repeat(key.length) : `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
}

export function getMaskedKey(): string {
  const key = getApiKey();
  return key ? maskKey(key) : '';
}

export async function callApiWithKey<T = any>(endpoint: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(endpoint, { method: 'POST', headers: aiHeaders(getApiKey()), body: JSON.stringify(body), signal });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || `API error: ${res.status}`);
  }
  return res.json();
}

// ---- Connection checks (/api/key-check) ---------------------------------------

export async function fetchServerHasKey(): Promise<boolean> {
  try {
    const res = await fetch('/api/key-check');
    if (!res.ok) return false;
    return Boolean((await res.json()).serverKey);
  } catch {
    return false;
  }
}

export interface KeyTestResult {
  valid: boolean;
  source: 'header' | 'env' | null;
  error?: string;
}

// Tests `key` (or, without one, the server's key) with a tiny "ping" message.
export async function testApiKey(key: string | null): Promise<KeyTestResult> {
  try {
    const res = await fetch('/api/key-check', { method: 'POST', headers: aiHeaders(key), body: '{}' });
    const data = await res.json().catch(() => ({}));
    return { valid: Boolean(data.valid), source: data.source ?? null, error: data.error ?? (res.ok ? undefined : `HTTP ${res.status}`) };
  } catch (e) {
    return { valid: false, source: null, error: e instanceof Error ? e.message : String(e) };
  }
}
