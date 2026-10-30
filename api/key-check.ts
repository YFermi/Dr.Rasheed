// GET  /api/key-check — does the server have its own GEMINI_API_KEY? (never returns it)
// POST /api/key-check — validates the key that would be used for this request
//   (the X-Gemini-Api-Key header, else the server's key) with countTokens: free,
//   fast, and it fails only on the key itself, unlike a full generation.

import { GoogleGenAI } from '@google/genai';
import { type ApiRequest, type ApiResponse, resolveApiKey, articleModel } from './_lib/gemini.js';

const TIMEOUT_MS = 10_000;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({ serverKey: Boolean(process.env.GEMINI_API_KEY) });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const resolved = resolveApiKey(req);
  if (!resolved) return res.status(200).json({ valid: false, source: null, error: 'Missing GEMINI_API_KEY' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const ai = new GoogleGenAI({ apiKey: resolved.key });
    await ai.models.countTokens({ model: articleModel(), contents: 'اختبار', config: { abortSignal: controller.signal } });
    return res.status(200).json({ valid: true, source: resolved.source });
  } catch (error) {
    if (controller.signal.aborted) {
      return res.status(504).json({ valid: false, source: resolved.source, error: 'انتهت مهلة الاتصال بخدمة Gemini' });
    }
    // Gemini rejects a bad key with 400 (API_KEY_INVALID) or 403
    const message = error instanceof Error ? error.message : String(error);
    const keyRejected = /API key not valid|API_KEY_INVALID|PERMISSION_DENIED|"code":\s*40[03]/i.test(message);
    return res.status(keyRejected ? 200 : 502).json({
      valid: false,
      source: resolved.source,
      error: keyRejected ? 'المفتاح غير صالح' : message.slice(0, 200),
    });
  } finally {
    clearTimeout(timer);
  }
}
