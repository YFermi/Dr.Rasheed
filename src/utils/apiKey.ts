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

// "AIza...x7Kq"
export function maskKey(key: string): string {
  return key.length <= 8 ? '•'.repeat(key.length) : `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
}

export function getMaskedKey(): string {
  const key = getApiKey();
  return key ? maskKey(key) : '';
}

export async function callApiWithKey<T = any>(endpoint: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const apiKey = getApiKey();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers[API_KEY_HEADER] = apiKey;

  const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal });
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
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers[API_KEY_HEADER] = key.trim();
  try {
    const res = await fetch('/api/key-check', { method: 'POST', headers, body: '{}' });
    const data = await res.json().catch(() => ({}));
    return { valid: Boolean(data.valid), source: data.source ?? null, error: data.error ?? (res.ok ? undefined : `HTTP ${res.status}`) };
  } catch (e) {
    return { valid: false, source: null, error: e instanceof Error ? e.message : String(e) };
  }
}
